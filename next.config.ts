import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["mammoth", "@napi-rs/canvas"],
  turbopack: {
    resolveAlias: {
      fs: {
        browser: "./src/lib/browser-empty.ts",
      },
      path: {
        browser: "./src/lib/browser-empty.ts",
      },
      "ort.bundle.min.mjs": "./src/lib/ort-bundle.ts",
    },
  },
};

export default nextConfig;
