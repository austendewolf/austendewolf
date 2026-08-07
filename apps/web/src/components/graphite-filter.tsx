/**
 * One mark-making primitive for the whole sheet.
 *
 * Everything drawn here — glyphs, rules, the outline of a box — is the same
 * physical event: a tip dragged across paper. So there is one filter chain,
 * parameterised by how hard the instrument is pressed and how large the mark
 * is, rather than a separate effect per kind of element.
 *
 * The chain only ever *removes* material:
 *
 *   1. Displace at three scales — the hand wandering over a word, the point
 *      wobbling within a stroke, the tooth chattering along the edge.
 *   2. Modulate alpha with noise, so graphite skips where the paper dips.
 *
 * Nothing opaque is ever introduced. That is the property that lets the same
 * filter sit on a heading and on a panel border: an earlier version ended with
 * feDiffuseLighting, whose output covers the entire filter region, which turned
 * every bordered box into a grey slab.
 */

/** Base noise scales for the three displacement passes: hand, point, tooth. */
const MARK_FREQUENCIES = [0.04, 0.13, 0.38] as const;

/**
 * A drawn rectangle wanders much more slowly than a letterform does. Its long
 * edges bow across many inches rather than chattering, so the first pass drops
 * an order of magnitude in frequency and gains it back in scale — which is what
 * reads as "ruled freehand" instead of "ruled badly".
 */
const BOX_FREQUENCIES = [0.006, 0.05, 0.3] as const;

interface PassProps {
  id: string;
  seed: number;
  frequency: number;
  scale: number;
}

function Displace({ id, seed, frequency, scale }: PassProps) {
  return (
    <>
      <feTurbulence
        type="fractalNoise"
        baseFrequency={frequency}
        numOctaves={2}
        seed={seed}
        result={`n${id}`}
      />
      <feDisplacementMap
        in={id === "a" ? "SourceGraphic" : `s${prev(id)}`}
        in2={`n${id}`}
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
        result={`s${id}`}
      />
    </>
  );
}

const prev = (id: string) => String.fromCharCode(id.charCodeAt(0) - 1);

interface InstrumentProps {
  id: string;
  /** Overall size of the mark. Displacement is absolute, so this scales it. */
  scale: number;
  /** Grain size of the tooth. Larger marks want coarser skips. */
  grain: number;
  /**
   * How hard the instrument is pressed, 0 to 1. A pencil held lightly skips
   * across the tooth; a pen or marker lays down an almost unbroken line.
   */
  pressure: number;
  /** Noise scales for the three passes. Letterforms and outlines differ. */
  frequencies?: readonly [number, number, number];
  /**
   * Shifts every seed in the chain. Two instruments that differ only here draw
   * the same kind of mark with a different hand, which is how a page of boxes
   * avoids being one box stamped repeatedly.
   */
  hand?: number;
  /** Filter region. A wandering outline needs more room than a glyph does. */
  bleed?: number;
}

function Instrument({
  id,
  scale,
  grain,
  pressure,
  frequencies = MARK_FREQUENCIES,
  hand = 0,
  bleed = 12,
}: InstrumentProps) {
  const floor = 0.2 + 0.75 * pressure;
  const mid = Math.min(1, floor + 0.22);
  return (
    <filter
      id={id}
      x={`-${bleed}%`}
      y={`-${bleed}%`}
      width={`${100 + bleed * 2}%`}
      height={`${100 + bleed * 2}%`}
      colorInterpolationFilters="sRGB"
    >
      <Displace
        id="a"
        seed={11 + hand}
        frequency={frequencies[0]}
        scale={scale * 2.4}
      />
      <Displace
        id="b"
        seed={29 + hand}
        frequency={frequencies[1]}
        scale={scale * 1.4}
      />
      <Displace
        id="c"
        seed={53 + hand}
        frequency={frequencies[2]}
        scale={scale * 0.65}
      />

      <feTurbulence
        type="fractalNoise"
        baseFrequency={grain}
        numOctaves="3"
        seed={7 + hand}
        result="grain"
      />
      <feColorMatrix in="grain" type="luminanceToAlpha" result="grainAlpha" />
      <feComponentTransfer in="grainAlpha" result="tooth">
        <feFuncA type="table" tableValues={`${floor} ${mid} 1 ${mid} 0.95`} />
      </feComponentTransfer>

      {/* `in` multiplies source alpha by the tooth and keeps the source colour,
          so the mark thins and skips without gaining any fill of its own. */}
      <feComposite in="sc" in2="tooth" operator="in" />
    </filter>
  );
}

export function GraphiteFilter() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/* Pencil: the default hand. Light pressure, visible tooth. */}
        <Instrument id="pencil" scale={0.9} grain={0.16} pressure={0.1} />
        {/* Smaller marks need proportionally less push and finer grain. */}
        <Instrument id="pencil-sm" scale={0.45} grain={0.34} pressure={0.45} />
        {/* Body size: barely displaced, nearly unbroken, or it costs legibility. */}
        <Instrument id="pencil-xs" scale={0.2} grain={0.6} pressure={0.8} />
        {/* Pen: emphasis. Pressed hard, so almost no skip and a steadier line.
            This is what replaces bold — a different instrument, not a heavier
            weight of the same one. */}
        <Instrument id="pen" scale={0.35} grain={0.5} pressure={0.96} />

        {/* Boxes. Three of the same hand, drawn three times: the noise is
            deterministic per seed, so without the offsets every rectangle on
            the page would bow in exactly the same places and read as a texture
            rather than as something drawn.

            Nearly rectangular is the whole target. The scale is large enough
            that no edge is truly straight and no corner quite closes, and low
            enough that the shape is unmistakably a rectangle. */}
        <Instrument
          id="box-a"
          scale={2.6}
          grain={0.5}
          pressure={0.86}
          frequencies={BOX_FREQUENCIES}
          bleed={4}
        />
        <Instrument
          id="box-b"
          scale={3.1}
          grain={0.44}
          pressure={0.82}
          frequencies={BOX_FREQUENCIES}
          hand={101}
          bleed={4}
        />
        <Instrument
          id="box-c"
          scale={2.2}
          grain={0.56}
          pressure={0.9}
          frequencies={BOX_FREQUENCIES}
          hand={211}
          bleed={4}
        />
      </defs>
    </svg>
  );
}
