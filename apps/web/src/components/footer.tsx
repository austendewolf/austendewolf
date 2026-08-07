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

export function Footer() {
  return (
    // Template, so it prints in the margin band below the border rather than
    // inside the drawing area.
    <footer className="sheet-band sheet-band-bottom">
      <p className="text-xs text-muted-foreground">
        © {new Date().getFullYear()} austendewolf.com
      </p>
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
    </footer>
  );
}
