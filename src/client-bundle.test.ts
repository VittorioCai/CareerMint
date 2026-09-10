// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * No client component drags a server-side validator into the browser.
 *
 * `/interview` transferred 929 KB against every other page's 620. The extra
 * 287 KB was the whole of zod, and it was there because one client component
 * imported a four-string tuple as a *value* from a module whose first line is
 * `import { z } from "zod"` — to render four `<option>` elements. Nothing in
 * the type system objects: the tuple is a legitimate export and the import is
 * a legitimate import.
 *
 * So the rule is checked here, at the level the cost appears: follow every
 * value import out of every client component and fail if one reaches zod.
 *
 * Type-only imports are erased and do not count. Neither do `"use server"`
 * modules, which Next.js replaces with a reference stub on the client — that
 * is why the three auth forms importing `login/actions` are not findings.
 */

const SRC = join(process.cwd(), "src");

/** `import type {...} from "x"`, `import {a, type b} from "x"`, `import x from "y"`. */
const IMPORT =
  /import\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/gu;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(path)));
    else if (/\.tsx?$/u.test(entry.name) && !/\.test\./u.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

async function resolveModule(specifier: string, from: string) {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? normalize(join(dirname(from), specifier))
      : null;
  if (!base) return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Not this extension.
    }
  }
  return null;
}

/** Specifiers whose bindings survive into the client bundle. */
function valueImports(source: string) {
  const specifiers: string[] = [];
  let zod = false;
  for (const match of source.matchAll(IMPORT)) {
    const [, typeKeyword, clause, specifier] = match;
    const erased =
      Boolean(typeKeyword) ||
      // `{ type A, type B }` is entirely erased; `{ type A, B }` is not.
      (/^\{[^}]*\}$/u.test(clause.trim()) &&
        clause
          .trim()
          .slice(1, -1)
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .every((entry) => entry.startsWith("type ")));
    if (erased) continue;
    if (specifier === "zod") zod = true;
    else specifiers.push(specifier);
  }
  return { specifiers, zod };
}

describe("client bundle", () => {
  it("keeps zod out of every client component's import graph", async () => {
    const files = await sourceFiles(SRC);
    const sources = new Map<string, string>();
    for (const file of files) sources.set(file, await readFile(file, "utf8"));

    const directive = /^\s*(?:"use (client|server)"|'use (client|server)')/u;
    const clients = files.filter((file) => {
      const kind = directive.exec(sources.get(file) ?? "");
      return (kind?.[1] ?? kind?.[2]) === "client";
    });

    // A traversal that found no client components would pass while checking
    // nothing. There are twenty-odd; the floor is deliberately loose.
    expect(clients.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const entry of clients) {
      const seen = new Set<string>();
      const queue: string[][] = [[entry]];
      while (queue.length > 0) {
        const path = queue.pop() as string[];
        const file = path[path.length - 1] as string;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = sources.get(file);
        if (source === undefined) continue;
        // A server module reaches the client as a reference, not as code.
        const kind = directive.exec(source);
        if (file !== entry && (kind?.[1] ?? kind?.[2]) === "server") continue;
        const { specifiers, zod } = valueImports(source);
        if (zod && file !== entry) {
          offenders.push(
            path.map((step) => relative(SRC, step)).join(" -> ") + " -> zod",
          );
          break;
        }
        for (const specifier of specifiers) {
          const target = await resolveModule(specifier, file);
          if (target) queue.push([...path, target]);
        }
      }
    }

    expect(
      offenders,
      `\nEach of these ships zod to the browser. Move the value being imported\ninto a module that does not import zod:\n\n${offenders.join("\n")}\n`,
    ).toEqual([]);
  });
});
