import postgres from "postgres";

/**
 * Postgres connection lazy-init. DATABASE_URL is injected by Railway via
 * the `${{Postgres.DATABASE_URL}}` service reference. We defer the env
 * read + client construction until first request so the build step
 * (which doesn't have DATABASE_URL) succeeds.
 */
declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  if (global.__sql) return global.__sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const client = postgres(url, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  global.__sql = client;
  return client;
}
