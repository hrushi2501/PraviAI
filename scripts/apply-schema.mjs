import fs from "node:fs";
import postgres from "postgres";

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!directUrl) {
  console.error("Missing DIRECT_URL or DATABASE_URL in environment");
  process.exit(1);
}

const sql = postgres(directUrl, { max: 1 });

async function run() {
  console.log("Reading schema.sql...");
  const content = fs.readFileSync("schema.sql", "utf8");

  console.log("Executing schema.sql on Supabase PostgreSQL...");
  const start = Date.now();
  try {
    await sql.unsafe(content);
    console.log(
      `Schema applied and COMMITTED successfully in ${(Date.now() - start) / 1000}s!`,
    );
  } catch (err) {
    console.error("Schema application failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
