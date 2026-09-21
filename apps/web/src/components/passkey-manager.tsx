"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface Passkey {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
}

const day = (s: string | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "";

/**
 * The passkeys registered to this account.
 *
 * Registering one needs a session already, so this lives behind the sign-in
 * rather than next to it. Each key names the thing holding it, which is how you
 * tell the laptop's from the phone's when one of them is lost.
 */
export function PasskeyManager() {
  const [keys, setKeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().auth.passkey.list();
    if (error) { setError("Could not read the registered passkeys."); setKeys([]); return; }
    setKeys((data ?? []) as Passkey[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function register() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.registerPasskey();
    setBusy(false);
    // A cancelled prompt is a decision, so it reports nothing.
    if (error && !/abort|cancel|NotAllowed/i.test(error.message)) {
      setError("That passkey was not registered. Try again on this device.");
      return;
    }
    if (!error) await load();
  }

  async function remove(id: string) {
    setBusy(true);
    await createClient().auth.passkey.delete({ passkeyId: id });
    setBusy(false);
    await load();
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium">Passkeys</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Your device holds the key and unlocks it with Touch ID or Face ID.
          Nothing is typed and nothing is shared, so there is no password here
          for anyone to guess.
        </p>
      </div>

      {keys === null ? (
        <p className="text-sm text-muted-foreground">Reading...</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No passkey is registered yet.</p>
      ) : (
        <ul className="divide-y border-y">
          {keys.map((k) => (
            <li key={k.id} className="flex items-baseline justify-between gap-4 py-3">
              <div>
                <div className="text-sm">{k.friendly_name || "Passkey"}</div>
                <div className="text-xs text-muted-foreground">
                  added {day(k.created_at)}
                  {k.last_used_at ? `, last used ${day(k.last_used_at)}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(k.id)}
                disabled={busy}
                className="text-xs text-muted-foreground underline hover:text-destructive"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" onClick={register} disabled={busy} variant="outline" className="w-full">
        {busy ? "Waiting for your device..." : "Add a passkey on this device"}
      </Button>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
