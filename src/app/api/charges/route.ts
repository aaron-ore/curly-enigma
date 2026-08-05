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
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    let sql = `
      SELECT ch.*, cl.name as client_name, cl.billing_type
      FROM charges ch
      JOIN clients cl ON cl.id = ch.client_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== "overdue") {
      params.push(status);
      sql += ` AND ch.status = $${params.length}`;
    }
    if (status === "overdue") {
      // Overdue = pending for more than 60 days
      sql += ` AND ch.status = 'pending' AND ch.billing_month < NOW() - INTERVAL '60 days'`;
    }
    if (month) {
      params.push(month);
      sql += ` AND ch.billing_month = $${params.length}`;
    }
    if (dateFrom) {
      params.push(dateFrom);
      sql += ` AND ch.billing_month >= $${params.length}`;
    }
    if (dateTo) {
      params.push(dateTo);
      sql += ` AND ch.billing_month <= $${params.length}`;
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

    // Mark overdue in response: pending charges older than 60 days
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const rows = result.rows.map((row: any) => {
      if (row.status === "pending" && new Date(row.billing_month) < sixtyDaysAgo) {
        return { ...row, display_status: "overdue" };
      }
      return { ...row, display_status: row.status };
    });

    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch charges", detail: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/charges?id=X — delete a charge and its associated usage_record
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Get charge details first so we can delete the matching usage_record
    const chargeRes = await query(`SELECT client_id, billing_month FROM charges WHERE id = $1`, [id]);
    if (chargeRes.rows.length === 0) {
      return NextResponse.json({ error: "Charge not found" }, { status: 404 });
    }

    const { client_id, billing_month } = chargeRes.rows[0];

    // Delete the charge
    await query(`DELETE FROM charges WHERE id = $1`, [id]);

    // Delete the matching usage_record
    await query(
      `DELETE FROM usage_records WHERE client_id = $1 AND billing_month = $2`,
      [client_id, billing_month]
    );

    // Also delete associated import data if it exists
    const usageRes = await query(
      `SELECT source_import_id FROM usage_records WHERE client_id = $1 AND billing_month = $2`,
      [client_id, billing_month]
    );
    // Usage record already deleted above, but let's clean up any orphan import
    // (transactions cascade-delete from paypilot_imports)
    // Only delete import if no other usage_records reference it
    // For safety, we won't auto-delete imports — they serve as audit trail

    return NextResponse.json({ success: true, deleted_charge_id: parseInt(id) });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to delete charge", detail: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/charges — update charge status or override amounts
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
      // Override fields
      override_total,
      override_units,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Handle manual override of calculated_total and/or active_units
    if (override_total !== undefined || override_units !== undefined) {
      const existing = await query(`SELECT client_id, billing_month FROM charges WHERE id = $1`, [id]);
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: "Charge not found" }, { status: 404 });
      }
      const { client_id, billing_month } = existing.rows[0];

      if (override_total !== undefined) {
        // Update charge calculated_total
        await query(
          `UPDATE charges SET calculated_total = $1, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3`,
          [override_total, notes || "Manual override", id]
        );
        // Update usage_record calculated_total
        await query(
          `UPDATE usage_records SET calculated_total = $1, source = 'imported_overridden', updated_at = NOW()
           WHERE client_id = $2 AND billing_month = $3::date`,
          [override_total, client_id, billing_month]
        );
      }

      if (override_units !== undefined) {
        await query(
          `UPDATE usage_records SET active_units = $1, source = 'imported_overridden', updated_at = NOW()
           WHERE client_id = $2 AND billing_month = $3::date`,
          [override_units, client_id, billing_month]
        );
      }

      const updated = await query(`SELECT * FROM charges WHERE id = $1`, [id]);
      return NextResponse.json(updated.rows[0]);
    }

    // Standard status update
    if (!status) {
      return NextResponse.json({ error: "status is required for non-override updates" }, { status: 400 });
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
