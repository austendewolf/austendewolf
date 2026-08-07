/**
 * Who may hold a session on this site.
 *
 * The Supabase project behind this site is shared with other products, and it
 * holds accounts that have nothing to do with this one — including strangers
 * who signed up through a different site on the same project. Any of them can
 * present a valid credential to this project's auth server, so "Supabase says
 * this is a real user" is not the question worth asking. This list is.
 *
 * That is also why it cannot live in the project's auth settings: those apply
 * to every site on the project, so the rule has to be enforced here.
 *
 * The owner is a constant rather than required configuration. This site has one
 * user and their address is not a secret — making it an environment variable
 * only created a way for the site to ship with sign-in silently bricked, which
 * is exactly what happened. `ALLOWED_EMAILS` still overrides it when set.
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
