"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign in with Touch ID or Face ID.
 *
 * The credential is held by the device and never leaves it, so there is no
 * shared secret to guess, reuse or leak. The passkey is bound to
 * `austendewolf.com`, which covers the notebook subdomain and deliberately
 * does not cover localhost: a development session still uses the emailed link.
 *
 * A passkey is discoverable, so no email is typed. The authenticator knows
 * which account it holds and names it in its own prompt.
 */
export function PasskeyButton({ next = "/" }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPasskey();
    if (error) {
      // A cancelled prompt is a decision, not a failure, so it says nothing.
      setBusy(false);
      if (!/abort|cancel|NotAllowed/i.test(error.message)) {
        setError("That passkey did not work. Use a sign-in link instead.");
      }
      return;
    }
    // A full load rather than a router push: the session lives in cookies the
    // server has to read again before it will hand over a private page.
    window.location.assign(next);
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={go} disabled={busy} className="w-full">
        {busy ? "Waiting for your device..." : "Sign in with Touch ID"}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
