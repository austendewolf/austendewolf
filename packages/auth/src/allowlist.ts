/**
 * Who may hold a session on any of these sites.
 *
 * These apps authenticate against a Supabase project, and a Supabase project's
 * `auth.users` table answers "is this a real account", not "does this person
 * belong here". Those were the same question only by accident: the old shared
 * project accumulated seventeen accounts from unrelated products, including
 * strangers, every one of which was a valid credential at this auth server.
 * This list is the boundary that actually matters.
 *
 * It lives in a shared package because it was briefly duplicated — one copy per
 * app, each with the owner address written out again, and a comment in each
 * asking the other not to drift. A rule enforced by comment is a rule waiting
 * to be broken, so there is now one definition and no copies.
 *
 * The owner is a constant rather than required configuration. These sites have
 * one user whose address is not a secret, and making it mandatory environment
 * only created a way to ship with sign-in silently bricked. `ALLOWED_EMAILS`
 * still overrides it, with `MCP_OWNER_EMAILS` accepted as the older name.
 */

const OWNER = "91.adewolf@gmail.com";

export function allowedEmails(): string[] {
  const configured = (process.env.ALLOWED_EMAILS ?? process.env.MCP_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : [OWNER];
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.toLowerCase());
}
