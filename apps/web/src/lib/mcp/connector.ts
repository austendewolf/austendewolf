import { createClient } from "@supabase/supabase-js";

import { bearerMatches, isAllowed, mcpTokens } from "@awd/auth";

/**
 * Who is calling the MCP endpoint.
 *
 * Two kinds of caller reach it, and they are not the same thing:
 *
 *  - A machine holding the static bearer from `MCP_TOKENS`. A scheduled run and
 *    a terminal client have nowhere to complete a sign-in, so they keep a
 *    credential that never expires. It buys the full tool set.
 *  - A connector in Claude, holding an access token this site's Supabase project
 *    issued through its OAuth 2.1 server. Short lived, refreshed without anyone
 *    watching, and revocable from the connections page.
 *
 * Supabase Auth is the authorization server rather than anything written here:
 * it already answers "is this Austen", and a second token issuer beside it would
 * be two places deciding the same question. `docs/mcp-connector-auth.md` has the
 * reasoning and the dashboard settings this depends on.
 *
 * Fails closed in both directions. With `MCP_TOKENS` empty nothing matches on
 * the machine path, and with `MCP_OAUTH_CLIENT_IDS` empty no access token is
 * accepted however well signed it is.
 */

const DEFAULT_RESOURCE = "https://mcp.austendewolf.com/mcp";

/**
 * The URL a connector is configured with, character for character.
 *
 * Claude compares this against what was typed into the Add custom connector
 * dialog and refuses a mismatch, including a stray trailing slash, so it is one
 * value read from one place rather than rebuilt per request from headers.
 */
export function resourceUrl(): string {
  return (process.env.MCP_RESOURCE_URL ?? DEFAULT_RESOURCE).replace(/\/+$/, "");
}

/**
 * Where the metadata document lives.
 *
 * RFC 9728 inserts the resource's path after the well-known segment, which is
 * the form clients try first when the resource URL has a path. A resource at a
 * bare origin has no suffix to insert.
 */
export function metadataUrl(): string {
  const url = new URL(resourceUrl());
  const suffix = url.pathname.replace(/^\/+|\/+$/g, "");
  return `${url.origin}/.well-known/oauth-protected-resource${suffix ? `/${suffix}` : ""}`;
}

/** The path segments that identify this resource, for the suffixed route. */
export function resourceSuffix(): string {
  return new URL(resourceUrl()).pathname.replace(/^\/+|\/+$/g, "");
}

/** The Supabase project's auth server, which issues and refreshes the tokens. */
export function issuer(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  return base ? `${base}/auth/v1` : null;
}

/**
 * The one scope the challenge asks for.
 *
 * Supabase's OAuth server offers the standard set and nothing custom, so a
 * scope cannot express which tools a caller may reach; that decision lives in
 * `tools.ts` instead, keyed on which client the token was issued to. `email` is
 * asked for because the allowlist check needs an address to work with. `openid`
 * is deliberately not requested: it makes the auth server mint an ID token,
 * which fails while the project still signs with HS256.
 */
export const REQUESTED_SCOPE = "email";

/** RFC 9728. Claude reads this to find out where to send the browser. */
export function protectedResourceMetadata() {
  const authorizationServer = issuer();
  return {
    resource: resourceUrl(),
    ...(authorizationServer ? { authorization_servers: [authorizationServer] } : {}),
    scopes_supported: [REQUESTED_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "austendewolf.com",
    resource_documentation: "https://austendewolf.com/account/connections",
  };
}

/**
 * The `WWW-Authenticate` value on a 401.
 *
 * This header is the whole protocol signal: a 200 carrying an error gets read as
 * a failed tool call and shown to the model, and the caller is never offered a
 * sign-in. `scope` is named explicitly so consent asks for one thing rather than
 * everything the metadata advertises.
 */
export function challenge(error?: "invalid_token"): string {
  const parts = [
    ...(error ? [`error="${error}"`] : []),
    `resource_metadata="${metadataUrl()}"`,
    `scope="${REQUESTED_SCOPE}"`,
  ];
  return `Bearer ${parts.join(", ")}`;
}

/**
 * The OAuth clients whose tokens this endpoint accepts.
 *
 * Supabase issues project JWTs whose audience is `authenticated` rather than
 * this server, so any client registered on the project produces a token that
 * verifies here. This list is what makes that safe, and it is the reason the
 * check below is not simply "the signature is good".
 */
function trustedClients(): string[] {
  return (process.env.MCP_OAUTH_CLIENT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export type Caller =
  | { kind: "machine" }
  | { kind: "connector"; email: string; client: string };

/** True when at least one way in is configured. */
export function authConfigured(): boolean {
  return mcpTokens().length > 0 || (trustedClients().length > 0 && Boolean(issuer()));
}

/** True when a connector could complete a sign-in against this deployment. */
export function connectorConfigured(): boolean {
  return trustedClients().length > 0 && Boolean(issuer());
}

const project = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

/** One client per instance; verifying a token needs no session of its own. */
let cached: ReturnType<typeof project> | undefined;
const supabase = () => (cached ??= project());

const bearerOf = (request: { headers: Headers }): string | null => {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
};

/**
 * Identify the caller, or refuse.
 *
 * `getClaims` verifies against the project's JWKS when the signing key is
 * asymmetric and falls back to asking the auth server when it is not, so this
 * is correct under HS256 today and gets faster the day the project moves to
 * ES256. Either way the claims are only read after the token is proven.
 */
export async function resolveCaller(request: { headers: Headers }): Promise<Caller | null> {
  if (bearerMatches(request)) return { kind: "machine" };

  const token = bearerOf(request);
  if (!token) return null;

  const trusted = trustedClients();
  if (!trusted.length) return null;

  const client = supabase();
  if (!client) return null;

  try {
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data) return null;

    // A browser session token carries no `client_id`, so this check is also what
    // stops one being replayed here as a connector credential.
    const issuedTo = typeof data.claims.client_id === "string" ? data.claims.client_id : null;
    if (!issuedTo || !trusted.includes(issuedTo)) return null;

    if (issuer() && data.claims.iss !== issuer()) return null;

    let email = typeof data.claims.email === "string" ? data.claims.email : null;
    if (!email) {
      // A grant without the email scope still identifies a user, and the
      // allowlist is the boundary that matters, so fetch the address rather
      // than refuse a token that is otherwise good.
      const { data: user } = await client.auth.getUser(token);
      email = user.user?.email ?? null;
    }
    if (!isAllowed(email)) return null;

    return { kind: "connector", email: email!, client: issuedTo };
  } catch {
    return null;
  }
}
