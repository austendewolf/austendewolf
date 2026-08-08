import { checkAccount, listAccounts } from "@/lib/mcp/accounts";
import { requireOwner } from "@/lib/mcp/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether each connection still works, right now.
 *
 * `checkAccount` mints a real access token against Google rather than reading a
 * stored flag, so this is a live answer and not a cached one. That is the whole
 * point: the connections page renders once, and a grant revoked an hour later
 * would otherwise keep reporting "working" until someone reloaded.
 *
 * Owner-gated like every other route here. It reports only names and health, no
 * credential material, but the account handles are still not public.
 */
export async function GET() {
  try {
    await requireOwner();
  } catch {
    return Response.json({ error: "not authorized" }, { status: 403 });
  }

  const accounts = await listAccounts();
  const checked = await Promise.all(
    accounts.map(async (a) => ({
      name: a.name,
      ...(await checkAccount(a.name)),
    })),
  );

  return Response.json({ checkedAt: new Date().toISOString(), accounts: checked });
}
