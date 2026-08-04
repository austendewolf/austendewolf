import { upsertAccount } from "@/lib/mcp/accounts";
import { exchangeCode, identityOf, verifyState } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

/**
 * Where Google returns the browser after consent.
 *
 * This route is deliberately not owner-gated: the authorization code is bound
 * to a signed state value this server issued minutes earlier, which is what
 * authenticates the request. Google will not carry a session cookie back.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (message: string, key: "connected" | "error") =>
    Response.redirect(`${url.origin}/mcp?${key}=${encodeURIComponent(message)}`, 303);

  const denied = url.searchParams.get("error");
  if (denied) return back(`Google returned: ${denied}`, "error");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("the callback was missing its code or state", "error");

  try {
    const { account } = verifyState(state);
    const { refreshToken, accessToken, grantedScopes } = await exchangeCode(code);
    await upsertAccount({
      name: account,
      email: await identityOf(accessToken),
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken,
      scopes: grantedScopes,
    });
    return back(account, "connected");
  } catch (err) {
    return back(err instanceof Error ? err.message : String(err), "error");
  }
}
