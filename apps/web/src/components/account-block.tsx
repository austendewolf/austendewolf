import Link from "next/link";

import { signOut } from "@/app/login/actions";
import { getViewer } from "@/lib/mcp/owner";

/**
 * The account row of the key.
 *
 * Replaces the row that named the sheet currently on the board. That row
 * answered a question the page already answers with its own heading, and it
 * took the one position in the key a reader looks to for a way in or out.
 *
 * One row, not a menu. The label goes to the account root; the value is the
 * single action available from here, which is signing in or signing out. Rows
 * for individual account pages belong on that root, not in the key.
 *
 * A server component passed into the title block as a slot, because the title
 * block is a client component and this needs the session. Signing out is a form
 * rather than a link: a GET that destroys a session can be fired by a prefetch
 * or a link scanner.
 */
export async function AccountBlock() {
  const viewer = await getViewer();

  if (!viewer.signedIn) {
    return (
      <Link href="/login?next=%2Faccount" className="title-block-row title-block-link">
        <span className="title-block-label">Account</span>
        <span className="title-block-value">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="title-block-row title-block-account">
      <Link href="/account" className="title-block-label title-block-label-link">
        Account
      </Link>
      <form action={signOut} className="title-block-form">
        <button type="submit" className="title-block-value title-block-value-action">
          Sign out
        </button>
      </form>
    </div>
  );
}
