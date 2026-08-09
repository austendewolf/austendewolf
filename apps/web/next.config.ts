import type { NextConfig } from "next";
import path from "node:path";

// Where the workout app actually runs. It is a separate service (its own Next
// build, its own database role), reached over its Railway domain and surfaced
// under /workout here. Overridable so a preview environment can point at its
// own instance rather than production's.
const WORKOUT_ORIGIN =
  process.env.WORKOUT_ORIGIN ?? "https://workout-production-0654.up.railway.app";

const nextConfig: NextConfig = {
  output: "standalone",
  // Stamped once, when the build runs. The footer prints this as the revision
  // date, and it has to be frozen at build: the layout renders per request, so
  // anything computed at render would just be "now".
  env: { NEXT_PUBLIC_BUILD_DATE: new Date().toISOString() },
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async rewrites() {
    return {
      // beforeFiles, because a bare array lands in afterFiles, which is only
      // consulted once pages have been checked. The home page would otherwise
      // answer "/" on the subdomain before this ever ran.
      beforeFiles: [
        // mcp.austendewolf.com is the endpoint clients are configured with; it
        // serves the same handler as /api/mcp on the apex.
        {
          source: "/:path*",
          has: [{ type: "host", value: "mcp.austendewolf.com" }],
          destination: "/api/mcp",
        },
        // The workout app runs as its own service and its own Next build, so it
        // cannot simply be a route here. It is proxied under this prefix rather
        // than given a subdomain: a new subdomain needs a new certificate, and
        // that is precisely what Railway could not issue. The apex certificate
        // already exists, so this path costs nothing.
        //
        // apps/workout sets `basePath: "/workout"`, so the prefix is preserved
        // end to end and its asset URLs resolve without rewriting.
        {
          source: "/workout/:path*",
          destination: `${WORKOUT_ORIGIN}/workout/:path*`,
        },
        { source: "/workout", destination: `${WORKOUT_ORIGIN}/workout` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    // A deliberately conservative set: transport and sniffing protections plus
    // clickjacking defence. No restrictive Content-Security-Policy default,
    // because the theme bootstrap runs as an inline script and a strict CSP
    // would need nonces threaded through it — worth doing later, not worth
    // silently breaking the site now.
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing here is meant to be framed; the MCP endpoint and the site
          // are both first-party only.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
