import { ConnectionCard, ScopePicker } from "@/components/mcp/connection-card";
import { Button } from "@/components/ui/button";
import { checkAccount, listAccounts } from "@/lib/mcp/accounts";
import { oauthConfigured, redirectUri } from "@/lib/mcp/oauth";
import { getViewer } from "@/lib/mcp/owner";
import { connectAccount } from "./actions";

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
  searchParams: Promise<{ connected?: string; removed?: string; error?: string }>;
}) {
  const { connected, removed, error } = await searchParams;
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
            href="/login?next=%2Faccount"
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

    </div>
  );
}
