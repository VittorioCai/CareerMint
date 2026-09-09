import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["mammoth", "@napi-rs/canvas"],
  async headers() {
    return [
      {
        // The OCR runtime and models are 11 MB over the wire even gzipped, and
        // the default for /public is `max-age=0` — a revalidation round trip
        // before every scanned PDF, on every session. Both are safe to keep
        // forever: the runtime lives under its resolved version (see
        // scripts/sync-ocr-assets.mjs) and the model filenames carry theirs.
        source: "/ocr/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
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
