import { db, mcpUpstreams } from "@awd/db";
import { eq } from "drizzle-orm";

import { Upstream } from "@/lib/mcp/upstream";

/**
 * The multiplexer.
 *
 * Holds every connected upstream, merges their tool lists with the ones this
 * server implements itself, and routes a namespaced call back to the right
 * place.
 *
 * Local tools stay unprefixed. Only remote ones are namespaced as
 * `<upstream>.<tool>`, which is a deliberate asymmetry: prefixing the Google
 * tools too would be tidier, but it would rename all 25 of them and break every
 * client already configured against this endpoint. A dot in a tool name means
 * "somewhere else".
 *
 * Instances are cached in module scope so a warm server handshakes once rather
 * than per request, the same approach `accounts.ts` takes for access tokens.
 * The cache is keyed by row so an edit in the dashboard takes effect without a
 * deploy.
 */

interface Cached {
  upstream: Upstream;
  /** Row fingerprint. A change here means the connection must be rebuilt. */
  signature: string;
}

const instances = new Map<string, Cached>();

const signatureOf = (row: typeof mcpUpstreams.$inferSelect) =>
  JSON.stringify([row.url, row.headers, row.allow, row.deny]);

async function active(): Promise<Upstream[]> {
  const rows = await db.select().from(mcpUpstreams).where(eq(mcpUpstreams.enabled, true));
  const live: Upstream[] = [];

  for (const row of rows) {
    const signature = signatureOf(row);
    const existing = instances.get(row.name);
    if (existing && existing.signature === signature) {
      live.push(existing.upstream);
      continue;
    }
    const upstream = new Upstream(row);
    instances.set(row.name, { upstream, signature });
    live.push(upstream);
  }

  // Drop anything disabled or deleted since the last pass.
  const names = new Set(rows.map((r) => r.name));
  for (const name of instances.keys()) if (!names.has(name)) instances.delete(name);

  return live;
}

/** Every remote tool, namespaced. Unreachable upstreams contribute nothing. */
export async function upstreamTools() {
  const lists = await Promise.all((await active()).map((u) => u.tools()));
  return lists.flat();
}

/** Split `sentry.search_issues` into its upstream and the bare tool name. */
export async function resolveUpstream(
  name: string,
): Promise<{ upstream: Upstream; tool: string } | null> {
  const dot = name.indexOf(".");
  if (dot < 1) return null;
  const prefix = name.slice(0, dot);
  const upstream = (await active()).find((u) => u.name === prefix);
  return upstream ? { upstream, tool: name.slice(dot + 1) } : null;
}

/** Connection health, for the dashboard. */
export async function upstreamStatus() {
  const live = await active();
  await Promise.all(live.map((u) => u.ensure()));
  return live.map((u) => ({
    name: u.name,
    connected: u.connected,
    tools: u.toolCount,
    error: u.lastError,
  }));
}
