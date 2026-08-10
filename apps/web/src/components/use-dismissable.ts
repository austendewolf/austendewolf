"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Close an expanded thing when the reader looks away from it.
 *
 * Anything that opens over the drawing needs the same two exits: a pointer
 * somewhere else on the sheet, and Escape. A control you can only dismiss by
 * finding the row that opened it is fine for a menu bar and wrong here, because
 * the key sits over content and on the resume it lands on the header.
 *
 * Extracted because the index and the account row both need it, and two copies
 * of a dismissal rule drift into two different behaviours.
 *
 * @param open whether the thing is currently expanded; listeners only bind then
 * @param close called on an outside pointer or Escape
 * @returns ref to put on the element that counts as "inside"
 */
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  close: () => void,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return ref;
}
