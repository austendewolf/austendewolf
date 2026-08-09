import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isAllowed } from "@/lib/allowlist";

/**
 * Auth for the MCP endpoint, matching austendewolf.com's.
 *
 * Two ways in, because two different kinds of caller need it:
 *
 *  - A shared bearer token in MCP_TOKENS. This is the same mechanism and the
 *    same value austendewolf.com's MCP server uses, so one credential covers
 *    both and rotating it is one change in two places. MCP clients hold a
 *    static token; they have nowhere to run a login flow.
 *  - A Supabase access token belonging to an allowlisted address. The project
 *    is the shared identity plane, so a valid token proves only that someone
 *    signed up for *something*. The allowlist is the real check.
 *
 * Fails closed. With MCP_TOKENS unset, `tokens()` is empty, no presented
 * string can match, and the Supabase path still has to clear the allowlist.
 * There is no configuration state in which this returns "allowed" by default.
 */

function tokens(): string[] {
  return (process.env.MCP_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Constant-time compare that tolerates a length mismatch. */
function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still burn a comparison so the reject path costs the same either way.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

async function isAllowedSupabaseUser(token: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return false;
    return isAllowed(data.user.email);
  } catch {
    return false;
  }
}

/** True when the request may proceed. Callers return 401 otherwise. */
export async function authorizeMcp(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const presented = header.slice(7).trim();
  if (!presented) return false;

  if (tokens().some((t) => secretEquals(presented, t))) return true;
  return isAllowedSupabaseUser(presented);
}
