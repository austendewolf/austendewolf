/**
 * Who may reach this app's data.
 *
 * The Supabase project behind this app is the shared identity plane, so it
 * holds accounts belonging to entirely unrelated products. "Supabase says this
 * is a real user" therefore says nothing about whether they should be here.
 * This list is the actual boundary, and it is deliberately the same rule
 * austendewolf.com enforces so the two cannot drift apart.
 *
 * The owner is a constant rather than required configuration: making it an
 * environment variable only creates a way to ship with the gate silently wide
 * open or silently shut. `ALLOWED_EMAILS` still overrides it when set.
 */

const OWNER = "91.adewolf@gmail.com";

export function allowedEmails(): string[] {
  const configured = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : [OWNER];
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.toLowerCase());
}
