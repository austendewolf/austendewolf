import { IndexRow } from "@/components/index-row";
import { OWNER_NAV_ITEMS } from "@/lib/nav";
import { getViewer } from "@/lib/mcp/owner";

/**
 * The sheets only the owner can open, as rows of the index.
 *
 * The Daybook is a sheet of this set like any other, so it belongs in the index
 * rather than hidden under the account menu. It is drawn only when there is a
 * session behind it, because a row nobody else can open is a locked door with a
 * sign on it.
 *
 * Server-rendered and handed to the key as a slot, the same way the account row
 * is: the key is client-side for the fold and should not be fetching a session.
 */
export async function OwnerSheets() {
  const viewer = await getViewer();
  if (!viewer.isOwner) return null;

  return (
    <>
      {OWNER_NAV_ITEMS.map((item) => (
        <IndexRow key={item.href} item={item} />
      ))}
    </>
  );
}
