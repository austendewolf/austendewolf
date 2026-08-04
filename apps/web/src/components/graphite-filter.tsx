/**
 * Graphite text.
 *
 * Three things separate a pencil mark from a vector fill, and the chain below
 * models each one:
 *
 *  1. Paper has grain, and graphite lands on the high points while the pits
 *     stay bare. That is a height field, not a flat noise overlay, so the tooth
 *     is built with feDiffuseLighting using turbulence as the height map and
 *     then used as a mask.
 *  2. The edge of a pencil line is indistinct, because neither the paper nor
 *     the point is regular.
 *  3. A drawn stroke is laid down more than once. Overlapping passes build up
 *     density in the middle and feather at the outside.
 *
 * So the text is displaced three separate times, each with its own noise and
 * its own amount, each well short of opaque, and the results are blended. A
 * single displaced copy gives you a ragged outline; three give you a stroke.
 *
 * Displacement is measured in user units rather than relative to the glyph, so
 * a given scale roughens small text far more than large. Hence two filters.
 */

interface StrokeProps {
  /** Suffix so the primitive results stay unique within one filter. */
  id: string;
  seed: number;
  frequency: number;
  scale: number;
  /** How much of the pass survives. Under 1 so passes accumulate. */
  weight: number;
}

function Pass({ id, seed, frequency, scale, weight }: StrokeProps) {
  return (
    <>
      <feTurbulence
        type="fractalNoise"
        baseFrequency={frequency}
        numOctaves={3}
        seed={seed}
        result={`n${id}`}
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2={`n${id}`}
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
        result={`d${id}`}
      />
      <feComponentTransfer in={`d${id}`} result={`p${id}`}>
        <feFuncA type="linear" slope={weight} />
      </feComponentTransfer>
    </>
  );
}

interface DefinitionProps {
  id: string;
  scale: number;
  /**
   * How much graphite survives, 0 to 1. Smaller text has fewer pixels per
   * stroke, so the same mask that reads as tooth on a display heading eats a
   * subhead down to nothing.
   */
  density: number;
  /** Grain size. Finer for small text, so the tooth stays in proportion. */
  grain: number;
}

function GraphiteDefinition({ id, scale, density, grain }: DefinitionProps) {
  const floor = 0.08 + 0.42 * density;
  return (
    <filter
      id={id}
      x="-18%"
      y="-18%"
      width="136%"
      height="136%"
      colorInterpolationFilters="sRGB"
    >
      {/* The sheet's tooth, lit from the upper left so the grain has real
          highs and lows rather than being flat speckle. */}
      {/* Coarse enough that individual skips are visible as flecks of bare
          paper. At pixel scale this averages into a grey film instead. */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency={grain}
        numOctaves="3"
        seed="4"
        result="grain"
      />
      {/* A low elevation rakes the light across the grain, which throws the
          pits into shadow instead of washing the whole field white. */}
      <feDiffuseLighting
        in="grain"
        surfaceScale="4.5"
        diffuseConstant="1.1"
        lightingColor="#ffffff"
        result="lit"
      >
        <feDistantLight azimuth="228" elevation="24" />
      </feDiffuseLighting>
      <feColorMatrix in="lit" type="luminanceToAlpha" result="toothRaw" />
      {/* Steep, so the mask actually swings between bare and covered. A gentle
          curve here averages out to a flat wash and the grain disappears. */}
      <feComponentTransfer in="toothRaw" result="tooth">
        <feFuncA
          type="table"
          tableValues={`${floor} ${floor + 0.28} 0.95 1`}
        />
      </feComponentTransfer>

      {/* Light passes: three of these stacked at high opacity just rebuild a
          solid glyph, which is the opposite of the point. */}
      {/*
       * Three scales of irregularity, coarse to fine:
       *  a — the hand. A slow wander over several characters.
       *  b — the point. Wobble across a single stroke.
       *  c — the tooth. Fine chatter along the edge.
       *
       * baseFrequency is cycles per user unit, so 1.0 makes features about a
       * pixel wide, which reads as static rather than as a drawn line.
       */}
      <Pass id="a" seed={11} frequency={0.045} scale={scale * 2.6} weight={0.34 + 0.36 * density} />
      <Pass
        id="b"
        seed={29}
        frequency={0.14}
        scale={scale * 1.5}
        weight={0.26 + 0.36 * density}
      />
      <Pass
        id="c"
        seed={53}
        frequency={0.4}
        scale={scale * 0.7}
        weight={0.32 + 0.36 * density}
      />

      <feBlend in="pa" in2="pb" mode="normal" result="ab" />
      <feBlend in="ab" in2="pc" mode="normal" result="strokes" />

      {/* Graphite only where the tooth stands proud. */}
      <feComposite in="strokes" in2="tooth" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" />
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
        <GraphiteDefinition id="graphite" scale={0.85} density={0} grain={0.16} />
        {/* Smaller headings: less push, proportionally finer grain, and much
            more of the graphite left behind, or the subhead fades out. */}
        <GraphiteDefinition id="graphite-sm" scale={0.5} density={0.85} grain={0.34} />
        {/* Body copy. Barely any displacement and nearly full density: at this
            size the goal is tooth on the stroke, not a visibly drawn edge, and
            anything stronger costs legibility. */}
        <GraphiteDefinition id="graphite-text" scale={0.22} density={1} grain={0.55} />
      </defs>
    </svg>
  );
}
