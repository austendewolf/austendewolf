"use client";

import { useState, useTransition } from "react";

import { GitHubIcon } from "@/components/social-icons";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign-in for a private site.
 *
 * Email is the primary route: a one-time link goes to the owner's address, so
 * possession of that inbox is the credential and there is no password to leak.
 * GitHub remains as a second option. Either way the callback checks the
 * address against the allowlist before the session is kept.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sendLink(formData: FormData) {
    const address = String(formData.get("email") ?? "").trim();
    if (!address) return;
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          // Never create an account from a sign-in attempt; this site has
          // exactly one user and they already exist.
          shouldCreateUser: false,
        },
      });
      // A wrong address is reported the same as a right one, so this form
      // cannot be used to discover who the owner is.
      if (sendError && !/user not found|signups not allowed/i.test(sendError.message)) {
        setError(sendError.message);
        return;
      }
      setSent(true);
    });
  }

  function signInWithGithub() {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) setError(oauthError.message);
    });
  }

  if (sent) {
    return (
      <div className="rounded-sm border border-border/40 px-4 py-5 text-sm">
        <p className="leading-relaxed">
          If <span className="font-mono">{email}</span> can sign in here, a link is on
          its way.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 text-xs text-muted-foreground hover:text-accent transition-colors"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form action={sendLink} className="space-y-3">
        <label htmlFor="email" className="block text-xs text-muted-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-sm border border-border/40 bg-background px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending..." : "Email me a sign-in link"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border/40" />
        or
        <span className="h-px flex-1 bg-border/40" />
      </div>

      <Button
        onClick={signInWithGithub}
        disabled={pending}
        className="w-full"
        variant="outline"
        type="button"
      >
        <GitHubIcon className="size-4" />
        Continue with GitHub
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
