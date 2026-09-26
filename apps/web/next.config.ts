import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // The dev server answers on local.austendewolf.com so a passkey enrolled on
  // the real domain works against it. Next refuses dev assets to any host it
  // was not told about, so this names it.
  allowedDevOrigins: ["local.austendewolf.com"],
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
        //
        // Named paths rather than `/:path*`. The catch-all sent every path on
        // this host to the handler, which swallowed
        // /.well-known/oauth-protected-resource: a client asking which
        // authorization server guards the endpoint got the JSON-RPC handler's
        // 405 and could never find the sign-in. The root stays because existing
        // clients POST the bare origin, and /mcp is the canonical URL a
        // connector is configured with.
        {
          source: "/",
          has: [{ type: "host", value: "mcp.austendewolf.com" }],
          destination: "/api/mcp",
        },
        {
          source: "/mcp",
          has: [{ type: "host", value: "mcp.austendewolf.com" }],
          destination: "/api/mcp",
        },
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
