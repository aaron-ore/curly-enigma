import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// PUT /api/import/review — update include/exclude decisions for flagged transactions
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { decisions } = body;

    if (!decisions || !Array.isArray(decisions)) {
      return NextResponse.json(
        { error: "decisions array is required: [{id, included_in_active_count}]" },
        { status: 400 }
      );
    }

    let updated = 0;
    for (const decision of decisions) {
      const result = await query(
        `UPDATE paypilot_transactions
         SET included_in_active_count = $2
         WHERE id = $1`,
        [decision.id, decision.included_in_active_count]
      );
      updated += result.rowCount || 0;
    }

    return NextResponse.json({ updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update review decisions", detail: error.message },
      { status: 500 }
    );
  }
}
