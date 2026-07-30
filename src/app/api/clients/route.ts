import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/clients — list all clients with their current rate plan summary
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    let sql = `
      SELECT c.*,
        parent.name as parent_name,
        rp.pricing_model,
        rp.flat_rate,
        rp.tier_1_rate,
        rp.tier_1_unit_count,
        rp.tier_2_rate,
        rp.cap_amount,
        rp.cap_scope
      FROM clients c
      LEFT JOIN clients parent ON parent.id = c.parent_client_id
      LEFT JOIN LATERAL (
        SELECT * FROM rate_plans
        WHERE client_id = c.id
        AND effective_start <= CURRENT_DATE
        AND (effective_end IS NULL OR effective_end >= CURRENT_DATE)
        ORDER BY effective_start DESC
        LIMIT 1
      ) rp ON true
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      sql += ` AND c.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND c.name ILIKE $${params.length}`;
    }

    sql += ` ORDER BY c.name ASC`;

    const result = await query(sql, params);
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch clients", detail: error.message },
      { status: 500 }
    );
  }
}

// POST /api/clients — create a new client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, status, billing_type, payment_method, parent_client_id, notes } = body;

    if (!name) {
      return NextResponse.json({ error: "Client name is required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO clients (name, status, billing_type, payment_method, parent_client_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        name,
        status || "active",
        billing_type || "manual",
        payment_method || "other",
        parent_client_id || null,
        notes || null,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create client", detail: error.message },
      { status: 500 }
    );
  }
}
