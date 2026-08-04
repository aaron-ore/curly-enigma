import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// POST /api/import/map-terminal — create a terminal-to-client mapping
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { terminal_id, client_id, effective_start } = body;

    if (!terminal_id || !client_id || !effective_start) {
      return NextResponse.json(
        { error: "terminal_id, client_id, and effective_start are required" },
        { status: 400 }
      );
    }

    // Check if mapping already exists
    const existing = await query(
      `SELECT id FROM terminal_client_map
       WHERE terminal_id = $1 AND client_id = $2
       AND effective_start = $3`,
      [terminal_id, client_id, effective_start]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({ id: existing.rows[0].id, status: "already_exists" });
    }

    // End any existing active mapping for this terminal
    await query(
      `UPDATE terminal_client_map
       SET effective_end = $2
       WHERE terminal_id = $1
       AND effective_end IS NULL`,
      [terminal_id, effective_start]
    );

    // Create new mapping
    const result = await query(
      `INSERT INTO terminal_client_map (terminal_id, client_id, effective_start)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [terminal_id, client_id, effective_start]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to map terminal", detail: error.message },
      { status: 500 }
    );
  }
}
