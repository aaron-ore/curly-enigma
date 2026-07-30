/**
 * Database migration script — runs schema.sql against the configured DATABASE_URL.
 * Usage: node scripts/migrate.js
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

  const schemaPath = path.join(__dirname, "..", "src", "lib", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");

  const client = await pool.connect();
  try {
    console.log("Running migration...");
    await client.query(schema);
    console.log("Migration complete.");
  } catch (err) {
    // If types already exist, that's fine — wrap in IF NOT EXISTS logic
    if (err.message.includes("already exists")) {
      console.log("Schema already exists (some types/tables were already created). Running idempotent...");
      // Split and run statements individually, skipping failures for existing objects
      const statements = schema.split(";").filter((s) => s.trim());
      for (const stmt of statements) {
        try {
          await client.query(stmt + ";");
        } catch (e) {
          if (!e.message.includes("already exists")) {
            console.error("Statement failed:", stmt.slice(0, 80), "—", e.message);
          }
        }
      }
      console.log("Idempotent migration complete.");
    } else {
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
