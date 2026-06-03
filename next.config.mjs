/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    // instrumentation.ts at the repo root is auto-loaded when this is on;
    // praetom's runtime register() runs from there on every cold start.
    instrumentationHook: true,
    // Keep praetom's CommonJS-built runtime out of Next's webpack bundle;
    // it's loaded directly by the Node runtime instead.
    serverComponentsExternalPackages: ["praetom"],
  },
  // (Removed PraetomPlugin webpack hook — the build-time export-wrap was
  // emitting undefined for some client component shapes, which crashed
  // the prod server with React's "Element type is invalid ... got
  // undefined" on every request. The Node-side instrumentation in
  // instrumentation.ts still runs unaffected. Re-enable the webpack
  // plugin after upstream fixes the wrapper.)
};

export default config;
