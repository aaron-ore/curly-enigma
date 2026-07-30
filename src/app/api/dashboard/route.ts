import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Total outstanding (all pending charges)
    const outstandingRes = await query(
      `SELECT COALESCE(SUM(calculated_total), 0) as total
       FROM charges WHERE status = 'pending'`
    );

    // Total paid (all time)
    const paidRes = await query(
      `SELECT COALESCE(SUM(amount_charged), 0) as total
       FROM charges WHERE status = 'paid'`
    );

    // Count of clients with pending charges
    const pendingCountRes = await query(
      `SELECT COUNT(DISTINCT client_id) as count FROM charges WHERE status = 'pending'`
    );

    // Missing rate config: active clients with no rate_plan
    const missingRateRes = await query(
      `SELECT COUNT(*) as count FROM clients cl
       WHERE cl.status = 'active' AND cl.parent_client_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM rate_plans rp WHERE rp.client_id = cl.id
       )`
    );

    // Client summaries: outstanding by client (only clients with pending balance)
    const clientSummariesRes = await query(
      `SELECT
         cl.id as client_id,
         cl.name as client_name,
         COALESCE(SUM(ch.calculated_total), 0) as total_owed,
         COALESCE(SUM(CASE WHEN ch.status = 'paid' THEN ch.amount_charged ELSE 0 END), 0) as total_paid,
         COALESCE(SUM(CASE WHEN ch.status = 'pending' THEN ch.calculated_total ELSE 0 END), 0) as outstanding,
         COUNT(CASE WHEN ch.status = 'pending' THEN 1 END) as months_unpaid
       FROM clients cl
       JOIN charges ch ON ch.client_id = cl.id
       WHERE cl.parent_client_id IS NULL
       GROUP BY cl.id, cl.name
       HAVING SUM(CASE WHEN ch.status = 'pending' THEN ch.calculated_total ELSE 0 END) > 0
       ORDER BY outstanding DESC`
    );

    return NextResponse.json({
      totalOutstanding: parseFloat(outstandingRes.rows[0]?.total || "0"),
      totalPaid: parseFloat(paidRes.rows[0]?.total || "0"),
      expectedRevenue: parseFloat(outstandingRes.rows[0]?.total || "0") + parseFloat(paidRes.rows[0]?.total || "0"),
      pendingCount: parseInt(pendingCountRes.rows[0]?.count || "0"),
      overdueCount: 0,
      missingRateCount: parseInt(missingRateRes.rows[0]?.count || "0"),
      noUsageCount: 0,
      clientSummaries: clientSummariesRes.rows.map((r: any) => ({
        client_id: r.client_id,
        client_name: r.client_name,
        total_owed: parseFloat(r.total_owed),
        total_paid: parseFloat(r.total_paid),
        outstanding: parseFloat(r.outstanding),
        months_unpaid: parseInt(r.months_unpaid),
      })),
    });
  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data", detail: error.message },
      { status: 500 }
    );
  }
}
