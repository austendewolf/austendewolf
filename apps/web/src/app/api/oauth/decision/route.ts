import { isAllowed } from "@awd/auth";
import { originFrom } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the consent screen's two buttons land.
 *
 * Approving is what mints an authorization code, so every check the page made is
 * made again here: a page that renders is not evidence about who is submitting.
 *
 * Supabase's own client would redirect the browser itself, which is a thing only
 * a browser can do, so this asks for the URL and issues the redirect from the
 * server.
 */
export async function POST(request: Request) {
  const origin = originFrom(request.headers);
  const back = (authorizationId: string, message: string) =>
    Response.redirect(
      `${origin}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&error=${encodeURIComponent(message)}`,
      303,
    );

  // Supabase's session cookies are SameSite=Lax, so a cross-site POST arrives
  // without one and fails the checks below anyway. This refuses it earlier and
  // more plainly.
  const sent = request.headers.get("origin");
  if (sent && sent !== origin) {
    return Response.json({ error: "cross-origin request refused" }, { status: 403 });
  }

  const form = await request.formData();
  const authorizationId = String(form.get("authorization_id") ?? "").trim();
  const decision = String(form.get("decision") ?? "");
  if (!authorizationId) {
    return Response.json({ error: "missing authorization_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowed(user.email)) {
    return Response.json({ error: "not authorized" }, { status: 403 });
  }

  if (decision === "approve") {
    const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId, {
      skipBrowserRedirect: true,
    });
    if (error || !data) return back(authorizationId, error?.message ?? "approving failed");
    return Response.redirect(data.redirect_url, 303);
  }

  const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId, {
    skipBrowserRedirect: true,
  });
  if (error || !data) return back(authorizationId, error?.message ?? "denying failed");
  return Response.redirect(data.redirect_url, 303);
}
