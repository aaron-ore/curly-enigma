import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// POST /api/rate-plans — create a new rate plan for a client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      client_id,
      effective_start,
      effective_end,
      pricing_model,
      flat_rate,
      tier_1_rate,
      tier_1_unit_count,
      tier_2_rate,
      cap_amount,
      cap_scope,
      notes,
    } = body;

    if (!client_id || !effective_start || !pricing_model) {
      return NextResponse.json(
        { error: "client_id, effective_start, and pricing_model are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO rate_plans
       (client_id, effective_start, effective_end, pricing_model, flat_rate,
        tier_1_rate, tier_1_unit_count, tier_2_rate, cap_amount, cap_scope, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        client_id,
        effective_start,
        effective_end || null,
        pricing_model,
        flat_rate || null,
        tier_1_rate || null,
        tier_1_unit_count || null,
        tier_2_rate || null,
        cap_amount || null,
        cap_scope || null,
        notes || null,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create rate plan", detail: error.message },
      { status: 500 }
    );
  }
}
