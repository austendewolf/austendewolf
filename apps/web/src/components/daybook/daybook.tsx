"use client";

import { useEffect, useRef } from "react";

import type { Day, Item } from "@/lib/daybook/store";
import { mountDaybook } from "./controller";

/**
 * The Daybook's frame. React draws the three containers and nothing inside
 * them: the rail and the list are rendered by the controller, which is the
 * artifact's own renderer carried over. Its drag, settle and hold-render timing
 * is written against the DOM directly, and porting that into React state would
 * have meant re-deriving behaviour that already works.
 */
export function Daybook({
  initial,
}: {
  initial: { items: Record<string, Item>; days: Record<string, Day> } | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const days = useRef<HTMLUListElement>(null);
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current || !days.current || !main.current) return;
    return mountDaybook({ root: root.current, days: days.current, main: main.current }, initial);
  }, [initial]);

  return (
    <div className="daybook" ref={root}>
      <div className="shell">
        <nav className="rail" aria-label="Days">
          <ul className="days" ref={days} />
        </nav>
        {/* Not a <main>: the site layout already has one around this page. */}
        <div ref={main} aria-live="polite" />
      </div>
    </div>
  );
}
