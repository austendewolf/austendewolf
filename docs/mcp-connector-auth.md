# MCP connector auth on austendewolf.com

Drafted 09/25/2026. Nothing here is shipped yet.

The first draft had this site building its own OAuth authorization server. That
was wrong: Supabase Auth can act as an OAuth 2.1 server, the feature is on this
project already, and a second token issuer next to the one that answers
"is this Austen" would be duplicated auth. Rewritten the same day.

## Goal

Add `mcp.austendewolf.com` to claude.ai as a custom connector, where the
credential Claude ends up holding is short-lived, revocable, scoped to a tool
surface Austen picked, and issued only to an allowlisted account.

## Today

One static bearer guards both MCP endpoints. `MCP_TOKENS` is a comma list,
compared in constant time, and it fails closed with the variable unset
(`packages/auth/src/mcp-token.ts`). That credential never expires, carries no
identity, cannot be revoked without a redeploy, is shared with the workout
server, and lives in `~/.zshrc`.

claude.ai cannot present it. The Add custom connector dialog takes a server URL
and OAuth client details. The **Request headers** section that would carry a
fixed `Authorization` value is beta and limited to some organizations, so a
personal plan will probably not show it at all; a Max plan does not change that,
it only lifts the one-custom-connector cap that Free has. OAuth is the route in.

The route itself already satisfies Claude's transport expectations: JSON-RPC over
POST, one `application/json` response, 202 for notifications, 405 on GET. No
transport work.

Two things in the current code block the handshake before a line of OAuth is
written:

- The rewrite in `apps/web/next.config.ts` sends `/:path*` on
  `mcp.austendewolf.com` to `/api/mcp`. Every discovery path on that host,
  including `/.well-known/oauth-protected-resource`, answers with the MCP
  handler's 405 today.
- `MCP_TOKENS` is also the HMAC key for Google consent state in
  `lib/mcp/oauth.ts`. Nothing below depends on fixing that, and it is worth
  fixing while the file is open: a bearer token and a signing key should not be
  one value.

## What Claude requires

Read from https://claude.com/docs/connectors/building/authentication and
https://claude.com/docs/connectors/building/lazy-authentication on 09/25/2026.

| Requirement | Detail |
|---|---|
| 401, not a tool error | `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="…"`. A 200 wrapping `isError: true` produces no Connect card. |
| Protected resource metadata | RFC 9728. Its `resource` must equal the URL as typed into the dialog, character for character. |
| One authorization server | Claude uses `authorization_servers[0]`. It may be on another host, which is the case here. |
| Authorization server metadata | RFC 8414 or OpenID Connect Discovery, reachable from `160.79.104.0/21`. |
| PKCE | `code_challenge_method=S256` on every request. |
| Client identity | Claude's published identity (CIMD), automatic registration (DCR), or a client ID entered in the dialog. |
| Redirect URI | `https://claude.ai/api/mcp/auth_callback` for web, Desktop, mobile and Cowork. |
| Token endpoint | Accepts `application/x-www-form-urlencoded`. |
| Refresh | Reactive on 401, proactive up to five minutes before expiry. |
| Timeouts | 10 seconds for discovery and token, 30 for refresh. |
| Discovery cache | Global, keyed by URL, roughly five minutes stale. |

Supabase Auth satisfies the authorization server half of that list as shipped.

## Decision: Supabase Auth is the authorization server

Supabase Auth acts as an OAuth 2.1 and OIDC provider, in beta and free on all
plans during the beta, documented at
https://supabase.com/docs/guides/auth/oauth-server and
https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication. It
implements the authorization code flow with mandatory PKCE, serves discovery
metadata and JWKS, rotates refresh tokens, and hands the consent screen back to
the application.

Checked against the live project on 09/25/2026: `auth.oauth_clients`,
`auth.oauth_authorizations`, `auth.oauth_consents` and
`auth.oauth_client_states` all exist on this project's auth schema, so the
feature is present and only needs enabling. `auth.oauth_authorizations` carries a
`resource` column, which means the RFC 8707 `resource` parameter Claude sends is
accepted and recorded rather than rejected. `auth.oauth_consents` carries
`revoked_at`, which is the revocation surface.

So this repository writes no authorization endpoint, no token endpoint, no PKCE
verification, no code table, no token table, no refresh rotation, no reuse
detection. What is left is the part that was always ours: the protected resource
metadata, a consent screen, and the gate on the MCP route.

What this costs, stated plainly:

- **Beta.** The surface can change under us, and free-during-beta implies
  pricing later. This is the real cost of the route and the reason to keep the
  pieces we write small and standard.
