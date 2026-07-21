import "@/app/globals.css";

/**
 * Layout for embeddable routes. No auth chrome, no site nav.
 * Theme defaults to the system preference of the host (iframe parent),
 * without touching localStorage — hosts may not share storage.
 */
const THEME_INIT = `
(function() {
  try {
    var dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-accent', 'lime');
    var mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', function(e) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    });
  } catch (e) {}
})();
`;

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      {children}
    </>
  );
}
