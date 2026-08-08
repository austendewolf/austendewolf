"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isAllowed } from "@/lib/auth/allowlist";
import { emailRedirectTo } from "@/lib/auth/brand";
import { originFrom } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-in for a private site.
 *
 * Both routes run on the server rather than in the browser, for one reason:
 * the allowlist is the only thing standing between this site and the other
 * accounts in a Supabase project shared with several products. It cannot be
 * shipped to the client, so the check has to happen here — before a session is
 * ever minted, not after one is cleaned up.
 */

export interface LoginState {
  error?: string;
  /** Set once a link has been requested, so the form can acknowledge it. */
  sent?: string;
}

/**
 * A single message for every failure mode.
 *
 * Distinguishing "no such account" from "wrong password" from "not allowed
 * here" tells an attacker which addresses exist and which one owns the site.
 * There is one person who needs to sign in, and they know which of the three
 * it was.
 */
const REJECTED = "Email or password is incorrect.";

/**
 * One action for both buttons.
 *
 * The form carries a single email field and submits to the same place either
 * way; which button was pressed arrives as `intent`. That keeps the two routes
 * from drifting into separate forms with separate state, and it means the page
 * works before any JavaScript has run.
 */
export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "password");
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (!email) return { error: "Enter an email address." };

  if (intent === "link") return sendLink(email, next);
  return withPassword(email, String(formData.get("password") ?? ""), next);
}

async function withPassword(
  email: string,
  password: string,
  next: string,
): Promise<LoginState> {
  if (!password) return { error: "Enter a password, or ask for a sign-in link." };

  // Checked before the credentials are, so a correct password for an account
  // that is not permitted here never produces a session at all.
  if (!isAllowed(email)) return { error: REJECTED };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: REJECTED };

  // Outside any try: redirect throws, and catching it would report a
  // successful sign-in as a failure.
  redirect(next);
}

async function sendLink(email: string, next: string): Promise<LoginState> {
  // A disallowed address gets the same acknowledgement as the real one, and no
  // mail. Reporting the difference would turn this form into a way to ask who
  // owns the site.
  if (!isAllowed(email)) return { sent: email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: emailRedirectTo(await siteOrigin(), next),
      // This site has one user and they already exist. A sign-in attempt must
      // never be able to create an account.
      shouldCreateUser: false,
    },
  });

  // "User not found" and "signups not allowed" are the expected answer for
  // anything that is not the owner, and they say so out loud — swallow them
  // and report the same thing as success.
  if (error && !/user not found|signups not allowed|not authorized/i.test(error.message)) {
    return { error: error.message };
  }

  return { sent: email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** Where the emailed link should come back to. */
async function siteOrigin(): Promise<string> {
  return originFrom(await headers());
}

/**
 * Only ever redirect within this site.
 *
 * `next` arrives from the query string, so without this a crafted link could
 * carry someone through sign-in and straight back out to another origin.
 */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
