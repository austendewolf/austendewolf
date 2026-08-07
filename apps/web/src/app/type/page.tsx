import {
  Architects_Daughter,
  Barlow_Condensed,
  EB_Garamond,
  Nanum_Pen_Script,
  Special_Elite,
} from "next/font/google";
import { Jitter } from "@/components/jitter";

/**
 * A bench for choosing the type, not a page of the site.
 *
 * Four genuinely different answers to "graphite on paper", rendered on the real
 * surface with the real filters, because a specimen on a white background tells
 * you nothing about how a face survives the tooth.
 */

const drafting = Barlow_Condensed({
  subsets: ["latin"],
  weight: "300",
  variable: "--f-drafting",
});
const book = EB_Garamond({ subsets: ["latin"], variable: "--f-book" });
const hand = Architects_Daughter({
  subsets: ["latin"],
  weight: "400",
  variable: "--f-hand",
});
const pen = Nanum_Pen_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--f-pen",
});
const typed = Special_Elite({
  subsets: ["latin"],
  weight: "400",
  variable: "--f-typed",
});

const BODY = "They're all products in the end. I like making them.";

interface SpecimenProps {
  n: number;
  name: string;
  note: string;
  font: string;
  /** Drafting lettering is lettered in caps and tracked out; nothing else is. */
  display?: React.CSSProperties;
  jitter?: number;
}

function Specimen({ n, name, note, font, display, jitter }: SpecimenProps) {
  const H1 = { fontFamily: font, ...display };
  return (
    <section className="mb-9" style={{ fontFamily: font }}>
      <p className="mb-2 text-xs" style={{ fontFamily: "var(--font-geist-mono)" }}>
        <span className="text-accent">{n}</span>
        &nbsp;&nbsp;{name}
        <span className="text-muted-foreground">&nbsp;&nbsp;·&nbsp;&nbsp;{note}</span>
      </p>

      <h2 className="mb-1 text-5xl" style={H1}>
        {jitter ? <Jitter amount={jitter}>Austen</Jitter> : "Austen"}
      </h2>

      {/* The paper system sets font-family on `.paper *`, which beats
          inheritance, so every text element states its own family inline. */}
      <p
        className="max-w-xl text-base leading-relaxed text-muted-foreground"
        style={{ fontFamily: font }}
      >
        {jitter ? <Jitter amount={jitter}>{BODY}</Jitter> : BODY}
      </p>
    </section>
  );
}

export default function TypePage() {
  return (
    <div
      className={`${drafting.variable} ${book.variable} ${hand.variable} ${pen.variable} ${typed.variable} mx-auto max-w-3xl px-6 pt-16 pb-24`}
    >
      <Specimen
        n={1}
        name="Drafting lettering"
        note="uniform on purpose — a draftsman letters identically by training"
        font="var(--f-drafting)"
        display={{ textTransform: "uppercase", letterSpacing: "0.18em" }}
      />
      <Specimen
        n={2}
        name="Art-book book face"
        note="not handwriting at all — fine printing pressed into paper"
        font="var(--f-book)"
      />
      <Specimen
        n={3}
        name="Hand, per-glyph jitter"
        note="no two letters identical — the repetition problem actually solved"
        font="var(--f-hand)"
        jitter={1}
      />
      <Specimen
        n={4}
        name="Pen, per-glyph jitter"
        note="thin ballpoint, written fast"
        font="var(--f-pen)"
        jitter={1.4}
      />
      <Specimen
        n={5}
        name="Typewriter"
        note="struck, uneven, unmistakably paper"
        font="var(--f-typed)"
        jitter={0.5}
      />
    </div>
  );
}
