import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth/allowlist";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Completes a GitHub sign-in.
 *
 * GitHub will authenticate anyone, so the session is only kept if the address
 * behind it is on this site's allowlist. Anyone else is signed straight back
 * out, so an unwanted account never holds a usable session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) return NextResponse.redirect(new URL(next, url.origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  if (!isAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("This site is private. That account is not permitted to sign in.")}`,
        url.origin,
      ),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
