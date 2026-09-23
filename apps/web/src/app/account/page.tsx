import Link from "next/link";

import { getViewer } from "@/lib/mcp/owner";

export const metadata = { title: "Settings — Austen DeWolf" };
export const runtime = "nodejs";

/**
 * The settings index.
 *
 * Connections and sign-in were two rows of the key with nothing above them, so
 * the key grew a row every time the account gained a page. They are both
 * settings, so they are both sheets of this one, and the key carries a single
 * way in.
 */
const SECTIONS = [
  {
    href: "/account/connections",
    title: "Connections",
    blurb: "The Google accounts the MCP server can act as, and what each one may read.",
  },
  {
    href: "/account/password",
    title: "Sign-in",
    blurb: "Passkeys on the devices you use, and the password behind them.",
  },
];

export default async function SettingsPage() {
  const viewer = await getViewer();

  if (!viewer.isOwner) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-3 text-muted-foreground">
          {viewer.signedIn
            ? "You are signed in, but this page is limited to the site owner."
            : "This page is private."}
        </p>
        {!viewer.signedIn && (
          <a
            href="/login?next=%2Faccount"
            className="mt-8 inline-block border px-4 py-2 text-sm hover:border-accent"
          >
            Sign in
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
      <p className="mt-3 text-muted-foreground">{viewer.email}</p>

      <ul className="mt-12 divide-y border-y">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link href={section.href} className="block py-5 group">
              <span className="text-sm group-hover:text-accent transition-colors">
                {section.title}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground leading-relaxed">
                {section.blurb}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