- **Only standard scopes.** `openid`, `email`, `profile`, `phone`. The tool
  groups behind this endpoint (daybook, Google, fronted upstreams) cannot be
  expressed as OAuth scopes without a Custom Access Token Hook, so least
  privilege moves into our own code, keyed on the token's `client_id` claim. The
  cost is the loss of Claude's step-up consent flow, where a 403 with
  `insufficient_scope` triggers a re-consent. Enforcement is unaffected.
- **Tokens are project JWTs, not audience-bound.** `aud` is `authenticated` by
  default, so a token issued to a different OAuth client of the same project is
  signature-valid against our route. The `client_id` check below is what makes
  that safe, which is why it is mandatory and not a nicety.
- **This project is shared.** Its `auth.users` holds accounts from unrelated
  products, which is exactly why `packages/auth/src/allowlist.ts` exists.
  Enabling an OAuth server on it means any of those accounts can start a consent
  flow, so the consent page refuses a non-allowlisted user before approving, and
  the route re-checks on every call.

Rejected, with reasons:

- **Our own authorization server** (the first draft). Roughly four endpoints, two
  tables, PKCE verification, rotation with reuse detection and a CIMD fetcher, to
  reproduce what the auth provider already ships. It also meant two places that
  decide who Austen is.
- **Dynamic Client Registration.** An open `POST /register`, and a growing client
  table, for a server with one user. The toggle stays off and one client is
  registered by hand.
- **Fixed bearer through Request headers.** Ten minutes of work if the dialog
  offers it, and it keeps a credential that never expires and cannot be revoked
  from the site.
- **Anthropic-held client credentials.** Requires a directory listing and an
  email to `mcp-review@anthropic.com`.

## Shape

```
  claude.ai                  austendewolf.com          <ref>.supabase.co/auth/v1
      |                             |                             |
      |  1. POST /mcp (no token) -> mcp.austendewolf.com           |
      |<---- 401 WWW-Authenticate: resource_metadata=… ------------|
      |                             |                             |
      |  2. GET /.well-known/oauth-protected-resource ------------>|
      |<---- { resource, authorization_servers:[supabase auth] } --|
      |                             |                             |
      |  3. GET discovery metadata ------------------------------->|
      |<---- { authorize, token, jwks, S256 } --------------------|
      |                             |                             |
      |  4. GET /oauth/authorize?client_id&code_challenge&resource>|
      |                             |<-- 302 /oauth/consent?authorization_id
      |                    [ Supabase session + isAllowed ]        |
      |                    [ getAuthorizationDetails ]             |
      |                    [ Austen approves ]                     |
      |                             |-- approveAuthorization() --->|
      |<---- 302 claude.ai/api/mcp/auth_callback?code=… -----------|
      |                             |                             |
      |  5. POST /oauth/token (code + verifier) ------------------>|
      |<---- access JWT + refresh (rotated) ----------------------|
      |                             |                             |
      |  6. POST /mcp with Bearer -> mcp.austendewolf.com          |
      |            [ JWKS verify, iss, exp, client_id, allowlist ] |
      |<---- tools/list, narrowed to what that client may see -----|
```

Steps 1, 2, 4's middle and 6 are ours. Steps 3 and 5 are Supabase's.

## Configuration, outside the repository

In the Supabase dashboard, Authentication > OAuth Server:

- Enable OAuth 2.1 server.
- Authorization Path: `/oauth/consent`. It is combined with the project's Site
  URL, so Site URL under Authentication > URL Configuration has to be
  `https://austendewolf.com` for the consent screen to resolve. Confirm that
  before anything else; a wrong Site URL sends consent somewhere else entirely.
- Leave dynamic client registration **off**.

Register one client by hand, under Authentication > OAuth Apps or through
`supabase.auth.admin.oauth.createClient`:

- Name: something Austen will recognise on a consent screen, because the screen
  shows it.
- Redirect URI: `https://claude.ai/api/mcp/auth_callback`, exact match, no
  wildcards.
- Type: public to start, so the token exchange is PKCE-only and there is no
  secret to place. Claude always sends S256 and the redirect URI is exact-match,
  so a public client is sound. Switching to confidential is a hardening step, and
  it needs a test first: Supabase defaults a confidential client to
  `client_secret_basic`, and Claude's docs do not say whether it sends the secret
  via Basic or in the body, so a mismatch shows up as a failing token exchange.

