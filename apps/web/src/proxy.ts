import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@awd/auth";

/**
 * Keeps the Supabase session fresh, and enforces that only the site owner may
 * hold one.
 *
 * The sign-in actions and the link callback both reject addresses that are not
 * on the allowlist. This is the line behind them: a session belonging to anyone
 * else is cleared on its next request, so a token minted before the allowlist
 * existed — or before an address was taken off it — cannot keep working.
 *
 * Named `proxy` because the `middleware` file convention is deprecated in this
 * version of Next.
 */
/** The host that exists to open the Daybook and nothing else. */
const DAYBOOK_HOST = "daybook.austendewolf.com";

export async function proxy(request: NextRequest) {
  // daybook.austendewolf.com is a front door for one page, so its root goes there.
  if (request.headers.get("host") === DAYBOOK_HOST && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/daybook";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() refreshes an expired access token and re-sets the cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !isAllowed(user.email)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=This+site+is+private.";
    const redirect = NextResponse.redirect(url);
    // Drop every Supabase cookie so the rejected session cannot linger.
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) redirect.cookies.delete(cookie.name);
    }
    return redirect;
  }

  // The Daybook is the owner's own list, so it is never shown to a visitor
  // without a session. Anyone else holding one was already signed out above;
  // the page and its actions still check for the owner themselves.
  if (!user && request.nextUrl.pathname.startsWith("/daybook")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent("/daybook")}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip static assets and image optimization; everything else passes through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
