import {
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  NpmIcon,
} from "@/components/social-icons";

const SOCIALS = [
  { href: "https://github.com/austendewolf", label: "GitHub", Icon: GitHubIcon },
  {
    href: "https://www.linkedin.com/in/austendewolf/",
    label: "LinkedIn",
    Icon: LinkedInIcon,
  },
  {
    href: "https://www.instagram.com/austendewolf",
    label: "Instagram",
    Icon: InstagramIcon,
  },
  { href: "https://www.npmjs.com/~deausten", label: "npm", Icon: NpmIcon },
];

/**
 * When this set was last issued.
 *
 * Stamped at build time by next.config rather than read at render. The layout
 * is dynamic now that the key knows who is signed in, so a `new Date()` here
 * would report the moment the page was requested and the sheet would claim to
 * have been revised every time anyone looked at it.
 */
function revised(): string {
  const raw = process.env.NEXT_PUBLIC_BUILD_DATE;
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

export function Footer() {
  const date = revised();

  return (
    // Template, so it prints in the margin band below the border rather than
    // inside the drawing area.
    <footer className="sheet-band sheet-band-bottom">
      <ul className="flex gap-4">
        {SOCIALS.map(({ href, label, Icon }) => (
          <li key={href}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-muted-foreground hover:text-accent transition-colors inline-block hover:scale-110"
            >
              <Icon />
            </a>
          </li>
        ))}
      </ul>
      {date && (
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Revised {date}
        </p>
      )}
    </footer>
  );
}
