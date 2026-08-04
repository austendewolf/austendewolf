import Link from "next/link";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
  { href: "/resume", label: "Resume" },
  { href: "/about", label: "About" },
];

export function Navbar() {
  return (
    // No background at all: the sheet runs unbroken from the top of the page,
    // and only a hairline separates the running head from the body. Not sticky,
    // because a transparent header cannot have content scrolling under it.
    <header className="w-full border-b border-border/40">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-mono text-sm tracking-tight text-foreground hover:text-accent transition-colors"
        >
          austendewolf
          <span className="text-accent">.</span>
          com
        </Link>
        <ul className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="hover:text-accent transition-colors"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
