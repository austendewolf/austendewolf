import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { RotatingWords } from "@/components/rotating-words";
import { listContent } from "@/lib/content";

export default async function HomePage() {
  const projects = (await listContent("projects")).slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 pb-24 sm:pt-24">
      <section className="space-y-6">
        <p className="font-mono text-sm text-accent">Hello, I&apos;m</p>
        <h1 className="text-6xl sm:text-7xl font-bold tracking-tight text-foreground">
          {/* Only the lettering is drawn. The emoji is artwork already, and
              running it through the graphite filter turns it to mud. */}
          <span className="graphite">Austen</span>{" "}
          <span aria-hidden className="text-3xl sm:text-4xl align-middle">
            👋🏾
          </span>
        </h1>
        <h2 className="text-2xl sm:text-3xl text-muted-foreground">
          {/* Only the fixed words are drawn. RotatingWords animates its own
              opacity, and an animating child forces the graphite filter to
              recompute every frame. */}
          <span className="graphite-sm">I build</span> <RotatingWords />
        </h2>
        <p className="max-w-xl text-base text-muted-foreground leading-relaxed">
          They&apos;re all products in the end. I like making them, and I like
          working with the people who make them.
        </p>
      </section>

      {projects.length > 0 && (
        <section className="mt-20">
          <div className="mb-6 flex items-baseline justify-between">
            <h3 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
              Projects
            </h3>
            <Link
              href="/projects"
              className="font-mono text-xs text-accent hover:underline"
            >
              all projects →
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-3">
            {projects.map((p) => {
              const href = p.frontmatter.link ?? `/projects/${p.slug}`;
              const external = href.startsWith("http");
              return (
                <li key={p.slug}>
                  <Link
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="group block h-full rounded-sm border border-border/60 bg-card/40 p-5 transition-all hover:border-accent/50 hover:bg-card hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-sm text-foreground">
                        {p.frontmatter.title}
                      </span>
                      {external && (
                        <ArrowUpRight
                          size={14}
                          className="text-muted-foreground group-hover:text-accent transition-colors"
                        />
                      )}
                    </div>
                    {p.frontmatter.description && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {p.frontmatter.description}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
