/**
 * Copies the onnxruntime WebAssembly runtime out of node_modules and into
 * public/ocr/wasm so the browser fetches it from our own origin instead of a
 * third-party CDN.
 *
 * The model weights next to it in public/ocr/models are committed: they come
 * from Baidu object storage, which is slow from Europe and unreachable from
 * some networks, and the observed failure mode is a hang rather than an error.
 * The runtime is copied rather than committed because it is 26 MB and already
 * pinned by the lockfile.
 *
 * Runs on postinstall so `next dev`, `next build` and CI all get the same
 * assets without a network call.
 */
import { createRequire } from "node:module";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const RUNTIME_FILES = [
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];
const MODEL_FILES = [
  "PP-OCRv6_tiny_det_onnx_infer.tar",
  "PP-OCRv6_tiny_rec_onnx_infer.tar",
];

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const wasmTarget = join(projectRoot, "public", "ocr", "wasm");
const modelTarget = join(projectRoot, "public", "ocr", "models");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyRuntime() {
  await mkdir(wasmTarget, { recursive: true });
  for (const file of RUNTIME_FILES) {
    let from;
    try {
      // onnxruntime-web exports each runtime file as its own subpath, so this
      // fails loudly if a version bump renames or drops one.
      from = require.resolve(`onnxruntime-web/${file}`);
    } catch {
      throw new Error(
        `sync-ocr-assets: onnxruntime-web no longer exports ${file}. ` +
          "Update RUNTIME_FILES and re-run `pnpm test:e2e:real-ocr`.",
      );
    }
    if (!(await exists(from))) {
      throw new Error(`sync-ocr-assets: ${file} resolved but is missing on disk.`);
    }
    await copyFile(from, join(wasmTarget, file));
  }
}

async function verifyModels() {
  const present = (await exists(modelTarget))
    ? new Set(await readdir(modelTarget))
    : new Set();
  const missing = MODEL_FILES.filter((file) => !present.has(file));
  if (missing.length > 0) {
    throw new Error(
      `sync-ocr-assets: missing committed OCR models: ${missing.join(", ")}. ` +
        "They are served from public/ocr/models so no user request reaches a " +
        "third-party CDN; re-add them before building.",
    );
  }
}

await verifyModels();
await copyRuntime();
console.log(
  `sync-ocr-assets: ${RUNTIME_FILES.length} runtime files copied, ` +
    `${MODEL_FILES.length} models verified.`,
);
