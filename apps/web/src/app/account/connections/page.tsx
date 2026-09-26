import { ConnectionCard, ScopePicker } from "@/components/mcp/connection-card";
import { Button } from "@/components/ui/button";
import { checkAccount, listAccounts } from "@/lib/mcp/accounts";
import {
  acceptedClients,
  connectorConfigured,
  probeAuthorizationServer,
  resourceUrl,
} from "@/lib/mcp/connector";
import { oauthConfigured, redirectUri } from "@/lib/mcp/oauth";
import { getViewer } from "@/lib/mcp/owner";
import { createClient } from "@/lib/supabase/server";
import { connectAccount, revokeConnector } from "@/app/account/actions";

export const metadata = { title: "Connections — Austen DeWolf" };
export const runtime = "nodejs";

/**
 * Manage the Google accounts the MCP server acts as.
 *
 * Restricted to the owner. The Supabase project behind this site is shared with
 * other products and holds accounts that are not the owner's, so being signed
 * in is not on its own enough to reach this page.
 */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    removed?: string;
    revoked?: string;
    error?: string;
  }>;
}) {
  const { connected, removed, revoked, error } = await searchParams;
  const viewer = await getViewer();

  if (!viewer.isOwner) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
        <p className="mt-3 text-muted-foreground">
          {viewer.signedIn
            ? "You are signed in, but this page is limited to the site owner."
            : "This page is private."}
        </p>
        {/* Signed in as the wrong account, the way out is to sign out — but the
            key already offers exactly that on every page, so repeating it here
            would be the same control twice. */}
        {!viewer.signedIn && (
          <a
            href="/login?next=%2Faccount%2Fconnections"
            className="mt-8 inline-block border px-4 py-2 text-sm hover:border-accent"
          >
            Sign in
          </a>
        )}
      </div>
    );
  }

  const accounts = await listAccounts();
  const health = await Promise.all(accounts.map((a) => checkAccount(a.name)));
  const configured = oauthConfigured();

  // Applications this project's own OAuth server has issued tokens to, which is
  // how a Claude connector holds a credential for the MCP endpoint. An empty list
  // is the normal state until one is connected, and an error here should not take
  // the Google half of the page down with it.
  const supabase = await createClient();
  const grants = await supabase.auth.oauth
    .listGrants()
    .then(({ data }) => data ?? [])
    .catch(() => []);
  const probe = await probeAuthorizationServer();
  const accepted = acceptedClients();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      {/*
        No account header here. Who you are signed in as, and the way out, live
        in the key — which is drawn on every page — so repeating them at the top
        of this one was the same two controls twice.
      */}
      <h1 className="text-4xl font-bold tracking-tight">Connections</h1>
      <p className="mt-3 text-muted-foreground leading-relaxed">
        Google accounts the MCP server at{" "}
        <code className="font-mono text-sm">mcp.austendewolf.com</code> can act as. Each one
        is re-checked against Google every thirty seconds.
      </p>

      {connected && (
        <p className="mt-6 border px-4 py-3 text-sm">
          <span className="text-accent">{connected}</span> is connected.
        </p>
      )}
      {removed && (
        <p className="mt-6 border px-4 py-3 text-sm">
          <span className="text-accent">{removed}</span> was removed and revoked at Google.
        </p>
      )}
      {revoked && (
        <p className="mt-6 border px-4 py-3 text-sm">
          <span className="text-accent">{revoked}</span> can no longer reach the gateway.
        </p>
      )}
      {error && (
        <p className="mt-6 border border-destructive/50 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!configured && (
        <div className="mt-6 border border-destructive/50 px-4 py-3 text-sm">
          <p className="font-medium">Connecting is unavailable.</p>
          <p className="mt-2 text-muted-foreground leading-relaxed">
            This deployment has no Google OAuth client. Create a{" "}
            <span className="text-foreground">Web application</span> client in the Google
            Cloud console, add the redirect URI below, then set{" "}
            <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and{" "}
            <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code>.
          </p>
          <code className="mt-3 block font-mono text-xs break-all">{redirectUri()}</code>
        </div>
      )}

      {/*
        Adding an account is the reason to come here with nothing in trouble, so
        it is a control at the top rather than a form at the bottom of the page.
        `details` keeps it working with no JavaScript.
      */}
      <details className="group mt-12 border-b pb-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs uppercase tracking-widest text-muted-foreground marker:content-none">
          <span>
            {accounts.length} connected {accounts.length === 1 ? "account" : "accounts"}
          </span>
          <span className="text-accent group-open:hidden">+ add connection</span>
          <span className="hidden text-accent group-open:inline">cancel</span>
        </summary>

        <form action={connectAccount} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="new-account"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
            >
              Handle
            </label>
            <input
              id="new-account"
              name="account"
              placeholder="e.g. personal"
              pattern="[a-z0-9_\-]+"
              required
              className="mt-2 block w-full max-w-xs border px-3 py-2 font-mono text-sm"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              This is what tools take as their{" "}
              <code className="font-mono">account</code> argument.
            </p>
          </div>
          <ScopePicker />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!configured}>
              Continue to Google
            </Button>
          </div>
        </form>
      </details>

      <div className="mt-8 space-y-6">
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Nothing is connected yet. Connecting an account lets the MCP server read mail,
            calendar, and files on its behalf. Every tool names the account it is acting as,
            so connecting more than one is fine.
          </p>
        )}

        {accounts.map((a, i) => (
          <ConnectionCard
            key={a.name}
            name={a.name}
            email={a.email}
            scopes={a.scopes}
            updatedAt={a.updatedAt}
            health={health[i]}
            configured={configured}
          />
        ))}
      </div>

      {/*
        The other direction. Everything above is an account this server acts as;
        this is an application allowed to act as Austen against the gateway.
      */}
      <div className="mt-20 border-t pt-8">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Applications with access
        </h2>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          Signed in through this site to reach{" "}
          <code className="font-mono text-xs break-all">{resourceUrl()}</code>. Revoking one kills
          its sessions and refresh tokens; a token already issued stops working when it expires.
        </p>

        {/*
          The readiness panel. Whether an application can sign in at all depends
          on three things this page can check and none it can change: a project
          setting in the Supabase dashboard, a client registered there, and an
          environment variable naming that client. Checking beats guessing, and
          asking the authorization server is the only way to know the setting is
          on.
        */}
        <dl className="mt-8 space-y-3 border-t pt-6 text-sm">
          <Row label="Authorization server">
            {probe.reachable ? (
              <span className="text-accent">answering</span>
            ) : (
              <span className="text-destructive">
                {probe.error ?? "not reachable"}
              </span>
            )}
          </Row>
          {probe.url && (
            <Row label="Discovery">
              <span className="font-mono text-xs break-all">{probe.url}</span>
            </Row>
          )}
          <Row label="PKCE S256">
            {probe.pkce ? (
              <span className="text-accent">advertised</span>
            ) : (
              <span className="text-muted-foreground">not advertised</span>
            )}
          </Row>
          <Row label="Dynamic registration">
            {probe.dynamicRegistration ? (
              <span className="text-destructive">on, and it should be off</span>
            ) : (
              <span className="text-accent">off</span>
            )}
          </Row>
          <Row label="Accepted clients">
            {accepted.length ? (
              <span className="font-mono text-xs break-all">{accepted.join(", ")}</span>
            ) : (
              <span className="text-destructive">
                none, so no token is accepted
              </span>
            )}
          </Row>
          <Row label="Connector URL">
            <span className="font-mono text-xs break-all">{resourceUrl()}</span>
          </Row>
        </dl>

        {!connectorConfigured() && (
          <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
            Nothing can sign in until the OAuth server is enabled in the Supabase dashboard with
            its authorization path set to <code className="font-mono text-xs">/oauth/consent</code>,
            a client is registered there against{" "}
            <code className="font-mono text-xs">https://claude.ai/api/mcp/auth_callback</code>, and{" "}
            <code className="font-mono text-xs">MCP_OAUTH_CLIENT_IDS</code> names that client. The
            rows above say which of the three is still missing.
          </p>
        )}

        <div className="mt-6 space-y-4">
          {grants.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing has been authorized.</p>
          )}

          {grants.map((grant) => (
            <div
              key={grant.client.id}
              className="flex flex-wrap items-baseline justify-between gap-4 border px-4 py-3"
            >
              <div>
                <p className="text-sm">{grant.client.name}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {grant.scopes.join(" ") || "no scopes"} · since{" "}
                  {new Date(grant.granted_at).toLocaleDateString("en-US")}
                </p>
              </div>
              <form action={revokeConnector}>
                <input type="hidden" name="client" value={grant.client.id} />
                <input type="hidden" name="name" value={grant.client.name} />
                <Button type="submit" variant="destructive" size="sm">
                  Revoke
                </Button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-4">
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
