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

/**
 * Sheets that exist only for the owner.
 *
 * They are numbered in the same run as the public ones, because they are the
 * same set: a reader who can open them sees one index, not a public list with
 * a private appendix.
 */
export const OWNER_NAV_ITEMS: NavItem[] = [
  { href: "/daybook", label: "Daybook", no: "A-04" },
];

