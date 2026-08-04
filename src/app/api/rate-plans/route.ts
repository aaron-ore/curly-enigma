import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// DELETE /api/rate-plans?id=123 — delete a rate plan
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id parameter required" }, { status: 400 });
    }

    const result = await query("DELETE FROM rate_plans WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Rate plan not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: result.rows[0].id });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to delete rate plan", detail: error.message },
      { status: 500 }
    );
  }
}

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

// PUT /api/rate-plans — update an existing rate plan
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
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

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const result = await query(
      `UPDATE rate_plans
       SET effective_start = COALESCE($2, effective_start),
           effective_end = $3,
           pricing_model = COALESCE($4, pricing_model),
           flat_rate = $5,
           tier_1_rate = $6,
           tier_1_unit_count = $7,
           tier_2_rate = $8,
           cap_amount = $9,
           cap_scope = $10,
           notes = $11
       WHERE id = $1
       RETURNING *`,
      [
        id,
        effective_start || null,
        effective_end || null,
        pricing_model || null,
        flat_rate !== undefined ? flat_rate : null,
        tier_1_rate !== undefined ? tier_1_rate : null,
        tier_1_unit_count !== undefined ? tier_1_unit_count : null,
        tier_2_rate !== undefined ? tier_2_rate : null,
        cap_amount !== undefined ? cap_amount : null,
        cap_scope || null,
        notes !== undefined ? notes : null,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Rate plan not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update rate plan", detail: error.message },
      { status: 500 }
    );
  }
}
