/**
 * Who may hold a session on this site.
 *
 * Sign-in goes through GitHub, which means anyone on GitHub could otherwise
 * authenticate here. This site is personal, so sign-in is restricted to an
 * explicit list of addresses.
 *
 * The Supabase project is shared with other sites, so this has to be enforced
 * in the application rather than in the project's auth settings.
 *
 * It fails closed: with the variable unset nobody is allowed, so a
 * misconfigured deploy locks sign-in rather than opening it to everyone.
 */

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? process.env.MCP_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.toLowerCase());
}
