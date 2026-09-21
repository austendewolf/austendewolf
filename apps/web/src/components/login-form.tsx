"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { signIn, type LoginState } from "@/app/login/actions";

const FIELD =
  "w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";

/* A route reads as a row: its icon on the left edge, its label starting where
   every other label starts. Centred text would make three unrelated widths. */
const ROUTE = "w-full justify-start gap-3 px-3";

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
/* Three arcs around one centre. A denser fingerprint collapses into a blob at 14px. */
const TOUCH = "M12 11v6M8.5 8.5a5 5 0 0 1 7 4.5v4M5 6.5a9 9 0 0 1 14 3.5v3";
const MAIL = "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l9 6 9-6";
const LOCK = "M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 11V7a4 4 0 1 1 8 0v4";

/**
 * Sign in: one email field, then the routes that email can take.
 *
 * An earlier version put every field of every route on screen at once, cut by
 * two "or" rules, so the page opened on a password box whether or not that was
 * the route being taken. A version after that opened on the routes alone and
 * made you pick before typing anything, which cost a step and threw the address
 * away when you changed your mind.
 *
 * The address comes first because both email routes need it and neither needs
 * anything else. Asking for a password reveals the field in place, so what has
 * already been typed carries forward.
 *
 * The passkey route leads when the device has the hardware, because it is the
 * one that
 * should be used and it needs no address at all. The check runs in the browser
 * and the button stays off the page when it comes back false, which is what
 * happens in a development session: the passkey is bound to `austendewolf.com`
 * and not to localhost.
 *
 * Which button was pressed travels as `intent`, so this submits and works
 * without JavaScript, with the password field shown from the start.
 */
export function LoginForm({ next = "/" }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const [withPassword, setWithPassword] = useState(false);
  const [passkeys, setPasskeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = typeof window === "undefined" ? undefined : window.PublicKeyCredential;
    // No WebAuthn, or no built-in authenticator: the browser says so before any
    // prompt, so the button never reaches a machine that cannot use it.
    if (!api?.isUserVerifyingPlatformAuthenticatorAvailable) return;
    let live = true;
    api
      .isUserVerifyingPlatformAuthenticatorAvailable()
      .then((ok) => { if (live) setPasskeys(ok); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  async function usePasskey() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPasskey();
    if (error) {
      // A cancelled prompt is a decision, not a failure, so it says nothing.
      setBusy(false);
      if (!/abort|cancel|NotAllowed/i.test(error.message)) {
        // The device has the hardware, so the check above passed, and the
        // credential still did not work: no passkey is enrolled, or this origin
        // is not the one it is bound to. Either way the route is not available
        // here, so it stops being offered for the rest of the visit.
        setPasskeys(false);
        setError("No passkey worked here. Take one of the other routes.");
      }
      return;
    }
    // A full load rather than a router push: the session lives in cookies the
    // server has to read again before it will hand over a private page.
    window.location.assign(next);
  }

  if (state.sent) {
    return (
      <div className="border border-border/60 px-4 py-5 text-sm">
        <p className="leading-relaxed">
          If <span className="font-mono">{state.sent}</span> can sign in here, a
          link is on its way. It is good for one use.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <label htmlFor="email" className="block text-xs text-muted-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={FIELD}
        />
      </div>

      {withPassword && (
        <div className="space-y-2 pb-1">
          <label htmlFor="password" className="block text-xs text-muted-foreground">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            className={FIELD}
          />
        </div>
      )}

      {withPassword ? (
        <Button type="submit" name="intent" value="password" disabled={pending} className={ROUTE}>
          <Icon d={LOCK} />
          {pending ? "Working..." : "Sign in"}
        </Button>
      ) : (
        <Button type="submit" name="intent" value="link" disabled={pending} className={ROUTE}>
          <Icon d={MAIL} />
          {pending ? "Working..." : "Email me a sign-in link"}
        </Button>
      )}

      {/* The address and its button are one thing. The rule marks where that
          ends and the routes that do not use it begin. */}
      <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border/50" />
        or
        <span className="h-px flex-1 bg-border/50" />
      </div>

      {passkeys && !withPassword && (
        <Button type="button" variant="outline" onClick={usePasskey} disabled={busy} className={ROUTE}>
          <Icon d={TOUCH} />
          {busy ? "Waiting for your device..." : "Continue with a passkey"}
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={() => setWithPassword(!withPassword)}
        className={ROUTE}
      >
        <Icon d={withPassword ? MAIL : LOCK} />
        {withPassword ? "Email me a link instead" : "Use a password"}
      </Button>

      {(state.error || error) && (
        <p className="text-sm text-destructive" role="alert">
          {state.error || error}
        </p>
      )}
    </form>
  );
}
