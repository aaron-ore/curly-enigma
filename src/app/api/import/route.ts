import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { applyTestFilter, parsePayPilotAmount } from "@/lib/test-filter";

// POST /api/import — upload and parse a PayPilot export
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

    // Process each row: parse amounts, apply test filter, insert
    const results = {
      total: rows.length,
      auto_excluded: 0,
      review_flagged: 0,
      active: 0,
      unmapped: [] as string[],
    };

    for (const row of rows) {
      const purchaseAmount = parsePayPilotAmount(row.purchase_amount);
      const refundAmount = parsePayPilotAmount(row.refund_amount);
      const merchantReceivable = parsePayPilotAmount(row.merchant_receivable);
      const purchaseQty = parseInt(row.purchase_qty) || 0;
      const refundQty = parseInt(row.refund_qty) || 0;

      // Apply test filter
      const filterResult = applyTestFilter({
        store_name: row.store_name || "",
        terminal_sn: row.terminal_sn || "",
        purchase_qty: purchaseQty,
        purchase_amount: purchaseAmount,
        refund_qty: refundQty,
        refund_amount: Math.abs(refundAmount),
        merchant_receivable: merchantReceivable,
      });

      if (filterResult.test_flag === "auto_excluded") results.auto_excluded++;
      else if (filterResult.test_flag === "review_full_refund") results.review_flagged++;
      else results.active++;

      // Check terminal mapping
      const mapRes = await query(
        `SELECT client_id FROM terminal_client_map
         WHERE terminal_id = $1
         AND effective_start <= $2
         AND (effective_end IS NULL OR effective_end >= $2)
         LIMIT 1`,
        [row.terminal_sn, billing_month]
      );

      if (mapRes.rows.length === 0 && filterResult.test_flag !== "auto_excluded") {
        results.unmapped.push(row.terminal_sn);
      }

      // Insert transaction row
      await query(
        `INSERT INTO paypilot_transactions
         (import_id, store_name, store_type, terminal_sn, purchase_qty, purchase_amount,
          refund_qty, refund_amount, discount, fee, vat, merchant_receivable,
          test_flag, included_in_active_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          importId,
          row.store_name || null,
          row.store_type || null,
          row.terminal_sn,
          purchaseQty,
          purchaseAmount,
          refundQty,
          Math.abs(refundAmount),
          parsePayPilotAmount(row.discount),
          parsePayPilotAmount(row.fee),
          parsePayPilotAmount(row.vat),
          merchantReceivable,
          filterResult.test_flag,
          filterResult.included_in_active_count,
        ]
      );
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
