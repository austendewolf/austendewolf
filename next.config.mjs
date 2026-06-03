import { PraetomPlugin } from "praetom/webpack";

/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["praetom"],
  },
  webpack(cfg) {
    cfg.plugins.push(
      new PraetomPlugin({
        ingestToken: "praetom_pub_A1fi0asq5YZVoZjP784hqSCViChwRrek",
      }),
    );
    return cfg;
  },
};

export default config;
