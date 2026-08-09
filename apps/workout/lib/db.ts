import { createDb } from "@awd/db";

/**
 * Database handle, created lazily.
 *
 * Lazy because the build step has no DATABASE_URL and constructing the client
 * at module scope would fail it. Cached on `globalThis` so Next's dev server
 * does not open a new pool on every hot reload.
 *
 * The schema lives in `@awd/db` alongside austendewolf.com's, so there is one
 * definition of these tables and `drizzle-kit` can see all of them at once.
 * They are still a separate Postgres schema reached by a separate role, so
 * sharing the definition shares nothing at runtime.
 */
declare global {
  // eslint-disable-next-line no-var
  var __workoutDb: ReturnType<typeof createDb> | undefined;
}

export function getDb() {
  if (global.__workoutDb) return global.__workoutDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  global.__workoutDb = createDb(url);
  return global.__workoutDb;
}
