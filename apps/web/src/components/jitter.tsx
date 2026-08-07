/**
 * Breaks the thing that makes set type read as set type: repetition.
 *
 * A font draws every "e" from one outline, so a page of it is the same shape
 * stamped over and over. Handwriting never repeats — that is the whole tell,
 * and no amount of picking a better hand font fixes it, because the repetition
 * is structural rather than a quality problem.
 *
 * So each character gets its own small rotation, rise and drift. The values are
 * derived from the character and its position, never from a random source, so
 * the server and the browser draw the identical page and the text does not
 * twitch on hydration.
 *
 * The text stays real text: spans are inline, whitespace is preserved as real
 * spaces, and nothing here touches the accessibility tree, so it still selects,
 * copies, and reads aloud as the original string.
 */

/** Deterministic hash → an evenly spread number in [0, 1). */
function noise(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

interface JitterProps {
  children: string;
  /** How far the hand strays. 1 is a steady hand, 3 is writing quickly. */
  amount?: number;
  className?: string;
}

export function Jitter({ children, amount = 1, className }: JitterProps) {
  return (
    <span className={className} style={{ fontFamily: "inherit" }}>
      {[...children].map((char, i) => {
        // A space carries no shape, so jittering it only opens ragged gaps.
        if (char === " ") return " ";

        const seed = char.codePointAt(0)! + i * 31;
        const rotate = (noise(seed) - 0.5) * 3.2 * amount;
        const rise = (noise(seed + 7) - 0.5) * 0.09 * amount;
        const drift = (noise(seed + 13) - 0.5) * 0.05 * amount;
        // Pressure varies across a written line; a constant one reads as print.
        const ink = 0.86 + noise(seed + 23) * 0.14;

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `translate(${drift}em, ${rise}em) rotate(${rotate}deg)`,
              opacity: ink,
              // A universal selector anywhere in the sheet's stylesheet targets
              // these spans directly, which beats inheriting the caller's font.
              // Stating it inline hands the face back to whatever wraps this.
              fontFamily: "inherit",
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}
