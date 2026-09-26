import { redirect } from "next/navigation";

import { isAllowed } from "@awd/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Authorize — Austen DeWolf" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The consent screen for this project's OAuth server.
 *
 * Supabase Auth runs the authorization endpoint and hands the browser here with
 * an `authorization_id`; approving or denying is this site's job, and the token
 * exchange goes back to Supabase afterwards. The dashboard's Authorization Path
 * setting has to name this route, and it is combined with the project's Site
 * URL, so both have to agree with where this page is actually served.
 *
 * Gated on the allowlist, not on holding a session. The Supabase project behind
 * this site is shared with other products, so a valid account is not evidence
 * that the person in front of it may hand anything a credential.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { authorization_id: authorizationId, error: failed } = await searchParams;

  if (!authorizationId) {
    return (
      <Shell>
        <p className="mt-3 text-muted-foreground">
          This page opens as part of connecting an application, and it was reached without an
          authorization request.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  if (!isAllowed(user.email)) {
    return (
      <Shell>
        <p className="mt-3 text-muted-foreground">
          This account cannot authorize applications here.
        </p>
      </Shell>
    );
  }

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(
    authorizationId,
  );

  if (error || !details) {
    return (
      <Shell>
        <p className="mt-3 text-muted-foreground">
          {error?.message ?? "That authorization request is no longer valid. Start again."}
        </p>
      </Shell>
    );
  }

  // Consent already given for this client and these scopes: Supabase answers with
  // somewhere to send the browser instead of anything to approve.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  const scopes = details.scope.split(" ").filter(Boolean);

  return (
    <Shell>
      <p className="mt-3 text-muted-foreground leading-relaxed">
        <span className="text-foreground">{details.client.name}</span> is asking to act as{" "}
        {user.email}.
      </p>

      {failed && (
        <p className="mt-6 border border-destructive/50 px-4 py-3 text-sm text-destructive">
          {failed}
        </p>
      )}

      <dl className="mt-10 space-y-4 border-t pt-6 text-sm">
        <div className="flex justify-between gap-6">
          <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Application
          </dt>
          <dd className="text-right">{details.client.name}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Returns to
          </dt>
          <dd className="break-all text-right font-mono text-xs">{details.redirect_uri}</dd>
        </div>
        {scopes.length > 0 && (
          <div className="flex justify-between gap-6">
            <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Scopes
            </dt>
            <dd className="text-right font-mono text-xs">{scopes.join(" ")}</dd>
          </div>
        )}
      </dl>

      {/*
        The scope list understates the grant. Supabase's OAuth server offers the
        standard scopes only, so "email" is what the protocol can say, while what
        an approved application can actually reach is the MCP gateway's tools.
        Saying so here is the difference between informed consent and a checkbox.
      */}
      <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
        Approving lets it call the MCP gateway: the connected Google accounts and the daybook.
        Managing connections stays out of reach. You can revoke this from{" "}
        <a href="/account/connections" className="text-accent underline-offset-4 hover:underline">
          connections
        </a>{" "}
        at any time.
      </p>

      <form action="/api/oauth/decision" method="POST" className="mt-10 flex justify-end gap-3">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <Button type="submit" name="decision" value="deny" variant="outline" size="sm">
          Deny
        </Button>
        <Button type="submit" name="decision" value="approve" size="sm">
          Approve
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-3xl font-bold tracking-tight">Authorize</h1>
      {children}
    </div>
  );
}
