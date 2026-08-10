import { AccountRow } from "@/components/account-row";
import { getViewer } from "@/lib/mcp/owner";

/**
 * The account row of the key.
 *
 * Replaces the row that named the sheet currently on the board. That row
 * answered a question the page already answers with its own heading, and it
 * took the one position in the key a reader looks to for a way in or out.
 *
 * This half exists only to read the session: the key is a client component for
 * the fold, so the rows arrive already knowing who is signed in rather than
 * fetching it. Everything interactive lives in `AccountRow`.
 */
export async function AccountBlock() {
  const viewer = await getViewer();
  return <AccountRow signedIn={viewer.signedIn} email={viewer.email} />;
}
