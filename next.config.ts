import type { NextConfig } from "next";

/**
 * Sent with every response.
 *
 * Framing is limited to this origin rather than forbidden: the resume preview
 * is an iframe of our own route. `X-Frame-Options` says the same thing to
 * browsers that predate `frame-ancestors`.
 *
 * There is deliberately no `script-src` here. A policy strict enough to mean
 * something needs a per-request nonce from the proxy, and has to be proven
 * against the OCR runtime (WebAssembly, a worker) and the PDF.js worker first;
 * one loose enough to be safe to add blind — `'unsafe-inline'` — would stop
 * very little. That is its own change.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here asks for any of the three. OCR reads a file the user chose;
  // it never opens a camera.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["mammoth", "@napi-rs/canvas"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The file routes set a stricter policy of their own — `sandbox`,
        // `default-src 'none'` — and two policies are enforced together, so
        // this one stays off them rather than risk replacing theirs.
        source: "/((?!api/source-assets/).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
        ],
      },
      {
        // The OCR runtime and models are 9 MB over the wire even gzipped
        // (3.4 MB of WebAssembly, 5.7 MB of weights), and the default for
        // /public is `max-age=0` — a revalidation round trip before every
        // scanned PDF, on every session. Both are safe to keep forever: the
        // runtime lives under its resolved version (see
        // scripts/sync-ocr-assets.mjs) and the model filenames carry theirs.
        //
        // That is what this path serves, not what a first scanned PDF costs.
        // PaddleOCR's worker, which carries opencv.js, is another 3.6 MB and
        // PDF.js with its worker 0.5 MB; both are hashed chunks under
        // /_next/static and cached by Next. About 13 MB in all.
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
