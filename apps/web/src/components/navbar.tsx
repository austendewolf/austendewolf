import Link from "next/link";

/**
 * The running head, in the margin band above the border.
 *
 * Template rather than drawing: it prints outside the frame, so everything
 * inside the border belongs to the sheet being viewed.
 *
 * Only the wordmark. The sheet index lives in the key at every width — it folds
 * into a row of the block on a narrow sheet rather than moving out here, so
 * there is never a second copy of the navigation to keep in step with it.
 */
export function Navbar() {
  return (
    <header className="sheet-band sheet-band-top">
      <Link href="/" className="sheet-wordmark">
        austendewolf<span className="text-accent">.</span>com
      </Link>
    </header>
  );
}
