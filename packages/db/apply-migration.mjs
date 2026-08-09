#!/usr/bin/env node
/**
 * Apply a migration file against DATABASE_URL.
 *
 * drizzle-kit wants a direct (non-pooled) connection for its own migration
 * bookkeeping, which this deployment does not expose. The statements here are
 * idempotent, so running them through the pooler is safe.
 *
 *   railway run node packages/db/apply-migration.mjs drizzle/0001_x.sql
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file) {
  console.error("usage: apply-migration.mjs <path-to-sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = readFileSync(resolve(here, file), "utf8");
// drizzle separates statements with this marker; fall back to the whole file.
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * drizzle-kit emits plain CREATE/ALTER, which fails the second time and fails
 * immediately against a schema that already exists. Rewriting here rather than
 * hand-editing the generated file keeps `drizzle-kit generate` free to
 * regenerate it, and means a baseline migration (one describing tables already
 * present, as 0002 does for the workout schema) is a no-op rather than a wall.
 */
function idempotent(statement) {
  const s = statement
    .replace(/^CREATE TABLE "/i, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/^CREATE SCHEMA "/i, 'CREATE SCHEMA IF NOT EXISTS "')
    .replace(/^CREATE INDEX "/i, 'CREATE INDEX IF NOT EXISTS "')
    .replace(/^CREATE UNIQUE INDEX "/i, 'CREATE UNIQUE INDEX IF NOT EXISTS "');

  // ADD CONSTRAINT has no IF NOT EXISTS, so swallow the duplicate-object error.
  if (/^ALTER TABLE .* ADD CONSTRAINT /i.test(s)) {
    const body = s.replace(/;\s*$/, "").replace(/'/g, "''");
    return `DO $$ BEGIN
  EXECUTE '${body}';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;`;
  }
  return s;
}

const client = postgres(url, { prepare: false, max: 1 });
try {
  for (const statement of statements) {
    const safe = idempotent(statement);
    await client.unsafe(safe);
    console.log("applied:", statement.split("\n")[0].slice(0, 70));
  }
  const [{ count }] = await client`
    SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_name = 'mcp_accounts'`;
  console.log(`mcp_accounts present: ${count === 1}`);
} finally {
  await client.end();
}
