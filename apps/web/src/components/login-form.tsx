"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { signIn, type LoginState } from "@/app/login/actions";

const FIELD =
  "w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";

/**
 * Email and password, or a link to the same address.
 *
 * Both are on screen at once and share one email field. An earlier version hid
 * one behind a toggle, which meant the second route only existed if you knew
 * to look for it — and made the form depend on client state to show a field
 * that has no reason to be conditional.
 *
 * Which button was pressed travels as `intent`, so this submits and works
 * without JavaScript.
 */
export function LoginForm({ next = "/" }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});

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
          className={FIELD}
        />
      </div>

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

      <Button
        type="submit"
        name="intent"
        value="password"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Working..." : "Sign in"}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border/50" />
        or
        <span className="h-px flex-1 bg-border/50" />
      </div>

      {/* Same email field, no password. The button says which route to take. */}
      <Button
        type="submit"
        name="intent"
        value="link"
        variant="outline"
        disabled={pending}
        className="w-full"
      >
        Email me a sign-in link
      </Button>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
