"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { NAV_ITEMS } from "@/lib/nav";
import { useDismissable } from "@/components/use-dismissable";

/**
 * The title block, top right, at every width.
 *
 * On a real drawing this is not a panel floating near the corner — it is built
 * into the border. Its top and right edges *are* the frame, and it insets by
 * exactly one rule so the margin runs unbroken around it instead of being
 * covered by its own background.
 *
 * It is also the navigation. A drawing set lists its sheets in the key, so the
 * sheet index and the site's links are one list rather than two that can
 * disagree.
 *
 * Where the sheet is too narrow to carry the whole index, the index folds into
 * a row of the key rather than moving somewhere else. The key never leaves the
 * corner; only the number of rows in it changes.
 *
 * `account` is a server-rendered slot. The key needs the session to know
 * whether to offer a way in or a way out, and this component is client-side for
 * the fold, so the rows arrive already rendered rather than being fetched here.
 */
export function TitleBlock({ account }: { account?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissable<HTMLElement>(open, close);

  // Opening a sheet should close the index behind it, or the menu stays open
  // across a navigation and covers the drawing it just opened. Done as a
  // during-render adjustment on a changed pathname rather than an effect: it is
  // the pattern React documents for "reset state when a prop changes", and it
  // avoids the extra commit-then-re-render an effect would add.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <nav
      ref={ref}
      className="title-block"
      aria-label="Sheets"
      data-open={open ? "" : undefined}
    >
      <Link href="/" className="title-block-name">
        Austen DeWolf
      </Link>

      {/*
        The index as a row of the key. Only rendered as a control on a sheet
        too narrow for the full list; wider than that it is display:none and
        the index below is always open.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="title-block-row title-block-toggle"
      >
        <span className="title-block-label">Index</span>
        <span className="title-block-value">{open ? "Close" : "Menu"}</span>
      </button>

      <ul className="title-block-index">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="title-block-row title-block-link"
              >
                <span className="title-block-label">{item.label}</span>
                <span className="title-block-value">{item.no}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {account}
    </nav>
  );
}
