import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { applyTestFilter, parsePayPilotAmount } from "@/lib/test-filter";

// POST /api/import — upload and parse a PayPilot export (batch-optimized)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { billing_month, imported_by, source_file_name, rows } = body;

    if (!billing_month || !rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "billing_month and rows array are required" },
        { status: 400 }
      );
    }

    // Create import batch
    const importRes = await query(
      `INSERT INTO paypilot_imports (billing_month, imported_by, source_file_name, row_count)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [billing_month, imported_by || "system", source_file_name || "upload", rows.length]
    );
    const importId = importRes.rows[0].id;

    // --- Step 1: Parse all rows and apply test filter in memory ---
    interface ParsedRow {
      store_name: string;
      store_type: string;
      terminal_sn: string;
      purchase_qty: number;
      purchase_amount: number;
      refund_qty: number;
      refund_amount: number;
      discount: number;
      fee: number;
      vat: number;
      merchant_receivable: number;
      test_flag: string | null;
      included_in_active_count: boolean;
    }

    const parsed: ParsedRow[] = [];
    for (const row of rows) {
      const purchaseAmount = parsePayPilotAmount(row.purchase_amount);
      const refundAmount = parsePayPilotAmount(row.refund_amount);
      const merchantReceivable = parsePayPilotAmount(row.merchant_receivable);
      const purchaseQty = parseInt(row.purchase_qty) || 0;
      const refundQty = parseInt(row.refund_qty) || 0;

      const filterResult = applyTestFilter({
        store_name: row.store_name || "",
        terminal_sn: row.terminal_sn || "",
        purchase_qty: purchaseQty,
        purchase_amount: purchaseAmount,
        refund_qty: refundQty,
        refund_amount: Math.abs(refundAmount),
        merchant_receivable: merchantReceivable,
      });

      parsed.push({
        store_name: row.store_name || "",
        store_type: row.store_type || "",
        terminal_sn: String(row.terminal_sn),
        purchase_qty: purchaseQty,
        purchase_amount: purchaseAmount,
        refund_qty: refundQty,
        refund_amount: Math.abs(refundAmount),
        discount: parsePayPilotAmount(row.discount),
        fee: parsePayPilotAmount(row.fee),
        vat: parsePayPilotAmount(row.vat),
        merchant_receivable: merchantReceivable,
        test_flag: filterResult.test_flag,
        included_in_active_count: filterResult.included_in_active_count,
      });
    }

    // --- Step 2: Bulk terminal mapping lookup ---
    const allTerminals = Array.from(new Set(parsed.map((r) => r.terminal_sn)));
    const mappedTerminals = new Set<string>();

    // Query in chunks of 500 to avoid query size limits
    for (let i = 0; i < allTerminals.length; i += 500) {
      const chunk = allTerminals.slice(i, i + 500);
      const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(",");
      const mapRes = await query(
        `SELECT DISTINCT terminal_id FROM terminal_client_map
         WHERE terminal_id IN (${placeholders})
         AND effective_start <= $1
         AND (effective_end IS NULL OR effective_end >= $1)`,
        [billing_month, ...chunk]
      );
      for (const r of mapRes.rows) {
        mappedTerminals.add(r.terminal_id);
      }
    }

    // --- Step 3: Cap-review flag ---
    // Group active (non-excluded) terminals by store name, then check if their
    // count would trigger a cap for the mapped client
    const storeTerminals: Record<string, string[]> = {};
    for (const row of parsed) {
      if (row.test_flag === "auto_excluded") continue;
      if (!row.store_name) continue;
      if (!storeTerminals[row.store_name]) storeTerminals[row.store_name] = [];
      storeTerminals[row.store_name].push(row.terminal_sn);
    }

    // For stores with multiple terminals, check if any mapped client has a cap
    const capFlaggedTerminals = new Set<string>();
    const storesWithMultiple = Object.entries(storeTerminals).filter(([, t]) => t.length > 1);

    if (storesWithMultiple.length > 0) {
      // Get all terminal SNs from multi-terminal stores that are mapped
      const multiStoreTerminals: string[] = [];
      for (const [, terminals] of storesWithMultiple) {
        for (const sn of terminals) {
          if (mappedTerminals.has(sn)) multiStoreTerminals.push(sn);
        }
      }

      // Bulk lookup: terminal → client_id + rate plan cap
      if (multiStoreTerminals.length > 0) {
        const clientCapMap: Record<number, { cap_amount: number; flat_rate: number; tier_1_rate: number; tier_2_rate: number; tier_1_unit_count: number }> = {};

        // Get unique client IDs for mapped terminals
        for (let i = 0; i < multiStoreTerminals.length; i += 500) {
          const chunk = multiStoreTerminals.slice(i, i + 500);
          const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(",");
          const res = await query(
            `SELECT DISTINCT tcm.client_id, rp.cap_amount, rp.flat_rate, rp.tier_1_rate, rp.tier_2_rate, rp.tier_1_unit_count
             FROM terminal_client_map tcm
             JOIN rate_plans rp ON rp.client_id = tcm.client_id
               AND rp.effective_start <= $1
               AND (rp.effective_end IS NULL OR rp.effective_end >= $1)
             WHERE tcm.terminal_id IN (${placeholders})
               AND tcm.effective_start <= $1
               AND (tcm.effective_end IS NULL OR tcm.effective_end >= $1)
               AND rp.cap_amount IS NOT NULL`,
            [billing_month, ...chunk]
          );
          for (const r of res.rows) {
            clientCapMap[r.client_id] = {
              cap_amount: parseFloat(r.cap_amount),
              flat_rate: parseFloat(r.flat_rate || "0"),
              tier_1_rate: parseFloat(r.tier_1_rate || "0"),
              tier_2_rate: parseFloat(r.tier_2_rate || "0"),
              tier_1_unit_count: parseInt(r.tier_1_unit_count || "0"),
            };
          }
        }

        // Also get terminal → client mapping for multi-store terminals
        const terminalClientLookup: Record<string, number> = {};
        for (let i = 0; i < multiStoreTerminals.length; i += 500) {
          const chunk = multiStoreTerminals.slice(i, i + 500);
          const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(",");
          const res = await query(
            `SELECT terminal_id, client_id FROM terminal_client_map
             WHERE terminal_id IN (${placeholders})
               AND effective_start <= $1
               AND (effective_end IS NULL OR effective_end >= $1)`,
            [billing_month, ...chunk]
          );
          for (const r of res.rows) {
            terminalClientLookup[r.terminal_id] = r.client_id;
          }
        }

        // Now check each multi-terminal store
        for (const [storeName, terminals] of storesWithMultiple) {
          // Find the client for this store (use first mapped terminal)
          let clientId: number | null = null;
          for (const sn of terminals) {
            if (terminalClientLookup[sn]) {
              clientId = terminalClientLookup[sn];
              break;
            }
          }
          if (!clientId || !clientCapMap[clientId]) continue;

          const cap = clientCapMap[clientId];
          const unitCount = terminals.length;

          // Calculate what the billing would be without cap
          let uncappedTotal = 0;
          if (cap.flat_rate > 0) {
            uncappedTotal = unitCount * cap.flat_rate;
          } else if (cap.tier_1_rate > 0) {
            const tier1Units = Math.min(unitCount, cap.tier_1_unit_count || 1);
            const tier2Units = Math.max(0, unitCount - tier1Units);
            uncappedTotal = tier1Units * cap.tier_1_rate + tier2Units * cap.tier_2_rate;
          }

          // If uncapped total >= cap amount, flag all terminals in this store
          if (uncappedTotal >= cap.cap_amount) {
            for (const sn of terminals) {
              capFlaggedTerminals.add(sn);
            }
          }
        }
      }
    }

    // Apply cap flags to parsed rows
    for (const row of parsed) {
      if (capFlaggedTerminals.has(row.terminal_sn) && row.test_flag === null) {
        row.test_flag = "review_cap_reached";
        // Keep included_in_active_count = true, just flag for review
      }
    }

    // --- Step 4: Bulk insert transactions (chunks of 100) ---
    for (let i = 0; i < parsed.length; i += 100) {
      const chunk = parsed.slice(i, i + 100);
      const values: any[] = [];
      const placeholderGroups: string[] = [];

      chunk.forEach((row, idx) => {
        const offset = idx * 14;
        placeholderGroups.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`
        );
        values.push(
          importId,
          row.store_name || null,
          row.store_type || null,
          row.terminal_sn,
          row.purchase_qty,
          row.purchase_amount,
          row.refund_qty,
          row.refund_amount,
          row.discount,
          row.fee,
          row.vat,
          row.merchant_receivable,
          row.test_flag,
          row.included_in_active_count
        );
      });

      await query(
        `INSERT INTO paypilot_transactions
         (import_id, store_name, store_type, terminal_sn, purchase_qty, purchase_amount,
          refund_qty, refund_amount, discount, fee, vat, merchant_receivable,
          test_flag, included_in_active_count)
         VALUES ${placeholderGroups.join(", ")}`,
        values
      );
    }

    // --- Step 5: Compute results ---
    const results = {
      total: parsed.length,
      auto_excluded: 0,
      review_flagged: 0,
      review_cap: 0,
      active: 0,
      unmapped: [] as string[],
      new_clients: [] as { store_name: string; terminals: string[] }[],
    };

    const unmappedByStore: Record<string, Set<string>> = {};

    for (const row of parsed) {
      if (row.test_flag === "auto_excluded") {
        results.auto_excluded++;
      } else if (row.test_flag === "review_full_refund") {
        results.review_flagged++;
      } else if (row.test_flag === "review_cap_reached") {
        results.review_cap++;
      } else {
        results.active++;
      }

      if (!mappedTerminals.has(row.terminal_sn) && row.test_flag !== "auto_excluded") {
        results.unmapped.push(row.terminal_sn);
        const storeName = row.store_name || "Unknown";
        if (!unmappedByStore[storeName]) unmappedByStore[storeName] = new Set();
        unmappedByStore[storeName].add(row.terminal_sn);
      }
    }

    // Check which unmapped store names are truly new
    for (const [storeName, terminals] of Object.entries(unmappedByStore)) {
      const existing = await query(
        `SELECT id FROM clients WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [storeName]
      );
      if (existing.rows.length === 0) {
        results.new_clients.push({
          store_name: storeName,
          terminals: Array.from(terminals),
        });
      }
    }

    return NextResponse.json({
      import_id: importId,
      ...results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to process import", detail: error.message },
      { status: 500 }
    );
  }
}

// GET /api/import?import_id=X — get import details with transactions
export async function GET(request: NextRequest) {
  try {
    const importId = request.nextUrl.searchParams.get("import_id");

    if (importId) {
      const importRes = await query(
        `SELECT * FROM paypilot_imports WHERE id = $1`,
        [importId]
      );
      const txRes = await query(
        `SELECT pt.*, tcm.client_id, c.name as client_name
         FROM paypilot_transactions pt
         LEFT JOIN terminal_client_map tcm ON tcm.terminal_id = pt.terminal_sn
           AND tcm.effective_start <= (SELECT billing_month FROM paypilot_imports WHERE id = $1)
           AND (tcm.effective_end IS NULL OR tcm.effective_end >= (SELECT billing_month FROM paypilot_imports WHERE id = $1))
         LEFT JOIN clients c ON c.id = tcm.client_id
         WHERE pt.import_id = $1
         ORDER BY pt.merchant_receivable ASC`,
        [importId]
      );

      return NextResponse.json({
        import: importRes.rows[0],
        transactions: txRes.rows,
      });
    }

    // List all imports
    const result = await query(
      `SELECT * FROM paypilot_imports ORDER BY imported_at DESC`
    );
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch imports", detail: error.message },
      { status: 500 }
    );
  }
}
