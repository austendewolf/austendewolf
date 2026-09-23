"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/lib/nav";

/**
 * One sheet in the index.
 *
 * Its own component because the owner-only rows are rendered on the server and
 * the public ones on the client, and both have to mark the open sheet the same
 * way. Reading the path here keeps that in one place.
 */
export function IndexRow({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <li>
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
}
