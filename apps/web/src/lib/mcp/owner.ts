import { allowedEmails, isAllowed } from "@/lib/auth/allowlist";
import { createClient } from "@/lib/supabase/server";

/**
 * Who may manage connected accounts.
 *
 * This is the same allowlist that decides who can sign in at all, so the two
 * cannot drift apart. It stays a separate function because this page can read
 * and revoke Google credentials, and it should keep asserting that rather than
 * inheriting the answer implicitly.
 */

export interface Viewer {
  signedIn: boolean;
  isOwner: boolean;
  email: string | null;
  /** True when no allowlist is configured, which is a deploy problem. */
  misconfigured: boolean;
}

export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const owners = allowedEmails();
  return {
    signedIn: Boolean(user),
    isOwner: isAllowed(user?.email),
    email: user?.email ?? null,
    misconfigured: owners.length === 0,
  };
}

/** Throwing guard for route handlers and server actions. */
export async function requireOwner(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.isOwner) throw new Error("not authorized");
  return viewer;
}
