import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as publicSchema from "./schema";
import * as workoutSchema from "./workout";

export * from "./schema";
export * from "./workout";

/**
 * Both schemas in one namespace.
 *
 * Each app still only reaches its own: the two connect as different Postgres
 * roles, and neither has any privilege in the other's schema. Knowing a table
 * exists is not permission to read it, so the boundary is enforced by the
 * database rather than by which import an app happens to reach for.
 */
export const schema = { ...publicSchema, ...workoutSchema };

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

const url = process.env.DATABASE_URL;
const client = url ? postgres(url, { prepare: false }) : null;
export const db = client ? drizzle(client, { schema }) : (null as never);
