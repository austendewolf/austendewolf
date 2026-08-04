import { db, mcpAccounts } from "@awd/db";
import { eq } from "drizzle-orm";

/**
 * Google accounts this MCP server can act as.
 *
 * Credentials live in Postgres so a re-consent survives a deploy. On an empty
 * table the GWS_ACCOUNTS_JSON environment variable seeds it once, which is how
 * an existing set of credentials gets adopted without a manual import.
 *
 * Access tokens are cached in module scope until shortly before expiry. That
 * is per-instance rather than shared, which is fine: minting is cheap and a
 * cold instance simply mints once.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EXPIRY_MARGIN_MS = 120_000;

export interface Credentials {
  name: string;
  email: string | null;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes: string[];
  updatedAt: Date | null;
}

export class ReauthRequired extends Error {
  constructor(readonly account: string) {
    super(
      `The '${account}' connection was rejected by Google. Reconnect it from the dashboard.`,
    );
    this.name = "ReauthRequired";
  }
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string>>();

let seeded = false;

/** Adopt GWS_ACCOUNTS_JSON on first use, but never overwrite what is stored. */
async function seedFromEnv(): Promise<void> {
  if (seeded) return;
  seeded = true;
  const raw = process.env.GWS_ACCOUNTS_JSON;
  if (!raw) return;
  let parsed: Record<
    string,
    { client_id: string; client_secret: string; refresh_token: string; email?: string; scopes?: string[] }
  >;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const existing = await db.select({ name: mcpAccounts.name }).from(mcpAccounts);
  const known = new Set(existing.map((r) => r.name));
  const rows = Object.entries(parsed)
    .filter(([name]) => !known.has(name))
    .map(([name, c]) => ({
      name,
      email: c.email ?? null,
      clientId: c.client_id,
      clientSecret: c.client_secret,
      refreshToken: c.refresh_token,
      scopes: c.scopes ?? [],
    }));
  if (rows.length) await db.insert(mcpAccounts).values(rows);
}

export async function listAccounts(): Promise<Credentials[]> {
  await seedFromEnv();
  const rows = await db.select().from(mcpAccounts).orderBy(mcpAccounts.name);
  return rows.map((r) => ({
    name: r.name,
    email: r.email,
    clientId: r.clientId,
    clientSecret: r.clientSecret,
    refreshToken: r.refreshToken,
    scopes: r.scopes,
    updatedAt: r.updatedAt,
  }));
}

export async function getAccount(name: string): Promise<Credentials | null> {
  await seedFromEnv();
  const [row] = await db.select().from(mcpAccounts).where(eq(mcpAccounts.name, name));
  if (!row) return null;
  return {
    name: row.name,
    email: row.email,
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    refreshToken: row.refreshToken,
    scopes: row.scopes,
    updatedAt: row.updatedAt,
  };
}

export async function upsertAccount(input: {
  name: string;
  email: string | null;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes: string[];
}): Promise<void> {
  await db
    .insert(mcpAccounts)
    .values(input)
    .onConflictDoUpdate({
      target: mcpAccounts.name,
      set: {
        email: input.email,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        refreshToken: input.refreshToken,
        scopes: input.scopes,
        updatedAt: new Date(),
      },
    });
  tokenCache.delete(input.name);
}

export async function removeAccount(name: string): Promise<boolean> {
  const existing = await getAccount(name);
  if (!existing) return false;
  await db.delete(mcpAccounts).where(eq(mcpAccounts.name, name));
  tokenCache.delete(name);
  return true;
}

async function mint(creds: Credentials): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (text.includes("invalid_grant") || text.includes("invalid_rapt")) {
      throw new ReauthRequired(creds.name);
    }
    throw new Error(`token refresh failed for '${creds.name}': ${res.status}`);
  }
  const payload = JSON.parse(text) as { access_token: string; expires_in?: number };
  tokenCache.set(creds.name, {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  });
  return payload.access_token;
}

export async function accessToken(name: string): Promise<string> {
  const cached = tokenCache.get(name);
  if (cached && cached.expiresAt - Date.now() > EXPIRY_MARGIN_MS) return cached.token;

  const pending = inflight.get(name);
  if (pending) return pending;

  const creds = await getAccount(name);
  if (!creds) {
    const names = (await listAccounts()).map((a) => a.name);
    throw new Error(`unknown account '${name}'. Connected: ${names.join(", ") || "none"}`);
  }
  const promise = mint(creds).finally(() => inflight.delete(name));
  inflight.set(name, promise);
  return promise;
}

/** Mint a token purely to report whether the connection still works. */
export async function checkAccount(
  name: string,
): Promise<{ healthy: boolean; error: string | null }> {
  try {
    await accessToken(name);
    return { healthy: true, error: null };
  } catch (err) {
    return { healthy: false, error: err instanceof Error ? err.message : String(err) };
  }
}
