// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every route file actually contains a route.
 *
 * This exists because a bad script truncated `src/app/(app)/app/page.tsx` to
 * zero bytes and nothing caught it. `next build` succeeded. `tsc --noEmit`
 * said only "is not a module" — indistinguishable from noise among the stale
 * generated route types it always prints. The end-to-end suite found it, two
 * hours later, as a blank dashboard.
 *
 * So the guard is at the level the failure happened: the file on disk. It
 * cannot tell whether a page renders something *useful* — that is what the
 * end-to-end suite is for — but it can tell that the file has content and
 * exports what its filename promises, which is exactly what an empty file
 * fails.
 */

const APP_DIR = join(process.cwd(), "src/app");

/** What each kind of route file has to export to be a route at all. */
const EXPECTED_EXPORTS = {
  "page.tsx": /export default /u,
  "layout.tsx": /export default /u,
  "route.ts": /export (?:const|async function|function) (?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/u,
  "error.tsx": /export default /u,
  "not-found.tsx": /export default /u,
  "loading.tsx": /export default /u,
} as const;

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await routeFiles(path)));
    } else if (entry.name in EXPECTED_EXPORTS) {
      found.push(path);
    }
  }
  return found;
}

describe("app router files", () => {
  it("finds the routes it is meant to be guarding", async () => {
    // A traversal that silently found nothing would make every assertion
    // below pass while checking no file at all.
    const files = await routeFiles(APP_DIR);

    expect(files.length).toBeGreaterThan(15);
    expect(files.some((file) => file.endsWith("page.tsx"))).toBe(true);
    expect(files.some((file) => file.endsWith("route.ts"))).toBe(true);
  });

  it("exports a route from every route file", async () => {
    const files = await routeFiles(APP_DIR);
    const broken: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const name = file.split("/").pop() as keyof typeof EXPECTED_EXPORTS;
      const where = relative(process.cwd(), file);

      if (source.trim().length === 0) {
        broken.push(`${where}: empty file`);
        continue;
      }
      if (!EXPECTED_EXPORTS[name].test(source)) {
        broken.push(`${where}: no ${name === "route.ts" ? "HTTP method" : "default"} export`);
      }
    }

    expect(broken, `\n${broken.join("\n")}\n`).toEqual([]);
  });
});
