import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The Google consent flow.
 *
 * The server holds the OAuth client and swaps the authorization code for a
 * refresh token, so no secret passes through the browser. State is signed
 * rather than stored, which keeps the flow working across instances without
 * needing a shared session.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Everything the tools can ask for, and what a fresh consent requests.
 *
 * Every entry defaults on. An earlier version left the narrow read variants and
 * all of Slides off, on the reasoning that full `drive` already covers the Docs,
 * Sheets, and Slides APIs and a shorter consent screen is a smaller ask. That is
 * true, and it made the checkbox panel misleading: an unchecked box next to a
 * granted account reads as access that was refused rather than access that was
 * never requested. Asking for the whole catalogue keeps the panel a description
 * of the grant.
 */
export const SCOPE_CATALOG = [
  {
    service: "Gmail",
    scopes: [
      { url: "https://www.googleapis.com/auth/gmail.readonly", label: "Read mail", default: true },
      {
        url: "https://www.googleapis.com/auth/gmail.modify",
        label: "Read, label, and archive",
        default: true,
      },
      {
        url: "https://www.googleapis.com/auth/gmail.settings.basic",
        label: "Manage filters",
        default: true,
      },
    ],
  },
  {
    service: "Calendar",
    scopes: [
      {
        url: "https://www.googleapis.com/auth/calendar.readonly",
        label: "Read events",
        default: true,
      },
      { url: "https://www.googleapis.com/auth/calendar", label: "Full access", default: true },
    ],
  },
  {
    service: "Drive",
    scopes: [
      { url: "https://www.googleapis.com/auth/drive.readonly", label: "Read files", default: true },
      // Comments are a Drive concern, not a Docs one, and creating them needs
      // more than drive.readonly.
      { url: "https://www.googleapis.com/auth/drive", label: "Full access", default: true },
    ],
  },
  {
    service: "Docs",
    scopes: [
      {
        url: "https://www.googleapis.com/auth/documents.readonly",
        label: "Read documents",
        default: true,
      },
      {
        url: "https://www.googleapis.com/auth/documents",
        label: "Read and edit documents",
        default: true,
      },
    ],
  },
  {
    service: "Sheets",
    scopes: [
      {
        url: "https://www.googleapis.com/auth/spreadsheets.readonly",
        label: "Read spreadsheets",
        default: true,
      },
      {
        url: "https://www.googleapis.com/auth/spreadsheets",
        label: "Read and edit spreadsheets",
        default: true,
      },
    ],
  },
  {
    service: "Slides",
    scopes: [
      {
        url: "https://www.googleapis.com/auth/presentations.readonly",
        label: "Read presentations",
        default: true,
      },
      {
        url: "https://www.googleapis.com/auth/presentations",
        label: "Read and edit presentations",
        default: true,
      },
    ],
  },
] as const;

export const ALL_SCOPES: string[] = SCOPE_CATALOG.flatMap((g) => g.scopes.map((s) => s.url));
export const DEFAULT_SCOPES: string[] = SCOPE_CATALOG.flatMap((g) =>
  g.scopes.filter((s) => s.default).map((s) => s.url),
);

const clientId = () => process.env.GOOGLE_CLIENT_ID;
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET;

/** Where Google returns the browser. Must be registered on a Web client. */
export function redirectUri(): string {
  const base = (process.env.MCP_PUBLIC_ORIGIN ?? "https://austendewolf.com").replace(/\/$/, "");
  return `${base}/api/mcp/callback`;
}

export function oauthConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

/** state = account.expiry.nonce.hmac, so nothing needs to be stored. */
function signState(account: string, scopes: string[]): string {
  const payload = Buffer.from(
    JSON.stringify({ account, scopes, exp: Date.now() + STATE_TTL_MS, nonce: randomBytes(9).toString("hex") }),
  ).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

function hmac(payload: string): string {
  // Reuse the bearer token material as the signing key: it is already a
  // server-only secret, and rotating it invalidates in-flight consents, which
  // is the correct behaviour.
  const key = process.env.MCP_TOKENS ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function verifyState(state: string): { account: string; scopes: string[] } {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("malformed state");
  const expected = Buffer.from(hmac(payload));
  const presented = Buffer.from(signature);
  if (
    presented.length !== expected.length ||
    !timingSafeEqual(presented, expected)
  ) {
    throw new Error("state signature did not verify");
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    account: string;
    scopes: string[];
    exp: number;
  };
  if (Date.now() > data.exp) throw new Error("this consent link expired; start again");
  return { account: data.account, scopes: data.scopes };
}

export function authorizeUrl(account: string, scopes?: string[]): string {
  if (!oauthConfigured()) {
    throw new Error(
      `Google OAuth is not configured. Create a Web application client and register ${redirectUri()} as an authorized redirect URI, then set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.`,
    );
  }
  const chosen = (scopes?.length ? scopes : DEFAULT_SCOPES).filter((s) => ALL_SCOPES.includes(s));
  if (!chosen.length) throw new Error("no valid scopes were requested");
  const params = new URLSearchParams({
    client_id: clientId()!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: chosen.join(" "),
    access_type: "offline",
    // Force a refresh token even when this account has consented before.
    prompt: "consent",
    state: signState(account, chosen),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  grantedScopes: string[];
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId()!,
      client_secret: clientSecret()!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  const payload = JSON.parse(text) as {
    refresh_token?: string;
    access_token: string;
    scope?: string;
  };
  if (!payload.refresh_token) {
    throw new Error(
      "Google returned no refresh token. Remove this app at myaccount.google.com/permissions and try again.",
    );
  }
  return {
    refreshToken: payload.refresh_token,
    accessToken: payload.access_token,
    grantedScopes: (payload.scope ?? "").split(" ").filter(Boolean).sort(),
  };
}

export async function identityOf(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return ((await res.json()) as { emailAddress?: string }).emailAddress ?? null;
  } catch {
    return null;
  }
}

/** Best effort: an already-dead token errors, which is the desired state. */
export async function revoke(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
