import { redirect } from "next/navigation";

import { Daybook } from "@/components/daybook/daybook";
import { snapshot } from "@/lib/daybook/store";
import { getViewer } from "@/lib/mcp/owner";
import "./daybook.css";

export const metadata = { title: "Daybook" };
export const runtime = "nodejs";

/**
 * Austen's daily list: what to work on today, what waits, and what each past
 * day held.
 *
 * Ported from the Daybook artifact, and it keeps that page's look on purpose.
 * The styles are its own, scoped under `.daybook`, and the page is drawn over
 * the site's sheet rather than inside it.
 *
 * The proxy already turns away anyone without a session. This checks for the
 * owner again because the list is private in a way the rest of the site is not.
 */
export default async function DaybookPage() {
  const viewer = await getViewer();
  if (!viewer.isOwner) redirect("/login?next=%2Fdaybook");

  let initial: Awaited<ReturnType<typeof snapshot>> | null = null;
  try {
    initial = await snapshot();
  } catch (err) {
    console.error("daybook: initial load failed", err);
  }

  return <Daybook initial={initial} />;
}
