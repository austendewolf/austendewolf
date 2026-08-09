/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  reactStrictMode: true,
  // instrumentation.ts at the repo root is auto-loaded now; the
  // `experimental.instrumentationHook` flag that used to enable it graduated
  // and was removed, so setting it is an error rather than a no-op. praetom's
  // register() still runs from there on every cold start.
  //
  // Keep praetom's CommonJS-built runtime out of the bundle; it is loaded
  // directly by the Node runtime instead. This moved out of `experimental`
  // and was renamed from `serverComponentsExternalPackages`.
  serverExternalPackages: ["praetom"],
  // (Removed PraetomPlugin webpack hook — the build-time export-wrap was
  // emitting undefined for some client component shapes, which crashed
  // the prod server with React's "Element type is invalid ... got
  // undefined" on every request. The Node-side instrumentation in
  // instrumentation.ts still runs unaffected. Re-enable the webpack
  // plugin after upstream fixes the wrapper.)
  async headers() {
    return [
      {
        // /embed/* routes can be framed by claude.ai. Everything else
        // stays same-origin only (Next's default is unset; browsers treat
        // that as permissive, so we don't lock the rest of the app down
        // here — do it later if needed).
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://claude.ai https://*.claude.ai https://anthropic.com https://*.anthropic.com",
          },
        ],
      },
    ];
  },
};

export default config;
