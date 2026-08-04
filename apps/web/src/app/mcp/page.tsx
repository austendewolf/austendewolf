import { Button } from "@/components/ui/button";
import { checkAccount, listAccounts } from "@/lib/mcp/accounts";
import { DEFAULT_SCOPES, SCOPE_CATALOG, oauthConfigured, redirectUri } from "@/lib/mcp/oauth";
import { getViewer } from "@/lib/mcp/owner";
import { connectAccount, disconnectAccount } from "./actions";

export const metadata = { title: "Connections — Austen DeWolf" };
export const runtime = "nodejs";

/** "gmail.modify" reads better than the whole scope URL. */
const scopeLabel = (url: string) => url.split("/auth/").pop() ?? url;

function since(date: Date | null): string {
  if (!date) return "unknown";
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "just now";
}

/**
 * Manage the Google accounts the MCP server acts as.
 *
 * Restricted to the owner. Sign-in on this site is open to anyone with a
 * GitHub account, so being signed in is not enough to reach this page.
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
          {viewer.misconfigured
            ? "This page has no owner configured, so it is closed to everyone."
            : viewer.signedIn
              ? "You are signed in, but this page is limited to the site owner."
              : "This page is private."}
        </p>
        {!viewer.signedIn && (
          <a
            href="/login"
            className="mt-8 inline-block rounded-sm border border-border/60 px-4 py-2 text-sm hover:border-accent/50"
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
  const working = health.filter((h) => h.healthy).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Connections</h1>
      <p className="mt-3 text-muted-foreground leading-relaxed">
        Google accounts the MCP server at{" "}
        <code className="font-mono text-sm">mcp.austendewolf.com</code> can act as.
        {accounts.length > 0 && ` ${working} of ${accounts.length} working.`}
      </p>

      {connected && (
        <p className="mt-6 rounded-sm border border-border/60 bg-card/40 px-4 py-3 text-sm">
          <span className="text-accent">{connected}</span> is connected.
        </p>
      )}
      {removed && (
        <p className="mt-6 rounded-sm border border-border/60 bg-card/40 px-4 py-3 text-sm">
          <span className="text-accent">{removed}</span> was removed and revoked at Google.
        </p>
      )}
      {error && (
        <p className="mt-6 rounded-sm border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {!configured && (
        <div className="mt-6 rounded-sm border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-medium">Reconnecting is unavailable.</p>
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

      <div className="mt-10 space-y-4">
        {accounts.length === 0 && (
          <div className="rounded-sm border border-border/60 bg-card/40 p-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              No accounts are connected. Connecting one lets the MCP server read mail,
              calendar, and files on its behalf. Every tool names the account it is acting
              as, so connecting more than one is fine.
            </p>
          </div>
        )}

        {accounts.map((a, i) => {
          const state = health[i];
          return (
            <div key={a.name} className="rounded-sm border border-border/60 bg-card/40 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-sm text-foreground">{a.name}</span>
                  <span className="ml-3 text-sm text-muted-foreground">
                    {a.email ?? "identity unknown"}
                  </span>
                </div>
                <span
                  className={`font-mono text-xs ${state.healthy ? "text-accent" : "text-destructive"}`}
                >
                  {state.healthy ? "working" : "needs reconnect"}
                </span>
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[7rem_1fr]">
                <dt className="text-muted-foreground">Access</dt>
                <dd className="font-mono">
                  {a.scopes.length ? a.scopes.map(scopeLabel).join(", ") : "unknown"}
                </dd>
                <dt className="text-muted-foreground">Connected</dt>
                <dd className="font-mono">{since(a.updatedAt)}</dd>
              </dl>

              {!state.healthy && state.error && (
                <p className="mt-3 text-xs text-destructive">{state.error}</p>
              )}

              <div className="mt-5 flex gap-2">
                <form action={connectAccount}>
                  <input type="hidden" name="account" value={a.name} />
                  <Button type="submit" variant="outline" size="sm" disabled={!configured}>
                    Reconnect
                  </Button>
                </form>
                <form action={disconnectAccount}>
                  <input type="hidden" name="account" value={a.name} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 rounded-sm border border-border/60 bg-card/40 p-5">
        <h2 className="text-sm font-medium">Connect another account</h2>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          Pick a short handle and what it may access. The handle is what tools take as
          their <code className="font-mono">account</code> argument.
        </p>
        <form action={connectAccount} className="mt-5 space-y-5">
          <input
            name="account"
            placeholder="handle, e.g. personal"
            pattern="[a-z0-9_\-]+"
            required
            className="w-full max-w-xs rounded-sm border border-border/60 bg-background px-3 py-2 font-mono text-sm"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {SCOPE_CATALOG.map((group) => (
              <fieldset key={group.service} className="space-y-2">
                <legend className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {group.service}
                </legend>
                {group.scopes.map((s) => (
                  <label key={s.url} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="scope"
                      value={s.url}
                      defaultChecked={DEFAULT_SCOPES.includes(s.url)}
                      className="mt-0.5"
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <Button type="submit" size="sm" disabled={!configured}>
            Continue to Google
          </Button>
        </form>
      </div>
    </div>
  );
}
