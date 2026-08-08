import { connectAccount, disconnectAccount } from "@/app/account/actions";
import { ConnectionError, ConnectionHealth } from "@/components/mcp/connection-health";
import { Button } from "@/components/ui/button";
import { DEFAULT_SCOPES, SCOPE_CATALOG } from "@/lib/mcp/oauth";

/** "gmail.modify" reads better than the whole scope URL. */
const scopeLabel = (url: string) => url.split("/auth/").pop() ?? url;

/** Rendered on the server, so this never disagrees with the client's clock. */
export function stamp(date: Date | null): string {
  if (!date) return "unknown";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

export function since(date: Date | null): string {
  if (!date) return "";
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(ms / 60_000);
  return minutes > 0 ? `${minutes} minutes ago` : "just now";
}

/** The scope checkboxes, shared by the reconnect and add-account forms. */
export function ScopePicker({ granted }: { granted?: string[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
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
                /*
                 * Pre-checked with what the account already holds plus the
                 * catalogue defaults. Reconnecting must never silently narrow
                 * access, and a scope the account has but the panel forgot to
                 * tick would do exactly that.
                 */
                defaultChecked={
                  granted ? granted.includes(s.url) || DEFAULT_SCOPES.includes(s.url) : s.default
                }
                className="mt-0.5"
              />
              <span>{s.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

export interface ConnectionCardProps {
  name: string;
  email: string | null;
  scopes: string[];
  updatedAt: Date | null;
  health: { healthy: boolean; error: string | null };
  /** False when the deployment has no OAuth client, which disables reconnect. */
  configured: boolean;
}

export function ConnectionCard({
  name,
  email,
  scopes,
  updatedAt,
  health,
  configured,
}: ConnectionCardProps) {
  const reconnectId = `reconnect-${name}`;
  const removeId = `remove-${name}`;

  return (
    <div className="border px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p>
            <span className="font-mono text-sm text-foreground">{name}</span>
            <span className="ml-3 text-sm text-muted-foreground">
              {email ?? "identity unknown"}
            </span>
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            connected {stamp(updatedAt)}
            {since(updatedAt) && `, ${since(updatedAt)}`}
          </p>
        </div>
        <ConnectionHealth name={name} initial={health} />
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[5rem_1fr]">
        <dt className="text-muted-foreground">Access</dt>
        <dd className="font-mono">
          {scopes.length ? scopes.map(scopeLabel).join(", ") : "unknown"}
        </dd>
      </dl>

      <ConnectionError name={name} initial={health} />

      {/*
        Both forms are declared here and their buttons reference them by id, so
        the action row can be laid out on its own with the primary action last
        regardless of which form each button submits.
      */}
      <form action={connectAccount} id={reconnectId}>
        <input type="hidden" name="account" value={name} />
        <details className="mt-5">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Access to request on reconnect
          </summary>
          <div className="mt-4">
            <ScopePicker granted={scopes} />
          </div>
        </details>
      </form>
      <form action={disconnectAccount} id={removeId}>
        <input type="hidden" name="account" value={name} />
      </form>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button type="submit" form={removeId} variant="ghost" size="sm">
          Remove
        </Button>
        <Button type="submit" form={reconnectId} variant="outline" size="sm" disabled={!configured}>
          Reconnect
        </Button>
      </div>
    </div>
  );
}
