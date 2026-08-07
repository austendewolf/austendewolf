"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { setPassword, type PasswordState } from "@/app/account/password/actions";

const FIELD =
  "w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(
    setPassword,
    {},
  );

  if (state.done) {
    return (
      <div className="border border-border/60 px-4 py-5 text-sm">
        <p className="leading-relaxed">
          Password set. You can now sign in with your email and that password.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="password" className="block text-xs text-muted-foreground">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          // Tells a password manager to offer a generated one and to save it.
          autoComplete="new-password"
          required
          minLength={12}
          className={FIELD}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="confirm" className="block text-xs text-muted-foreground">
          Confirm
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className={FIELD}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Set password"}
      </Button>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