Then in claude.ai, Customize > Connectors > Add custom connector: the canonical
URL, OAuth client set to **Use your own OAuth client**, the registered client ID
pasted, secret left blank.

Also worth settling in the dashboard: the project signs JWTs with HS256 by
default, and asymmetric keys (RS256 or ES256) are the recommendation for OAuth
because verification then needs only the public JWKS. Our own route is
first-party and could verify HS256 with the shared secret, so this is a
should-do rather than a blocker, and it becomes required if we ever request the
`openid` scope.

## Staying connected

One sign-in, then it stays connected. Claude holds a refresh token and swaps it
for a fresh access token in the background, proactively up to five minutes before
expiry and reactively on a 401. Supabase sessions last indefinitely by default,
and refresh tokens do not expire; they are single-use and rotate.

Checked on the live project 09/25/2026: 9,663 rows in `auth.sessions`, none
carrying a `not_after` value, so session time-boxing is off today, and the most
recent refresh was minutes before the check. Nothing in the current
configuration would force a re-consent.

Four things would, and three of them are settings under Authentication >
Sessions:

- **Time-box user sessions** and **Inactivity timeout** terminate sessions on a
  clock. Both are off. Leave them off, or set them long enough that a connector
  is not the thing they break.
- **Single session per user** keeps only the most recent sign-in and terminates
  the rest. If that is ever switched on, signing in to the website would kick the
  connector out. It has to stay off.
- Changing the account password, or any other security-sensitive action, ends
  existing sessions and so ends the connection.
- Revoking the consent, which is the intended way out.

Refresh token reuse detection can also revoke a session, but Claude is one
client refreshing in sequence, and Supabase allows a ten-second reuse interval
plus a parent-token exception for exactly the retry case, so this is unlikely
rather than impossible.

Against today's static bearer, the trade is one sign-in now and a re-sign-in in
those cases, in exchange for a credential that expires on its own and can be
cancelled from the site. Never needing to authenticate is the static token's only
advantage, and it is the same property that makes it impossible to revoke.

## What this repository adds

| Route | Host | Does |
|---|---|---|
| `GET /.well-known/oauth-protected-resource` | both | `resource`, `authorization_servers: ["https://<ref>.supabase.co/auth/v1"]`, `bearer_methods_supported: ["header"]` |
| `GET /.well-known/oauth-protected-resource/mcp` | both | Same document, RFC 9728's path-suffixed variant, which clients try first when the resource URL has a path |
| `GET /oauth/consent` | apex | The consent screen |
| `POST /api/oauth/decision` | apex | Approve or deny, then redirect where Supabase says |
| `POST /api/mcp` | both | The gate, ahead of the JSON-RPC dispatch |

The rewrite narrows from `/:path*` to exactly `/` and `/mcp`, so clients that
POST the bare origin keep working and everything else on the subdomain serves
normal app routes. Canonical connector URL: `https://mcp.austendewolf.com/mcp`.

### The consent screen

A server component at `/oauth/consent` reading `authorization_id` from the query
string, following the Next.js example in Supabase's getting-started guide, with
three additions of our own:

- It uses the existing `createClient()` from `lib/supabase/server.ts`, so the
  session cookie already set on the apex is the session it reads.
- A signed-out visitor is sent to `/login?next=…`, which already exists and
  already refuses an off-site return.
- `isAllowed(user.email)` gates the approve path. A valid project account that is
  not on the allowlist gets a refusal and no `approveAuthorization` call. This is
  the same boundary the login form draws, for the same reason.

The screen names the client, the redirect URI and the requested scopes, and
`approveAuthorization` / `denyAuthorization` are called from a POST route rather
than a link, so nothing approves on a GET.

### The gate on `/api/mcp`

- No bearer: 401 with `WWW-Authenticate: Bearer error="invalid_token",
  resource_metadata="…"`. Never a 200 carrying an error.
- A `MCP_TOKENS` match stays the machine path, with the full tool set.
- Otherwise the bearer is treated as a project JWT and must clear all of:
  signature against the project JWKS, `iss` equal to the project's auth URL,
  unexpired, a `client_id` claim equal to the registered Claude client, and an
  email on the allowlist. A browser session token carries no `client_id`, so the
  claim check is what stops one from being replayed as an MCP credential.
- Failure is 401 with `error="invalid_token"`, so Claude re-runs the flow instead
  of surfacing a tool error.
- Tokens never reach a log line.

### Tool surface

