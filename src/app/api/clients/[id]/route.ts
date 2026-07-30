import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/clients/[id] — get single client with rate plans and usage history
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = parseInt(params.id);

    // Get client
    const clientRes = await query(
      `SELECT c.*, parent.name as parent_name
       FROM clients c
       LEFT JOIN clients parent ON parent.id = c.parent_client_id
       WHERE c.id = $1`,
      [clientId]
    );

    if (clientRes.rows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get rate plans (newest first)
    const ratePlansRes = await query(
      `SELECT * FROM rate_plans WHERE client_id = $1 ORDER BY effective_start DESC`,
      [clientId]
    );

    // Get usage/charge history
    const historyRes = await query(
      `SELECT ur.billing_month, ur.active_units, ur.source, ur.calculated_total,
              ch.amount_charged, ch.date_charged, ch.status, ch.payment_method_used
       FROM usage_records ur
       LEFT JOIN charges ch ON ch.client_id = ur.client_id AND ch.billing_month = ur.billing_month
       WHERE ur.client_id = $1
       ORDER BY ur.billing_month DESC`,
      [clientId]
    );

    // Get children (if this client is a parent)
    const childrenRes = await query(
      `SELECT id, name, status FROM clients WHERE parent_client_id = $1`,
      [clientId]
    );

    return NextResponse.json({
      ...clientRes.rows[0],
      rate_plans: ratePlansRes.rows,
      history: historyRes.rows,
      children: childrenRes.rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch client", detail: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/clients/[id] — update client
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = parseInt(params.id);
    const body = await request.json();
    const { name, status, billing_type, payment_method, parent_client_id, notes } = body;

    const result = await query(
      `UPDATE clients
       SET name = COALESCE($2, name),
           status = COALESCE($3, status),
           billing_type = COALESCE($4, billing_type),
           payment_method = COALESCE($5, payment_method),
           parent_client_id = $6,
           notes = $7,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [clientId, name, status, billing_type, payment_method, parent_client_id || null, notes]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update client", detail: error.message },
      { status: 500 }
    );
  }
}
