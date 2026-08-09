import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  /*
   * Served under austendewolf.com/workout rather than its own subdomain.
   *
   * workout.austendewolf.com needed a certificate Railway could not issue: the
   * hostname was registered and deleted several times during the service move,
   * which trips Let's Encrypt's duplicate-certificate rate limit, and every
   * retry then sits in VALIDATING_OWNERSHIP regardless of which service holds
   * it or how clean the DNS is. The apex already has a valid certificate, so
   * serving from a path there needs no new one at all. The subdomain redirects
   * at the Cloudflare edge, which terminates TLS itself and never asks Railway.
   *
   * basePath makes the app own the prefix, so its own asset and route URLs are
   * already correct and apps/web can proxy the prefix straight through.
   */
  basePath: "/workout",
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
    // Transport + sniffing protections everywhere; framing handled per-route.
    const baseline = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];
    return [
      { source: "/:path*", headers: baseline },
      {
        // /embed/* is meant to be framed by claude.ai; it carries a scoped
        // frame-ancestors allowlist and must NOT get X-Frame-Options DENY.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://claude.ai https://*.claude.ai https://anthropic.com https://*.anthropic.com",
          },
        ],
      },
      {
        // Everything that is not /embed is first-party only.
        source: "/((?!embed).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
