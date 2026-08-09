import { createClient } from "@supabase/supabase-js";
import { bearerMatches, isAllowed } from "@awd/auth";

/**
 * Auth for the MCP endpoint, matching austendewolf.com's.
 *
 * Two ways in, because two different kinds of caller need it:
 *
 *  - A shared bearer token from MCP_TOKENS. Same mechanism and same value as
 *    austendewolf.com's MCP server, checked by the same shared code. MCP
 *    clients hold a static token; they have nowhere to run a login flow.
 *  - A Supabase access token belonging to an allowlisted address. A valid token
 *    proves only that someone signed up for something, so the allowlist is the
 *    real check.
 *
 * Fails closed: with MCP_TOKENS unset nothing matches, and the Supabase path
 * still has to clear the allowlist.
 */

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
  if (bearerMatches(req)) return true;

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const presented = header.slice(7).trim();
  if (!presented) return false;
  return isAllowedSupabaseUser(presented);
}
