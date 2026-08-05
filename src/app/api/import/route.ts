import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { applyTestFilter, parsePayPilotAmount } from "@/lib/test-filter";

// POST /api/import — upload and parse a PayPilot export for a specific client (batch-optimized)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { client_id, billing_month, imported_by, source_file_name, rows } = body;

    if (!billing_month || !rows || !Array.isArray(rows) || !client_id) {
      return NextResponse.json(
        { error: "client_id, billing_month, and rows array are required" },
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

    // --- Step 2: Cap-review flag ---
    // Check if client has a cap in their rate plan
    // First try exact match for billing month, then fallback to most recent plan
    let rateRes = await query(
      `SELECT cap_amount, cap_scope, flat_rate, tier_1_rate, tier_2_rate, tier_1_unit_count
       FROM rate_plans
       WHERE client_id = $1
         AND effective_start <= $2
         AND (effective_end IS NULL OR effective_end >= $2)
       ORDER BY effective_start DESC LIMIT 1`,
      [client_id, billing_month]
    );
    if (rateRes.rows.length === 0) {
      // Fallback: get the most recent rate plan for this client regardless of date
      rateRes = await query(
        `SELECT cap_amount, cap_scope, flat_rate, tier_1_rate, tier_2_rate, tier_1_unit_count
         FROM rate_plans
         WHERE client_id = $1
         ORDER BY effective_start DESC LIMIT 1`,
        [client_id]
      );
    }

    if (rateRes.rows.length > 0) {
      const rp = rateRes.rows[0];
      const capAmount = parseFloat(rp.cap_amount || "0");

      if (capAmount > 0) {
        // Group active terminals by store name (location)
        const storeTerminals: Record<string, string[]> = {};
        for (const row of parsed) {
          if (row.test_flag === "auto_excluded") continue;
          if (!row.store_name) continue;
          if (!storeTerminals[row.store_name]) storeTerminals[row.store_name] = [];
          storeTerminals[row.store_name].push(row.terminal_sn);
        }

        const flatRate = parseFloat(rp.flat_rate || "0");
        const tier1Rate = parseFloat(rp.tier_1_rate || "0");
        const tier2Rate = parseFloat(rp.tier_2_rate || "0");
        const tier1Count = parseInt(rp.tier_1_unit_count || "0");

        // Flag stores where terminal count would hit/exceed cap
        const capFlaggedTerminals = new Set<string>();
        for (const [, terminals] of Object.entries(storeTerminals)) {
          if (terminals.length <= 1) continue;
          const unitCount = terminals.length;
          let uncappedTotal = 0;
          if (flatRate > 0) {
            uncappedTotal = unitCount * flatRate;
          } else if (tier1Rate > 0) {
            const t1 = Math.min(unitCount, tier1Count || 1);
            const t2 = Math.max(0, unitCount - t1);
            uncappedTotal = t1 * tier1Rate + t2 * tier2Rate;
          }
          if (uncappedTotal >= capAmount) {
            for (const sn of terminals) capFlaggedTerminals.add(sn);
          }
        }

        // Apply cap flags
        for (const row of parsed) {
          if (capFlaggedTerminals.has(row.terminal_sn) && row.test_flag === null) {
            row.test_flag = "review_cap_reached";
          }
        }
      }
    }

    // --- Step 3: Bulk insert transactions (chunks of 100) ---
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

    // --- Step 4: Compute results ---
    let autoExcluded = 0;
    let reviewFlagged = 0;
    let reviewCap = 0;
    let active = 0;

    for (const row of parsed) {
      if (row.test_flag === "auto_excluded") autoExcluded++;
      else if (row.test_flag === "review_full_refund") reviewFlagged++;
      else if (row.test_flag === "review_cap_reached") reviewCap++;
      else active++;
    }

    // --- Step 5: Create/update usage_record for this client + month ---
    // Calculate the billing total using the client's rate plan
    let calculatedTotal = 0;
    if (rateRes.rows.length > 0) {
      const rp = rateRes.rows[0];
      const flatRate = parseFloat(rp.flat_rate || "0");
      const tier1Rate = parseFloat(rp.tier_1_rate || "0");
      const tier2Rate = parseFloat(rp.tier_2_rate || "0");
      const tier1Count = parseInt(rp.tier_1_unit_count || "0");
      const capAmount = parseFloat(rp.cap_amount || "0");
      const capScope = rp.cap_scope || "per_client";

      // Helper: calculate normal rate for N units
      const calcUnits = (n: number) => {
        if (flatRate > 0) return n * flatRate;
        if (tier1Rate > 0) {
          const t1 = Math.min(n, tier1Count || 1);
          const t2 = Math.max(0, n - t1);
          return t1 * tier1Rate + t2 * tier2Rate;
        }
        return 0;
      };

      if (capAmount > 0 && capScope === "per_location") {
        // Per-location cap: group active terminals by store, cap each store independently
        const storeGroups: Record<string, number> = {};
        for (const row of parsed) {
          if (row.test_flag === "auto_excluded") continue;
          if (row.test_flag === "review_full_refund") continue;
          const store = row.store_name || "Unknown";
          storeGroups[store] = (storeGroups[store] || 0) + 1;
        }

        let total = 0;
        for (const [, count] of Object.entries(storeGroups)) {
          const storeTotal = calcUnits(count);
          total += Math.min(storeTotal, capAmount);
        }
        calculatedTotal = Math.round(total * 100) / 100;
      } else {
        // Flat calculation or per-client cap
        calculatedTotal = calcUnits(active);
        if (capAmount > 0 && calculatedTotal > capAmount) {
          calculatedTotal = capAmount;
        }
      }
    }

    // Upsert usage_record
    await query(
      `INSERT INTO usage_records (client_id, billing_month, active_units, source, source_import_id, calculated_total)
       VALUES ($1, $2, $3, 'imported', $4, $5)
       ON CONFLICT (client_id, billing_month)
       DO UPDATE SET active_units = $3, source = 'imported', source_import_id = $4, calculated_total = $5, updated_at = NOW()`,
      [client_id, billing_month, active, importId, calculatedTotal]
    );

    // Upsert charge record (pending)
    await query(
      `INSERT INTO charges (client_id, billing_month, calculated_total, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (client_id, billing_month)
       DO UPDATE SET calculated_total = $3, updated_at = NOW()`,
      [client_id, billing_month, calculatedTotal]
    );

    return NextResponse.json({
      import_id: importId,
      client_id,
      total: parsed.length,
      active,
      auto_excluded: autoExcluded,
      review_flagged: reviewFlagged,
      review_cap: reviewCap,
      calculated_total: calculatedTotal,
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
        `SELECT * FROM paypilot_transactions WHERE import_id = $1
         ORDER BY merchant_receivable ASC`,
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
