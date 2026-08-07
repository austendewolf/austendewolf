/**
 * The sheets in this set.
 *
 * One list, read by both the title block and the narrow-screen header. They are
 * the same navigation shown two ways, and a drawing index that disagreed with
 * itself would be a bug rather than a style choice.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Drawing number, shown in the key. */
  no: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/projects", label: "Projects", no: "A-01" },
  { href: "/blog", label: "Writing", no: "A-02" },
  { href: "/resume", label: "Resume", no: "A-03" },
  { href: "/about", label: "About", no: "A-04" },
];

/** Sheets that exist but are not part of the published set. */
const OFF_INDEX: Record<string, { label: string; no: string }> = {
  "/": { label: "Index", no: "A-00" },
  "/mcp": { label: "Connections", no: "X-01" },
  "/login": { label: "Access", no: "X-02" },
  "/account/password": { label: "Access", no: "X-03" },
};

export function sheetFor(pathname: string): { label: string; no: string } {
  const listed = NAV_ITEMS.find((i) => i.href === pathname);
  if (listed) return { label: listed.label, no: listed.no };
  if (OFF_INDEX[pathname]) return OFF_INDEX[pathname];

  // A detail drawing hangs off its parent sheet, the way it does on paper.
  const segments = pathname.split("/").filter(Boolean);
  const parent = segments[0] ? `/${segments[0]}` : "/";
  const base = NAV_ITEMS.find((i) => i.href === parent);
  const leaf = segments[segments.length - 1] ?? "";

  return {
    label: leaf ? leaf.replace(/-/g, " ") : "Sheet",
    no: base ? `${base.no}.1` : "A-00",
  };
}
