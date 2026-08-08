import { AccountBlock } from "@/components/account-block";
import { TitleBlock } from "@/components/title-block";

/**
 * The sheet the page is drawn on.
 *
 * A print is a flat field, a margin ruled around it, and a title block built
 * into that margin. There is no grid: a blueprint is a photographic contact
 * print of a drawing, so the only lines on it are lines someone drew.
 *
 * Rendered as real elements rather than as backgrounds on html/body, which is
 * deliberate:
 *
 *  - `background-attachment: fixed` is the traditional way to pin a backdrop,
 *    but it forces a full-viewport repaint on every scroll frame, and Safari
 *    has long-standing bugs painting it at all when combined with `cover`.
 *    A `position: fixed` element gets its own compositor layer instead, which
 *    is both cheaper and reliable.
 *  - Backgrounds on html and body cannot be layered against each other in the
 *    order we need: a child always paints above its parent's background, so
 *    whichever element held the sheet hid whatever sat on top of it.
 *
 * The frame and title block sit *above* the document rather than behind it, so
 * the margin stays clear as content scrolls past — a drawing does not run over
 * its own border.
 */
export function SheetBackdrop() {
  return (
    <div aria-hidden className="sheet-backdrop">
      {/* Fixed: the paper stays put while the page moves across it. */}
      <div className="sheet-paper" />
    </div>
  );
}

/**
 * The ruled margin, and the title block closing its corner.
 *
 * Above the content and inert, so it reads as printed on the sheet rather than
 * as part of the page.
 */
export function SheetFrame() {
  return (
    /*
     * `aria-hidden` belongs on the ruled rectangle, not on the layer. The layer
     * also carries the key, and the key is the site's navigation plus the way in
     * and out of an account — hiding all of that from assistive technology to
     * silence one decorative border is the wrong trade.
     */
    <div className="sheet-frame-layer">
      <div aria-hidden className="sheet-frame" />
      <TitleBlock account={<AccountBlock />} />
    </div>
  );
}

/**
 * The tooth. This is what makes a stroke read as graphite rather than as ink.
 *
 * A pencil does not lay down a solid line. The tip only reaches the raised
 * fibres of the sheet and skips the pits between them, so the paper's own grain
 * shows through every stroke. Faking that with synthetic noise inside a filter
 * cannot work: the noise is generated per element, in the element's own
 * coordinate space, so it has no relationship to the sheet the letter is
 * supposedly sitting on. It reads as a texture applied to type.
 *
 * So this is the same paper image, pinned to the same fixed position as the
 * sheet itself and painted *over* the content. Blended in, it lightens dark
 * marks wherever the sheet is raised and leaves them alone where it dips —
 * which is the real effect, registered to the real paper, for one element and
 * one composited layer.
 *
 * It has to live outside `.sheet-backdrop`: blending only reaches back to the
 * backdrop inside the same stacking context, and it must reach the text.
 */
export function SheetTooth() {
  return <div aria-hidden className="sheet-tooth" />;
}
