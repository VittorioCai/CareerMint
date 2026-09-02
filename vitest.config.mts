import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: true,
    // Nested git worktrees hold other branches' checkouts. Without this they are
    // collected too, and `pnpm test` reports their failures as if they were ours.
    exclude: [...configDefaults.exclude, "tests/e2e/**", ".worktrees/**"],
  },
});
