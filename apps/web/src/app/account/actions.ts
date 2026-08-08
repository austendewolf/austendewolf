"use server";

import { redirect } from "next/navigation";

import { getAccount, removeAccount } from "@/lib/mcp/accounts";
import { authorizeUrl, revoke } from "@/lib/mcp/oauth";
import { requireOwner } from "@/lib/mcp/owner";

/** Start (or restart) a Google consent for one account. */
export async function connectAccount(formData: FormData) {
  await requireOwner();
  const account = String(formData.get("account") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(account)) {
    redirect(`/account?error=${encodeURIComponent("pick a name using letters, digits, - or _")}`);
  }
  const requested = formData.getAll("scope").map(String);
  // Reconnecting with nothing checked keeps whatever the account already has,
  // so re-consenting never silently narrows access.
  const existing = await getAccount(account);
  const scopes = requested.length ? requested : (existing?.scopes ?? undefined);

  let destination: string;
  try {
    destination = authorizeUrl(account, scopes);
  } catch (err) {
    redirect(`/account?error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
  redirect(destination);
}

/** Revoke at Google, then forget the credential locally. */
export async function disconnectAccount(formData: FormData) {
  await requireOwner();
  const account = String(formData.get("account") ?? "").trim();
  const existing = await getAccount(account);
  if (!existing) {
    redirect(`/account?error=${encodeURIComponent(`no account named '${account}'`)}`);
  }
  // Revoke first: forgetting locally without revoking would leave a live grant
  // on the Google account with nothing pointing at it.
  const revoked = await revoke(existing.refreshToken);
  await removeAccount(account);
  const suffix = revoked
    ? ""
    : `&error=${encodeURIComponent("Removed here, but Google did not confirm the revoke. Check myaccount.google.com/permissions.")}`;
  redirect(`/account?removed=${encodeURIComponent(account)}${suffix}`);
}
