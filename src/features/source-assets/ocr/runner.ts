import { normalizeResumeText } from "../parsers/normalize";
import { createAbortError } from "./abort";
import type { ScannedPdfOcrOptions } from "./types";

export type { OcrProgress, ScannedPdfOcrOptions } from "./types";

export interface PdfPageImage<TSource = unknown> {
  page: number;
  width: number;
  height: number;
  source: TSource;
  release: () => void | Promise<void>;
}

export interface PdfDocumentAdapter {
  numPages: number;
  renderPage: (page: number, signal?: AbortSignal) => Promise<PdfPageImage>;
  destroy: () => void | Promise<void>;
}

export interface PdfAdapter {
  open: (data: Uint8Array, signal?: AbortSignal) => Promise<PdfDocumentAdapter>;
}

export interface OcrRecognitionItem {
  text: string;
  score: number;
}

export interface OcrAdapter {
  initialize: (signal?: AbortSignal) => void | Promise<void>;
  recognize: (
    image: PdfPageImage,
    signal?: AbortSignal,
  ) => Promise<{ items: OcrRecognitionItem[] }>;
  dispose: () => void | Promise<void>;
}

export interface OcrRunnerDependencies {
  pdf: PdfAdapter;
  ocr: OcrAdapter;
}

function abortError() {
  return createAbortError();
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
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
  let primaryError: unknown;
  let result: string | undefined;
  const cleanupErrors: unknown[] = [];
  try {
    document = await dependencies.pdf.open(data, signal);
    throwIfAborted(signal);

    if (document.numPages > 10) {
      throw new Error("resume-ocr-too-many-pages");
    }

    onProgress?.({ phase: "loading-model" });
    await dependencies.ocr.initialize(signal);
    throwIfAborted(signal);

    const pageText: string[] = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      throwIfAborted(signal);
      onProgress?.({ phase: "recognizing", page, totalPages: document.numPages });

      const image = await document.renderPage(page, signal);
      let pageError: unknown;
      try {
        throwIfAborted(signal);
        const recognized = await dependencies.ocr.recognize(image, signal);
        throwIfAborted(signal);
        pageText.push(
          recognized.items
            .filter((item) => item.score >= 0.35 && item.text.trim().length > 0)
            .map((item) => item.text.trim())
            .join("\n"),
        );
      } catch (error) {
        pageError = error;
      } finally {
        try {
          await image.release();
        } catch (error) {
          cleanupErrors.push(error);
          if (!pageError) pageError = error;
        }
      }
      if (pageError) throw pageError;
    }

    throwIfAborted(signal);
    result = normalizeResumeText(pageText.join("\n"));
  } catch (error) {
    primaryError = error;
  }

  if (document) {
    try {
      await document.destroy();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await dependencies.ocr.dispose();
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) throw cleanupErrors[0];
  if (result === undefined) {
    throw new Error("resume-ocr-unavailable");
  }
  return result;
}
