import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // The standalone bundle keeps the workspace layout, so tracing has to start
  // at the repo root rather than at this app.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Keep praetom's CommonJS-built runtime out of the bundle; the Node runtime
  // loads it directly from instrumentation.ts instead. This graduated out of
  // `experimental` and was renamed from `serverComponentsExternalPackages`.
  //
  // The `experimental.instrumentationHook` flag that used to be needed here is
  // gone: instrumentation.ts is loaded automatically now, and setting the old
  // flag is an error rather than a no-op.
  serverExternalPackages: ["praetom"],
  async headers() {
    return [
      {
        // /embed/* can be framed by claude.ai. Everything else stays
        // same-origin only.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://claude.ai https://*.claude.ai https://anthropic.com https://*.anthropic.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
