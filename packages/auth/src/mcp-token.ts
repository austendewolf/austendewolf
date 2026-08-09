import { timingSafeEqual } from "node:crypto";

/**
 * The bearer token in front of the MCP endpoints.
 *
 * Both MCP servers accept the same `MCP_TOKENS` value, so one credential covers
 * both and rotating it is one change. The list is comma separated precisely so
 * a new token can be added before the old one is retired.
 *
 * Fails closed. With `MCP_TOKENS` unset the list is empty, nothing can match,
 * and there is no configuration state that authorises by default.
 */

export function mcpTokens(): string[] {
  return (process.env.MCP_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Constant-time compare that tolerates a length mismatch.
 *
 * `timingSafeEqual` throws on differing lengths, and returning early on that
 * throw would leak the token length through timing. Comparing the value against
 * itself first keeps the reject path the same shape as the accept path.
 */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** True when the request carries a bearer token from `MCP_TOKENS`. */
export function bearerMatches(request: { headers: Headers }): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const presented = header.slice(7).trim();
  if (!presented) return false;
  return mcpTokens().some((t) => secretEquals(presented, t));
}
