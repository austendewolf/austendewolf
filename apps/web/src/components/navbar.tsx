/**
 * The top margin band.
 *
 * Template rather than drawing: it prints outside the frame, so everything
 * inside the border belongs to the sheet being viewed.
 *
 * Deliberately empty. It carried a wordmark, which repeated on every sheet what
 * the key already states once, in the row that is literally the drawing's
 * title. The band itself stays, because the margin it reserves is what the
 * frame and the key are positioned against.
 */
export function Navbar() {
  return <header className="sheet-band sheet-band-top" />;
}
