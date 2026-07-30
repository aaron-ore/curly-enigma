import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/export?type=spreadsheet|accounting|raw&start=YYYY-MM-DD&end=YYYY-MM-DD&status=...
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const exportType = searchParams.get("type") || "spreadsheet";
    const startMonth = searchParams.get("start");
    const endMonth = searchParams.get("end");
    const status = searchParams.get("status");

    let data: any[];

    if (exportType === "spreadsheet") {
      // Mirror original sheet layout: Client, Rate, Month, Active Units, Total, Note, Cap, Date Charged, Amount Charged
      let sql = `
        SELECT cl.name as "Client",
               CASE
                 WHEN rp.pricing_model = 'flat_per_unit' THEN rp.flat_rate::text
                 WHEN rp.pricing_model = 'tiered_per_unit' THEN
                   rp.tier_1_rate::text || '/' || rp.tier_2_rate::text
                 ELSE ''
               END as "Rate",
               TO_CHAR(ur.billing_month, 'Mon YYYY') as "Month",
               ur.active_units as "Active Units",
               ur.calculated_total as "Total",
               rp.notes as "Note",
               CASE WHEN rp.cap_amount IS NOT NULL
                 THEN '$' || rp.cap_amount::text || '/' || COALESCE(rp.cap_scope::text, 'client')
                 ELSE ''
               END as "Cap",
               ch.date_charged as "Date Charged",
               ch.amount_charged as "Amount Charged"
        FROM usage_records ur
        JOIN clients cl ON cl.id = ur.client_id
        LEFT JOIN charges ch ON ch.client_id = ur.client_id AND ch.billing_month = ur.billing_month
        LEFT JOIN LATERAL (
          SELECT * FROM rate_plans
          WHERE client_id = ur.client_id
          AND effective_start <= ur.billing_month
          AND (effective_end IS NULL OR effective_end >= ur.billing_month)
          ORDER BY effective_start DESC LIMIT 1
        ) rp ON true
        WHERE 1=1
      `;
      const params: any[] = [];
      if (startMonth) { params.push(startMonth); sql += ` AND ur.billing_month >= $${params.length}`; }
      if (endMonth) { params.push(endMonth); sql += ` AND ur.billing_month <= $${params.length}`; }
      sql += ` ORDER BY cl.name, ur.billing_month`;

      const result = await query(sql, params);
      data = result.rows;

    } else if (exportType === "accounting") {
      // One row per charge, flattened
      let sql = `
        SELECT cl.name as "Client",
               TO_CHAR(ch.billing_month, 'Mon YYYY') as "Billing Month",
               ch.calculated_total as "Calculated Total",
               ch.amount_charged as "Amount Charged",
               ch.date_charged as "Date Charged",
               ch.payment_method_used as "Payment Method",
               ch.status as "Status",
               ch.variance_reason as "Variance Reason"
        FROM charges ch
        JOIN clients cl ON cl.id = ch.client_id
        WHERE ch.status != 'consolidated'
      `;
      const params: any[] = [];
      if (startMonth) { params.push(startMonth); sql += ` AND ch.billing_month >= $${params.length}`; }
      if (endMonth) { params.push(endMonth); sql += ` AND ch.billing_month <= $${params.length}`; }
      if (status) { params.push(status); sql += ` AND ch.status = $${params.length}`; }
      sql += ` ORDER BY ch.billing_month DESC, cl.name`;

      const result = await query(sql, params);
      data = result.rows;

    } else if (exportType === "raw") {
      // Raw paypilot_transactions for a given month
      const month = startMonth;
      if (!month) {
        return NextResponse.json({ error: "start month required for raw export" }, { status: 400 });
      }
      const result = await query(
        `SELECT pt.*, pi.billing_month, tcm.client_id, cl.name as client_name
         FROM paypilot_transactions pt
         JOIN paypilot_imports pi ON pi.id = pt.import_id
         LEFT JOIN terminal_client_map tcm ON tcm.terminal_id = pt.terminal_sn
           AND tcm.effective_start <= pi.billing_month
           AND (tcm.effective_end IS NULL OR tcm.effective_end >= pi.billing_month)
         LEFT JOIN clients cl ON cl.id = tcm.client_id
         WHERE pi.billing_month = $1
         ORDER BY pt.terminal_sn`,
        [month]
      );
      data = result.rows;

    } else {
      return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
    }

    // Return as JSON (client-side will convert to CSV/XLSX)
    return NextResponse.json({ type: exportType, rows: data, count: data.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to generate export", detail: error.message },
      { status: 500 }
    );
  }
}
