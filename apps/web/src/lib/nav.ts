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
];

