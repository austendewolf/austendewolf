import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workout Logger",
  description: "Programmed workouts, weekly summaries, AI coaching via MCP.",
};

/**
 * Inline script runs before the body paints to apply the saved theme
 * + accent from localStorage. Prevents the flash-of-wrong-theme on
 * cold loads. "system" theme reads prefers-color-scheme live.
 */
const THEME_INIT = `
(function() {
  try {
    var t = localStorage.getItem('wl_theme') || 'system';
    var a = localStorage.getItem('wl_accent') || 'lime';
    var effective = t === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t;
    document.documentElement.setAttribute('data-theme', effective);
    document.documentElement.setAttribute('data-accent', a);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
