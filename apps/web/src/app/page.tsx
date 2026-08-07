import Link from "next/link";
import { RotatingWords } from "@/components/rotating-words";
import { SitePlan } from "@/components/plan/site-plan";

export default async function HomePage() {
  return (
    <div className="pt-16 pb-24 sm:pt-24">
      <section className="mx-auto max-w-3xl space-y-6 px-6">
        <p className="font-mono text-sm text-accent">Hello, I&apos;m</p>
        <h1 className="text-6xl sm:text-7xl font-bold tracking-tight text-foreground">
          {/* No emoji. A full-colour glyph cannot be drawn in graphite, and
              nothing on this sheet is printed. */}
          <span className="mark-lg">Austen</span>
        </h1>
        <h2 className="text-2xl sm:text-3xl text-muted-foreground">
          {/* Only the fixed words are drawn. RotatingWords animates its own
              opacity, and an animating child forces the graphite filter to
              recompute every frame. */}
          <span className="mark">I build</span> <RotatingWords />
        </h2>
        <p className="max-w-xl text-base text-muted-foreground leading-relaxed">
          They&apos;re all products in the end. I like making them, and I like
          working with the people who make them.
        </p>
      </section>

      {/*
        The plan replaces the project grid rather than sitting under it. The
        projects are on the drawing as stations, so a second list of the same
        three would be the drift this is meant to avoid.
      */}
      <section className="mx-auto mt-16 max-w-6xl px-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
            Site plan
          </h3>
          <Link href="/projects" className="text-xs text-accent hover:underline">
            all projects →
          </Link>
        </div>
        <SitePlan />
      </section>
    </div>
  );
}
