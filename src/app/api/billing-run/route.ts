import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { calculateTotal, findActiveRatePlan, RatePlan } from "@/lib/calc-engine";

// GET /api/billing-run?month=2026-07-01 — get billing run grid for a month
export async function GET(request: NextRequest) {
  try {
    const billingMonth = request.nextUrl.searchParams.get("month");
    if (!billingMonth) {
      return NextResponse.json({ error: "month parameter required (YYYY-MM-DD)" }, { status: 400 });
    }

    // Get all active clients (exclude children from primary list, nest them)
    const clientsRes = await query(
      `SELECT c.id, c.name, c.status, c.billing_type, c.payment_method,
              c.parent_client_id, parent.name as parent_name
       FROM clients c
       LEFT JOIN clients parent ON parent.id = c.parent_client_id
       WHERE c.status = 'active'
       ORDER BY c.parent_client_id NULLS FIRST, c.name`
    );

    // Get all rate plans for active clients
    const ratePlansRes = await query(
      `SELECT * FROM rate_plans WHERE client_id IN (
         SELECT id FROM clients WHERE status = 'active'
       )`
    );

    // Get existing usage records for this month (if any)
    const usageRes = await query(
      `SELECT * FROM usage_records WHERE billing_month = $1`,
      [billingMonth]
    );

    // Get imported active_units from latest import for this month
    const importedUnitsRes = await query(
      `SELECT tcm.client_id, COUNT(*) as active_count
       FROM paypilot_transactions pt
       JOIN paypilot_imports pi ON pi.id = pt.import_id
       JOIN terminal_client_map tcm ON tcm.terminal_id = pt.terminal_sn
         AND tcm.effective_start <= $1
         AND (tcm.effective_end IS NULL OR tcm.effective_end >= $1)
       WHERE pi.billing_month = $1
         AND pt.included_in_active_count = true
       GROUP BY tcm.client_id`,
      [billingMonth]
    );

    // Build grid rows
    const ratePlansByClient: Record<number, RatePlan[]> = {};
    for (const rp of ratePlansRes.rows) {
      if (!ratePlansByClient[rp.client_id]) ratePlansByClient[rp.client_id] = [];
      ratePlansByClient[rp.client_id].push(rp);
    }

    const usageByClient: Record<number, any> = {};
    for (const ur of usageRes.rows) {
      usageByClient[ur.client_id] = ur;
    }

    const importedByClient: Record<number, number> = {};
    for (const row of importedUnitsRes.rows) {
      importedByClient[row.client_id] = parseInt(row.active_count);
    }

    const grid = clientsRes.rows.map((client: any) => {
      const clientRatePlans = ratePlansByClient[client.id] || [];
      const activeRatePlan = findActiveRatePlan(clientRatePlans, billingMonth);
      const existingUsage = usageByClient[client.id];
      const importedUnits = importedByClient[client.id];

      // Determine active_units: existing usage > imported > 0
      let activeUnits = 0;
      let source: "imported" | "manual" | "imported_overridden" = "manual";

      if (existingUsage) {
        activeUnits = existingUsage.active_units;
        source = existingUsage.source;
      } else if (importedUnits !== undefined) {
        activeUnits = importedUnits;
        source = "imported";
      }

      // Calculate total
      let calculatedTotal = 0;
      let calcError: string | undefined;

      if (activeRatePlan && activeUnits > 0) {
        const result = calculateTotal({ activeUnits, ratePlan: activeRatePlan });
        calculatedTotal = result.total;
        calcError = result.error;
      }

      return {
        client_id: client.id,
        client_name: client.name,
        billing_type: client.billing_type,
        parent_client_id: client.parent_client_id,
        parent_name: client.parent_name,
        active_units: activeUnits,
        source,
        has_rate_plan: !!activeRatePlan,
        rate_summary: activeRatePlan
          ? formatRateSummary(activeRatePlan)
          : "No rate configured",
        calculated_total: calculatedTotal,
        calc_error: calcError,
        is_consolidated: !!client.parent_client_id,
      };
    });

    return NextResponse.json({ billing_month: billingMonth, grid });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to load billing run", detail: error.message },
      { status: 500 }
    );
  }
}

// POST /api/billing-run — finalize a billing run (writes usage_records + charges)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { billing_month, entries } = body;

    if (!billing_month || !entries || !Array.isArray(entries)) {
      return NextResponse.json(
        { error: "billing_month and entries array required" },
        { status: 400 }
      );
    }

    let created = 0;
    for (const entry of entries) {
      const { client_id, active_units, source, calculated_total, is_consolidated } = entry;

      // Upsert usage_record
      await query(
        `INSERT INTO usage_records (client_id, billing_month, active_units, source, calculated_total)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id, billing_month)
         DO UPDATE SET active_units = $3, source = $4, calculated_total = $5, updated_at = NOW()`,
        [client_id, billing_month, active_units, source || "manual", calculated_total || 0]
      );

      // Upsert charge
      const chargeStatus = is_consolidated ? "consolidated" : (active_units === 0 ? "waived" : "pending");
      await query(
        `INSERT INTO charges (client_id, billing_month, calculated_total, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id, billing_month)
         DO UPDATE SET calculated_total = $3, status = $4, updated_at = NOW()`,
        [client_id, billing_month, calculated_total || 0, chargeStatus]
      );

      created++;
    }

    return NextResponse.json({ finalized: created, billing_month });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to finalize billing run", detail: error.message },
      { status: 500 }
    );
  }
}

function formatRateSummary(rp: RatePlan): string {
  if (rp.pricing_model === "flat_per_unit") {
    let s = `$${rp.flat_rate}/unit`;
    if (rp.cap_amount) s += ` (cap: $${rp.cap_amount})`;
    return s;
  }
  let s = `$${rp.tier_1_rate} x${rp.tier_1_unit_count}, then $${rp.tier_2_rate}`;
  if (rp.cap_amount) s += ` (cap: $${rp.cap_amount})`;
  return s;
}
