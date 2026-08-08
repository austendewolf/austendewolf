import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { isAllowed } from "@/lib/auth/allowlist";
import { originFrom } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Where a one-time sign-in link lands.
 *
 * Supabase can deliver the same link in two shapes depending on how the project
 * is configured, and which one arrives is not under this site's control:
 *
 *   code        the PKCE flow. Supabase verified the token on its own domain
 *               and handed back an authorisation code to exchange.
 *   token_hash  the older verification flow, where this route does the verify.
 *
 * Both are handled, because a project setting changing underneath the site
 * should not silently break the only way in.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = originFrom(request.headers);
  const next = safeNext(url.searchParams.get("next"));

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : null;

  if (!result) return reject(origin, "That sign-in link is not valid.");
  if (result.error) return reject(origin, linkError(result.error.message));

  /*
   * The link proves control of an inbox, not permission to be here. Supabase
   * will issue a session for any of the accounts in this shared project, so the
   * address is checked again and an unwanted one is signed straight back out
   * rather than left holding a working session.
   */
  if (!isAllowed(result.data.user?.email)) {
    await supabase.auth.signOut();
    return reject(origin, "This site is private. That account cannot sign in here.");
  }

  return NextResponse.redirect(new URL(next, origin));
}

/**
 * An expired or reused link is the common case and has a real remedy, so it
 * says so. Everything else stays generic.
 */
function linkError(message: string): string {
  return /expired|invalid|already/i.test(message)
    ? "That link has expired or was already used. Request a new one."
    : "That sign-in link is not valid.";
}

function reject(origin: string, message: string) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(message)}`, origin),
  );
}

/** Only ever continue to somewhere on this site. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
