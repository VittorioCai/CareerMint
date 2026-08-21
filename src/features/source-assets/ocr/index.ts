export { normalizeResumeText } from "../parsers/normalize";
export type { OcrProgress, ScannedPdfOcrOptions } from "./types";
export {
  runScannedPdfOcr,
  type OcrAdapter,
  type OcrRecognitionItem,
  type OcrRunnerDependencies,
  type PdfAdapter,
  type PdfDocumentAdapter,
  type PdfPageImage,
} from "./runner";

import type { ScannedPdfOcrOptions } from "./types";
import { createBrowserOcrAdapter, createBrowserPdfAdapter } from "./browser";
import { runScannedPdfOcr } from "./runner";

const KNOWN_ERRORS = new Set([
  "resume-ocr-too-many-pages",
  "resume-text-too-short",
  "resume-text-too-long",
]);

function preserveOrUnavailable(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return error;
  if (error instanceof Error && (KNOWN_ERRORS.has(error.message) || error.name === "AbortError")) {
    return error;
  }
  return new Error("resume-ocr-unavailable", { cause: error });
}

export async function extractScannedPdfText(
  file: Blob,
  options: ScannedPdfOcrOptions = {},
) {
  try {
    const [pdfjs, paddle] = await Promise.all([
      import("pdfjs-dist/build/pdf.mjs"),
      import("@paddleocr/paddleocr-js"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const dependencies = {
      pdf: createBrowserPdfAdapter(pdfjs),
      ocr: createBrowserOcrAdapter({ createPaddleModule: async () => paddle }),
    };
    return await runScannedPdfOcr(
      new Uint8Array(await file.arrayBuffer()),
      dependencies,
      options,
    );
  } catch (error) {
    throw preserveOrUnavailable(error);
  }
}
