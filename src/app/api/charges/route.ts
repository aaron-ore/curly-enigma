import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/charges — list charges with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const month = searchParams.get("month");
    const clientId = searchParams.get("client_id");
    const paymentMethod = searchParams.get("payment_method");

    let sql = `
      SELECT ch.*, cl.name as client_name, cl.billing_type
      FROM charges ch
      JOIN clients cl ON cl.id = ch.client_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      sql += ` AND ch.status = $${params.length}`;
    }
    if (month) {
      params.push(month);
      sql += ` AND ch.billing_month = $${params.length}`;
    }
    if (clientId) {
      params.push(clientId);
      sql += ` AND ch.client_id = $${params.length}`;
    }
    if (paymentMethod) {
      params.push(paymentMethod);
      sql += ` AND ch.payment_method_used = $${params.length}`;
    }

    sql += ` ORDER BY ch.billing_month DESC, cl.name ASC`;

    const result = await query(sql, params);
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch charges", detail: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/charges — update charge status (pending -> charged -> paid, etc.)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      status,
      amount_charged,
      date_charged,
      payment_method_used,
      variance_reason,
      amount_received,
      date_received,
      notes,
    } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    // If amount_charged differs from calculated_total and no variance_reason, require it
    if (amount_charged !== undefined) {
      const existing = await query(`SELECT calculated_total FROM charges WHERE id = $1`, [id]);
      if (existing.rows.length > 0) {
        const calcTotal = parseFloat(existing.rows[0].calculated_total);
        if (Math.abs(amount_charged - calcTotal) > 0.01 && !variance_reason) {
          return NextResponse.json(
            { error: "variance_reason required when amount_charged differs from calculated_total" },
            { status: 400 }
          );
        }
      }
    }

    const result = await query(
      `UPDATE charges
       SET status = $2,
           amount_charged = COALESCE($3, amount_charged),
           date_charged = COALESCE($4, date_charged),
           payment_method_used = COALESCE($5, payment_method_used),
           variance_reason = COALESCE($6, variance_reason),
           amount_received = COALESCE($7, amount_received),
           date_received = COALESCE($8, date_received),
           notes = COALESCE($9, notes),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, amount_charged, date_charged, payment_method_used, variance_reason, amount_received, date_received, notes]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Charge not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update charge", detail: error.message },
      { status: 500 }
    );
  }
}
