#!/usr/bin/env node
/**
 * Minimal migration runner. Reads .sql files from ./migrations in order
 * and applies any that haven't already been recorded in the
 * public._workout_migrations tracker table. Idempotent + safe to re-run.
 *
 * Invoked as the Railway preDeployCommand so every deploy migrates first.
 */
const fs = require("node:fs");
const path = require("node:path");
const postgres = require("postgres");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS public._workout_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const dir = path.join(__dirname, "..", "migrations");
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const applied = await sql`
        SELECT 1 FROM public._workout_migrations WHERE name = ${file}
      `;
      if (applied.length > 0) {
        console.log(`skip ${file}`);
        continue;
      }
      console.log(`applying ${file}...`);
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      await sql.unsafe(text);
      await sql`
        INSERT INTO public._workout_migrations (name) VALUES (${file})
      `;
    }
    console.log("migrations done");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
