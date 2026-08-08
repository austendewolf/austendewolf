import type { NextConfig } from "next";
import path from "node:path";

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
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
