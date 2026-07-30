/**
 * Seed script — populates the database with real client data from the billing sheet.
 * Usage: DATABASE_URL=... node scripts/seed.js
 * 
 * Data source: Client Pricing Form_Software SaaS Fee_Client info.xlsx
 */
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

// Real client data extracted from the billing sheet
const clients = [
  { name: "Universal Processing", billing_type: "manual", payment_method: "other", rate: 1.00, model: "flat_per_unit", start: "2025-05-01" },
  { name: "ZBS POS", billing_type: "manual", payment_method: "other", rate: 2.00, model: "flat_per_unit", start: "2025-05-01", notes: "Rate drops to $1 once volume crosses ~10k units/month" },
  { name: "Ant Fintech", billing_type: "auto_charge", payment_method: "card", rate: 2.00, model: "flat_per_unit", start: "2025-06-01" },
  { name: "MCPOS", billing_type: "manual", payment_method: "other", rate: 2.95, model: "flat_per_unit", start: "2025-05-01" },
  { name: "Icon Payments", billing_type: "manual", payment_method: "other", rate: 2.00, model: "flat_per_unit", start: "2025-11-01" },
  { name: "AARPUS", billing_type: "manual", payment_method: "other", rate: 2.95, model: "flat_per_unit", start: "2025-10-01" },
  { name: "OKMerchat", billing_type: "manual", payment_method: "other", rate: 2.95, model: "flat_per_unit", start: "2025-11-01" },
  { name: "Long Merchants", billing_type: "auto_charge", payment_method: "card", rate: 2.95, model: "flat_per_unit", start: "2025-10-01" },
  { name: "Lianup", billing_type: "manual", payment_method: "other", rate: 2.95, model: "flat_per_unit", start: "2025-12-01", notes: "Rate changed from $2 to $2.95 in Dec 2025" },
  { name: "ABC POS", billing_type: "manual", payment_method: "other", rate: 3.95, model: "flat_per_unit", start: "2025-04-01", cap_amount: 20, cap_scope: "per_client", notes: "$20/same location cap" },
  { name: "Retech Payment", billing_type: "auto_charge", payment_method: "card", rate: 2.95, model: "flat_per_unit", start: "2026-01-01" },
  { name: "FMS", billing_type: "auto_charge", payment_method: "card", model: "tiered_per_unit", start: "2025-04-01", tier_1_rate: 3.95, tier_1_unit_count: 1, tier_2_rate: 2.95, cap_amount: 20, cap_scope: "per_client", notes: "1st: $3.95; 2nd+: $2.95. $20/same location cap. New credit card on file." },
  { name: "Peblla", billing_type: "manual", payment_method: "other", rate: 3.95, model: "flat_per_unit", start: "2025-03-01", parent: "FMS", notes: "Consolidated with FMS" },
  { name: "EBSPOS", billing_type: "auto_charge", payment_method: "card", rate: 2.95, model: "flat_per_unit", start: "2026-05-01" },
  { name: "Wayvvy Payment", billing_type: "manual", payment_method: "other", rate: 3.95, model: "flat_per_unit", start: "2026-05-01" },
  { name: "All-in-One", billing_type: "manual", payment_method: "other", rate: 3.95, model: "flat_per_unit", start: "2026-05-01" },
  { name: "Touch Plus", billing_type: "auto_charge", payment_method: "card", rate: 3.95, model: "flat_per_unit", start: "2026-05-01" },
  { name: "Honor POS", billing_type: "manual", payment_method: "other", rate: null, model: null, start: null, parent: "Icon Payments", notes: "Honor pays with Icon Payments — never billed directly" },
  { name: "Koam", billing_type: "manual", payment_method: "other", rate: null, model: null, start: "2026-06-01", notes: "New client, no activity yet" },
  { name: "UNBS", billing_type: "manual", payment_method: "other", model: "tiered_per_unit", start: "2026-07-01", tier_1_rate: 3.95, tier_1_unit_count: 1, tier_2_rate: 2.95, cap_amount: 20, cap_scope: "per_client", notes: "1st: $3.95; 2nd+: $2.95. $20/same location" },
  { name: "Fides", billing_type: "manual", payment_method: "other", rate: null, model: null, start: "2026-07-01", notes: "New client" },
  { name: "NavyZ", billing_type: "manual", payment_method: "other", model: "tiered_per_unit", start: null, tier_1_rate: 2.95, tier_1_unit_count: 1, tier_2_rate: 1.95, cap_amount: 20, cap_scope: "per_client", notes: "1st: $2.95; 2nd+: $1.95. $20/same location" },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log("Seeding clients and rate plans...");

    // First pass: create all clients (without parent references)
    const clientIds = {};
    for (const c of clients) {
      const res = await client.query(
        `INSERT INTO clients (name, status, billing_type, payment_method, notes)
         VALUES ($1, 'active', $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [c.name, c.billing_type, c.payment_method, c.notes || null]
      );
      if (res.rows.length > 0) {
        clientIds[c.name] = res.rows[0].id;
      } else {
        // Already exists, fetch id
        const existing = await client.query(`SELECT id FROM clients WHERE name = $1`, [c.name]);
        if (existing.rows.length > 0) clientIds[c.name] = existing.rows[0].id;
      }
    }

    // Second pass: set parent_client_id for consolidated accounts
    for (const c of clients) {
      if (c.parent && clientIds[c.parent] && clientIds[c.name]) {
        await client.query(
          `UPDATE clients SET parent_client_id = $1 WHERE id = $2`,
          [clientIds[c.parent], clientIds[c.name]]
        );
      }
    }

    // Third pass: create rate plans
    for (const c of clients) {
      if (!c.model || !c.start || !clientIds[c.name]) continue;

      const ratePlanData = {
        client_id: clientIds[c.name],
        effective_start: c.start,
        pricing_model: c.model,
        flat_rate: c.rate || null,
        tier_1_rate: c.tier_1_rate || null,
        tier_1_unit_count: c.tier_1_unit_count || null,
        tier_2_rate: c.tier_2_rate || null,
        cap_amount: c.cap_amount || null,
        cap_scope: c.cap_scope || null,
        notes: c.notes || null,
      };

      await client.query(
        `INSERT INTO rate_plans (client_id, effective_start, pricing_model, flat_rate, tier_1_rate, tier_1_unit_count, tier_2_rate, cap_amount, cap_scope, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          ratePlanData.client_id,
          ratePlanData.effective_start,
          ratePlanData.pricing_model,
          ratePlanData.flat_rate,
          ratePlanData.tier_1_rate,
          ratePlanData.tier_1_unit_count,
          ratePlanData.tier_2_rate,
          ratePlanData.cap_amount,
          ratePlanData.cap_scope,
          ratePlanData.notes,
        ]
      );
    }

    // Handle Lianup's rate change (was $2 before Dec 2025)
    if (clientIds["Lianup"]) {
      await client.query(
        `INSERT INTO rate_plans (client_id, effective_start, effective_end, pricing_model, flat_rate, notes)
         VALUES ($1, '2025-10-01', '2025-11-30', 'flat_per_unit', 2.00, 'Original rate before change to $2.95')`,
        [clientIds["Lianup"]]
      );
    }

    console.log(`Seeded ${Object.keys(clientIds).length} clients with rate plans.`);
    console.log("Client IDs:", clientIds);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
