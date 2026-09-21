import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as publicSchema from "./schema";
import * as workoutSchema from "./workout";
import * as daybookSchema from "./daybook";

export * from "./schema";
export * from "./workout";
export * from "./daybook";

/**
 * Every schema in one namespace.
 *
 * Each app still only reaches its own: they connect as different Postgres
 * roles, and none has any privilege in another's schema. Knowing a table
 * exists is not permission to read it, so the boundary is enforced by the
 * database rather than by which import an app happens to reach for.
 */
export const schema = { ...publicSchema, ...workoutSchema, ...daybookSchema };

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

const url = process.env.DATABASE_URL;
const client = url ? postgres(url, { prepare: false }) : null;
export const db = client ? drizzle(client, { schema }) : (null as never);
