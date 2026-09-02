import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/**/*.client.{ts,tsx}",
      "src/**/*-client.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/admin"],
              message: "The Supabase admin client is server-only account deletion infrastructure.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "work/**",
    "next-env.d.ts",
    // Vendored onnxruntime runtime, copied verbatim by scripts/sync-ocr-assets.mjs.
    "public/ocr/wasm/**",
    // Nested git worktrees hold other branches' checkouts; linting them reports
    // their problems as if they were this branch's.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