`tools/list` and `tools/call` narrow by the token's `client_id`. The Claude
client gets `DAYBOOK_TOOLS`, the Google `TOOLS`, and the fronted upstreams.
`ADMIN_TOOLS` gets nothing: `accounts_connect_url` and `accounts_disconnect`
manage the credentials every other tool depends on, so they stay on the dashboard
and the machine path, hidden from `tools/list` and answered as an unknown tool.

This is policy in `lib/mcp/registry.ts`, not an OAuth scope, because Supabase
offers no custom scopes. A Custom Access Token Hook could stamp per-client claims
later if the step-up consent flow turns out to be worth it.

### Revocation

`auth.oauth_consents` has `revoked_at` per user and client, so the connections
page gains a row for the connector and a button that revokes it, alongside the
Google accounts it already lists. A revoked consent stops the refresh; the
access token still works until it expires, which is the argument for keeping the
project's JWT expiry at an hour or less.

## Residual risk, named

1. **The static bearer stays the weakest credential on the endpoint.** A token in
   `~/.zshrc` that also opens the workout server still opens everything here.
   Only phase 5 changes that.
2. **No audience binding.** The `client_id` check carries the weight. If that
   check is ever dropped or loosened, any token from this Supabase project
   becomes an MCP credential.
3. **Beta feature.** Supabase's OAuth server can change, and its pricing is
   unannounced.
4. **A leaked access token reaches Gmail and Drive until it expires.** The
   mitigations are the expiry and the revoke button, not prevention.
5. **Prompt injection through tool results** is unchanged. The narrowed tool
   surface bounds the damage, which is why admin tools stay out.
6. **Claude's five-minute discovery cache** means a metadata mistake outlives the
   fix. Deploy metadata before flipping the gate.

## Phases

1. **Discovery and the gate.** Narrow the rewrite, serve the protected resource
   metadata, return the 401 with `WWW-Authenticate`. Verifiable with curl before
   any Supabase configuration.
2. **Supabase configuration and consent.** Enable the OAuth server, set the
   authorization path, confirm Site URL, register the client, build
   `/oauth/consent` and the decision route.
3. **Token verification and tool narrowing** in the route.
4. **Revocation** on the connections page, reading `auth.oauth_consents`.
5. **Retire or narrow the static bearer**, or accept risk 1 in writing.

Unrelated and cheap, worth doing while phase 1 is open: give the Google consent
state its own signing key instead of borrowing `MCP_TOKENS`.

## Verification

Not yet run: this container's egress policy blocks `*.supabase.co`, so the live
discovery documents could not be fetched from here. These are the first checks,
from a shell that can reach the project:

- `curl -s https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`
  returns metadata naming the authorize and token endpoints. The OIDC form at
  `https://<ref>.supabase.co/auth/v1/.well-known/openid-configuration` is the
  other shape Claude accepts. One unverified assumption sits here: the issuer has
  a path (`/auth/v1`), so RFC 8414 puts its metadata at the first URL while OIDC
  discovery puts it at the second. Claude accepts either standard, and a single
  connect attempt settles which one it follows.
- `curl -si https://mcp.austendewolf.com/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
  returns 401 with a `WWW-Authenticate` header naming the metadata URL.
- `curl -s https://mcp.austendewolf.com/.well-known/oauth-protected-resource`
  returns a `resource` equal to `https://mcp.austendewolf.com/mcp`.
- The existing bearer still works, so the morning run and Claude Code are
  unaffected.

Then the connect attempt in claude.ai, expecting a consent screen that names the
client and the scopes, and a populated `tools/list` after it.

Three negative tests worth running once:

- Sign in as a project account that is not on the allowlist and confirm the
  consent screen refuses before approving.
- Present a browser session JWT as the bearer and confirm the missing
  `client_id` claim produces a 401.
- Revoke the consent and confirm the connector stops working after the access
  token expires.

## Open decisions

- Canonical URL: `https://mcp.austendewolf.com/mcp`, which this plan assumes,
  against the bare origin the current clients use. The `resource` field must
  match what gets typed into the dialog, so this is picked once.
- ~~Which tool groups the Claude client gets on day one.~~ Settled 09/26/2026:
  daybook and Google both, from the start. Claude's own Google Workspace
  connector holds one Google account at a time, and reaching a second one means
  disconnecting and reconnecting
  (https://support.claude.com/en/articles/10166901-use-google-workspace-connectors).
  Serving several accounts behind one connection is what this gateway is for, and
  the `account` enum that `tools/list` already advertises is the thing the native
  connector cannot do. Withholding the Google tools would withhold the reason to
  connect it.
- Whether phase 5 retires `MCP_TOKENS` or documents the risk and keeps it.
