"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { signIn, type LoginState } from "@/app/login/actions";

const FIELD =
  "w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";

/**
 * Sign in: a stack of routes, one per line, with nothing between them.
 *
 * An earlier version put every field of every route on screen at once, divided
 * by two "or" rules, so the page opened on a password box whether or not that
 * was the route being taken. This opens on the choice instead, and the fields
 * for a route appear once it is picked.
 *
 * Touch ID leads when the device has it, because it is the route that should be
 * used. The check runs in the browser and the button stays off the page
 * entirely when it comes back false, which is what happens in a development
 * session: the passkey is bound to `austendewolf.com` and not to localhost.
 *
 * Password and link share one email field and travel as `intent`, so each
 * submits and works without JavaScript.
 */
type Route = "pick" | "password" | "link";

export function LoginForm({ next = "/" }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const [route, setRoute] = useState<Route>("pick");
  const [passkeys, setPasskeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = typeof window === "undefined" ? undefined : window.PublicKeyCredential;
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
        setError("Touch ID did not work here. Take one of the other routes.");
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

  if (route === "pick") {
    return (
      <div className="space-y-3">
        {passkeys && (
          <Button type="button" onClick={usePasskey} disabled={busy} className="w-full">
            {busy ? "Waiting for your device..." : "Continue with Touch ID"}
          </Button>
        )}
        <Button
          type="button"
          variant={passkeys ? "outline" : "default"}
          onClick={() => setRoute("link")}
          className="w-full"
        >
          Email me a sign-in link
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setRoute("password")}
          className="w-full"
        >
          Use a password
        </Button>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
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
          autoFocus
          className={FIELD}
        />
      </div>

      {route === "password" && (
        <div className="space-y-2">
          <label htmlFor="password" className="block text-xs text-muted-foreground">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className={FIELD}
          />
        </div>
      )}

      <Button
        type="submit"
        name="intent"
        value={route}
        disabled={pending}
        className="w-full"
      >
        {pending ? "Working..." : route === "password" ? "Sign in" : "Send the link"}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={() => setRoute("pick")}
        className="w-full"
      >
        Back
      </Button>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
