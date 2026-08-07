"use server";

import { requireOwner } from "@/lib/mcp/owner";
import { createClient } from "@/lib/supabase/server";

/**
 * Set the owner's password.
 *
 * Deliberately a flow the owner drives rather than a value anyone hands them.
 * A password that arrives over any channel — chat, email, a note — has been
 * seen by that channel and is only as private as its logs. This way the only
 * place it ever exists in the clear is the browser field it was typed into.
 *
 * Supabase applies it to whoever the current session belongs to, so there is no
 * way to aim this at another account even if the form were tampered with. The
 * owner check is still here because this page should not be reachable at all
 * without one.
 */

export interface PasswordState {
  error?: string;
  done?: boolean;
}

export async function setPassword(
  _previous: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  try {
    await requireOwner();
  } catch {
    return { error: "You are not signed in as the owner." };
  }

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 12) {
    return { error: "Use at least 12 characters." };
  }
  if (password !== confirm) {
    return { error: "The two entries do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  // Supabase's own messages are useful here and safe to show: this page is
  // already behind a session, so there is nothing left to disclose.
  if (error) return { error: error.message };

  return { done: true };
}
