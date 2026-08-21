import { normalizeResumeText } from "../parsers/normalize";
import type { ScannedPdfOcrOptions } from "./types";

export type { OcrProgress, ScannedPdfOcrOptions } from "./types";

export interface PdfPageImage {
  page: number;
  width: number;
  height: number;
  release: () => void | Promise<void>;
}

export interface PdfDocumentAdapter {
  numPages: number;
  renderPage: (page: number) => Promise<PdfPageImage>;
  destroy: () => void | Promise<void>;
}

export interface PdfAdapter {
  open: (data: Uint8Array) => Promise<PdfDocumentAdapter>;
}

export interface OcrRecognitionItem {
  text: string;
  score: number;
}

export interface OcrAdapter {
  initialize: () => void | Promise<void>;
  recognize: (image: PdfPageImage) => Promise<{ items: OcrRecognitionItem[] }>;
  dispose: () => void | Promise<void>;
}

export interface OcrRunnerDependencies {
  pdf: PdfAdapter;
  ocr: OcrAdapter;
}

function abortError() {
  return new DOMException("The OCR operation was aborted.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

async function disposeResource(resource: void | Promise<void>) {
  await resource;
}

/**
 * Runs the browser-independent part of scanned-PDF OCR. PDF and OCR APIs are
 * injected so tests never load PDF.js or download model assets.
 */
export async function runScannedPdfOcr(
  data: Uint8Array,
  dependencies: OcrRunnerDependencies,
  options: ScannedPdfOcrOptions = {},
) {
  const { signal, onProgress } = options;
  throwIfAborted(signal);

  let document: PdfDocumentAdapter | undefined;
  try {
    document = await dependencies.pdf.open(data);
    throwIfAborted(signal);

    if (document.numPages > 10) {
      throw new Error("resume-ocr-too-many-pages");
    }

    onProgress?.({ phase: "loading-model" });
    await dependencies.ocr.initialize();
    throwIfAborted(signal);

    const pageText: string[] = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      throwIfAborted(signal);
      onProgress?.({ phase: "recognizing", page, totalPages: document.numPages });

      const image = await document.renderPage(page);
      try {
        throwIfAborted(signal);
        const result = await dependencies.ocr.recognize(image);
        throwIfAborted(signal);
        pageText.push(
          result.items
            .filter((item) => item.score >= 0.35 && item.text.trim().length > 0)
            .map((item) => item.text.trim())
            .join("\n"),
        );
      } finally {
        await disposeResource(image.release());
      }
    }

    throwIfAborted(signal);
    return normalizeResumeText(pageText.join("\n"));
  } finally {
    if (document) await disposeResource(document.destroy());
    await disposeResource(dependencies.ocr.dispose());
  }
}
