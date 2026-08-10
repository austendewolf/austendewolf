"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { signOut } from "@/app/login/actions";
import { useDismissable } from "@/components/use-dismissable";

/**
 * The account row of the key, and everything that hangs off it.
 *
 * Account controls belong in one place. They were spread across the key and a
 * header on the connections page, which meant the email and a sign-out button
 * were drawn twice on the one page you would go to for them. So the key carries
 * all of it, and the row expands rather than growing a permanent row per
 * destination — the key is a title block, not a sidebar, and its height is part
 * of the drawing.
 *
 * Signed out there is nothing to expand: one row, one way in.
 *
 * The signed-in address is deliberately not shown. There is one account, so
 * naming it says nothing the reader does not know, and it was the thing that
 * made this read as a panel rather than as rows of the key.
 */
export function AccountRow({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissable<HTMLDivElement>(open, close);

  // Opening a sheet closes the menu behind it. Adjusted during render on a
  // changed pathname rather than in an effect, which is what React documents
  // for resetting state when a value changes and avoids an extra commit.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  if (!signedIn) {
    return (
      <Link href="/login?next=%2Faccount" className="title-block-row title-block-link">
        <span className="title-block-label">Account</span>
        <span className="title-block-value">Sign in</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className="title-block-account" data-open={open ? "" : undefined}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="title-block-row title-block-account-toggle"
      >
        <span className="title-block-label">Account</span>
        <span className="title-block-value">{open ? "Close" : "Menu"}</span>
      </button>

      {/*
        Plain rows of the key, styled exactly like the sheet index above them.
        No indent and no sub-treatment: expanding this should make the key
        longer, not open a second panel inside it.
      */}
      <div className="title-block-account-menu">
        <Link href="/account" className="title-block-row title-block-link">
          <span className="title-block-label">Connections</span>
          <span className="title-block-value">A-04</span>
        </Link>
        <Link href="/account/password" className="title-block-row title-block-link">
          <span className="title-block-label">Password</span>
          <span className="title-block-value">A-05</span>
        </Link>
        {/* A form, not a link: a GET that destroys a session can be fired by a
            prefetch or a link scanner. */}
        <form action={signOut} className="title-block-form">
          <button type="submit" className="title-block-row title-block-account-action">
            <span className="title-block-label">Sign out</span>
          </button>
        </form>
      </div>
    </div>
  );
}
