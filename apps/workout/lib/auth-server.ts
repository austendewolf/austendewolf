import { NextResponse, type NextRequest } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { isAllowed } from "@awd/auth";

/**
 * Server-side Supabase client used only for validating bearer tokens
 * coming in on API requests. We never persist a session here — every
 * call is stateless.
 */
function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars missing on the server");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Validates the Authorization: Bearer <token> header on the incoming
 * request. Returns the authenticated User on success, or a NextResponse
 * (401) that the route should return directly on failure.
 *
 *   const auth = await requireUser(req);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is User
 */
export async function requireUser(req: NextRequest): Promise<User | NextResponse> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = header?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const sb = serverClient();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // A valid token only proves this person signed up for one of the products
    // sharing the identity plane, which is not the same as belonging here. The
    // workout tables are single-tenant, so an unrecognised account reaching
    // this point would be reading and writing the owner's rows.
    if (!isAllowed(data.user.email)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return data.user;
  } catch {
    return NextResponse.json({ error: "auth_failed" }, { status: 401 });
  }
}
