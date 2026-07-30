import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Get current billing month (first of current month)
    const now = new Date();
    const billingMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    // Expected revenue: SUM(calculated_total) for non-consolidated clients this month
    const expectedRes = await query(
      `SELECT COALESCE(SUM(c.calculated_total), 0) as total
       FROM charges c
       WHERE c.billing_month = $1 AND c.status != 'consolidated'`,
      [billingMonth]
    );

    // Actual charged: SUM(amount_charged) where status IN (charged, paid)
    const actualRes = await query(
      `SELECT COALESCE(SUM(c.amount_charged), 0) as total
       FROM charges c
       WHERE c.billing_month = $1 AND c.status IN ('charged', 'paid')`,
      [billingMonth]
    );

    // Pending count
    const pendingRes = await query(
      `SELECT COUNT(*) as count FROM charges WHERE billing_month = $1 AND status = 'pending'`,
      [billingMonth]
    );

    // Overdue count
    const overdueRes = await query(
      `SELECT COUNT(*) as count FROM charges WHERE status = 'overdue'`
    );

    // Missing rate config: active clients with no rate_plan covering current month
    const missingRateRes = await query(
      `SELECT COUNT(*) as count FROM clients cl
       WHERE cl.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM rate_plans rp
         WHERE rp.client_id = cl.id
         AND rp.effective_start <= $1
         AND (rp.effective_end IS NULL OR rp.effective_end >= $1)
       )`,
      [billingMonth]
    );

    // No usage this month
    const noUsageRes = await query(
      `SELECT COUNT(*) as count FROM usage_records
       WHERE billing_month = $1 AND active_units = 0`,
      [billingMonth]
    );

    // Recent activity (last 10 charge status changes)
    const recentRes = await query(
      `SELECT ch.id, cl.name as client_name, ch.billing_month,
              ch.status, COALESCE(ch.amount_charged, ch.calculated_total) as amount,
              ch.updated_at
       FROM charges ch
       JOIN clients cl ON cl.id = ch.client_id
       ORDER BY ch.updated_at DESC
       LIMIT 10`
    );

    const expected = parseFloat(expectedRes.rows[0]?.total || "0");
    const actual = parseFloat(actualRes.rows[0]?.total || "0");

    return NextResponse.json({
      expectedRevenue: expected,
      actualCharged: actual,
      variance: expected - actual,
      pendingCount: parseInt(pendingRes.rows[0]?.count || "0"),
      overdueCount: parseInt(overdueRes.rows[0]?.count || "0"),
      missingRateCount: parseInt(missingRateRes.rows[0]?.count || "0"),
      noUsageCount: parseInt(noUsageRes.rows[0]?.count || "0"),
      recentActivity: recentRes.rows,
    });
  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data", detail: error.message },
      { status: 500 }
    );
  }
}
