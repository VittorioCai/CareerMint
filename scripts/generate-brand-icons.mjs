/**
 * Derives the raster icons from `src/app/icon.svg`, the one drawing of the
 * brand mark the browser sees:
 *
 *   src/app/favicon.ico     16, 32 and 48 px, for browsers that ignore an
 *                           SVG icon and for anything that asks for
 *                           /favicon.ico by name
 *   src/app/apple-icon.png  180 px, for an iPhone home screen. Full bleed:
 *                           iOS cuts its own rounded corners, and a plate that
 *                           is already rounded shows a dark sliver inside them.
 *
 * Run it after changing icon.svg: `node scripts/generate-brand-icons.mjs`.
 * It renders with Playwright's Chromium; set CHROMIUM_PATH to use a browser
 * other than the one Playwright installed.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const APP = join(import.meta.dirname, "..", "src", "app");

const svg = await readFile(join(APP, "icon.svg"), "utf8");
const fullBleed = svg.replace(/ rx="[\d.]+"/u, "");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

async function render(source, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}

/** An ICO whose entries are PNGs, which every browser since IE 11 reads. */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

try {
  const favicon = [];
  for (const size of [16, 32, 48]) {
    favicon.push({ size, png: await render(svg, size) });
  }
  await writeFile(join(APP, "favicon.ico"), ico(favicon));
  await writeFile(join(APP, "apple-icon.png"), await render(fullBleed, 180));
  console.log("generate-brand-icons: wrote favicon.ico and apple-icon.png");
} finally {
  await browser.close();
}
