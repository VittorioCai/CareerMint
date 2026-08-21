// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type {
  OcrRunnerDependencies,
  PdfDocumentAdapter,
  PdfPageImage,
} from "./runner";
import { runScannedPdfOcr } from "./runner";

const LONG_TEXT = "A Product Analyst with experience in analytics and growth ".repeat(2);

function makeDependencies({
  pages = [
    [{ text: " first ", score: 0.9 }, { text: "", score: 0.99 }, { text: "low", score: 0.34 }],
    [{ text: " second ", score: 0.35 }],
  ],
  onRecognize,
}: {
  pages?: Array<Array<{ text: string; score: number }>>;
  onRecognize?: (page: number) => void;
} = {}): OcrRunnerDependencies & { document: PdfDocumentAdapter; images: PdfPageImage[] } {
  const images: PdfPageImage[] = pages.map((_, index) => ({
    page: index + 1,
    width: 100,
    height: 100,
    source: { page: index + 1 },
    release: vi.fn(),
  }));
  const document: PdfDocumentAdapter = {
    numPages: pages.length,
    renderPage: vi.fn(async (page) => images[page - 1]),
    destroy: vi.fn(),
  };

  return {
    pdf: {
      open: vi.fn(async () => document),
    },
    ocr: {
      initialize: vi.fn(),
      recognize: vi.fn(async (image: PdfPageImage) => {
        onRecognize?.(image.page);
        return { items: pages[image.page - 1] };
      }),
      dispose: vi.fn(),
    },
    document,
    images,
  };
}

describe("runScannedPdfOcr", () => {
  it("merges page-order text, filters blank and low-confidence items, and reports progress", async () => {
    const dependencies = makeDependencies({
      pages: [
        [
          { text: LONG_TEXT + " first", score: 0.9 },
          { text: "", score: 0.99 },
          { text: "low", score: 0.34 },
        ],
        [{ text: "second", score: 0.35 }],
      ],
    });
    const progress: unknown[] = [];

    const result = await runScannedPdfOcr(new Uint8Array([1, 2]), dependencies, {
      onProgress: (event) => progress.push(event),
    });

    expect(result).toContain("first");
    expect(result).toContain("second");
    expect(result).not.toContain("low");
    expect(progress).toEqual([
      { phase: "loading-model" },
      { phase: "recognizing", page: 1, totalPages: 2 },
      { phase: "recognizing", page: 2, totalPages: 2 },
    ]);
  });

  it("rejects documents over ten pages before initializing the model", async () => {
    const dependencies = makeDependencies({ pages: Array.from({ length: 11 }, () => []) });

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow(
      "resume-ocr-too-many-pages",
    );
    expect(dependencies.ocr.initialize).not.toHaveBeenCalled();
  });

  it("honors an already aborted signal without opening the PDF", async () => {
    const dependencies = makeDependencies();
    const controller = new AbortController();
    controller.abort();

    await expect(
      runScannedPdfOcr(new Uint8Array(), dependencies, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(dependencies.pdf.open).not.toHaveBeenCalled();
  });

  it("stops processing after a mid-run abort and cleans up every resource", async () => {
    const controller = new AbortController();
    const recognized: number[] = [];
    const dependencies = makeDependencies({
      pages: Array.from({ length: 3 }, () => [{ text: LONG_TEXT, score: 1 }]),
      onRecognize: (page) => {
        recognized.push(page);
        if (page === 1) controller.abort();
      },
    });

    await expect(
      runScannedPdfOcr(new Uint8Array(), dependencies, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(recognized).toEqual([1]);
    expect(dependencies.document.destroy).toHaveBeenCalledOnce();
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
    for (const image of await Promise.all(
      Array.from(
        { length: 3 },
        async (_, index) =>
          vi.mocked(dependencies.document.renderPage).mock.results[index]?.value,
      ),
    )) {
      if (image) expect(image.release).toHaveBeenCalled();
    }
  });

  it("rejects normalized OCR output that is too short", async () => {
    const dependencies = makeDependencies({ pages: [[{ text: "short", score: 1 }]] });

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow(
      "resume-text-too-short",
    );
    expect(dependencies.document.destroy).toHaveBeenCalledOnce();
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
  });

  it("destroys the PDF and releases the current image when recognition fails", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.ocr.recognize).mockRejectedValueOnce(new Error("recognition failed"));

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow(
      "recognition failed",
    );
    expect(dependencies.document.destroy).toHaveBeenCalledOnce();
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
  });

  it("preserves a short-text error when PDF cleanup also fails", async () => {
    const dependencies = makeDependencies({ pages: [[{ text: "short", score: 1 }]] });
    vi.mocked(dependencies.document.destroy).mockRejectedValueOnce(new Error("destroy failed"));

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow(
      "resume-text-too-short",
    );
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
  });

  it("preserves a recognition error when image cleanup fails", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.ocr.recognize).mockRejectedValueOnce(new Error("recognition failed"));
    vi.mocked(dependencies.images[0].release).mockRejectedValueOnce(new Error("release failed"));

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow(
      "recognition failed",
    );
    expect(dependencies.document.destroy).toHaveBeenCalledOnce();
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
  });

  it("reports a cleanup error when OCR succeeds but cleanup fails", async () => {
    const dependencies = makeDependencies({ pages: [[{ text: LONG_TEXT, score: 1 }]] });
    vi.mocked(dependencies.images[0].release).mockRejectedValueOnce(new Error("release failed"));
    vi.mocked(dependencies.document.destroy).mockRejectedValueOnce(new Error("destroy failed"));
    vi.mocked(dependencies.ocr.dispose).mockRejectedValueOnce(new Error("dispose failed"));

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow(
      "release failed",
    );
    expect(dependencies.document.destroy).toHaveBeenCalledOnce();
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
  });

  it("stops before the next page when a successful page release fails", async () => {
    const dependencies = makeDependencies({
      pages: [
        [{ text: LONG_TEXT, score: 1 }],
        [{ text: LONG_TEXT, score: 1 }],
      ],
    });
    vi.mocked(dependencies.images[0].release).mockRejectedValueOnce(new Error("release failed"));

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow(
      "release failed",
    );
    expect(dependencies.document.renderPage).toHaveBeenCalledOnce();
    expect(dependencies.document.destroy).toHaveBeenCalledOnce();
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
  });

  it("stops after a failed page even when that page release also fails", async () => {
    const dependencies = makeDependencies({
      pages: [
        [{ text: LONG_TEXT, score: 1 }],
        [{ text: LONG_TEXT, score: 1 }],
      ],
    });
    vi.mocked(dependencies.ocr.recognize).mockRejectedValueOnce(new Error("recognition failed"));
    vi.mocked(dependencies.images[0].release).mockRejectedValueOnce(new Error("release failed"));

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow(
      "recognition failed",
    );
    expect(dependencies.document.renderPage).toHaveBeenCalledOnce();
    expect(dependencies.document.destroy).toHaveBeenCalledOnce();
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
  });

  it.each([
    ["recognition undefined", undefined, "recognize"],
    ["recognition null", null, "recognize"],
    ["release null", null, "release"],
  ])("stops on a falsy %s page error", async (_label, error, source) => {
    const dependencies = makeDependencies({
      pages: [
        [{ text: LONG_TEXT, score: 1 }],
        [{ text: LONG_TEXT, score: 1 }],
      ],
    });
    if (source === "recognize") {
      vi.mocked(dependencies.ocr.recognize).mockRejectedValueOnce(error);
    } else {
      vi.mocked(dependencies.images[0].release).mockRejectedValueOnce(error);
    }

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toBe(error);
    expect(dependencies.document.renderPage).toHaveBeenCalledOnce();
    expect(dependencies.document.destroy).toHaveBeenCalledOnce();
    expect(dependencies.ocr.dispose).toHaveBeenCalledOnce();
  });

  it("allows model initialization to be retried after a failure", async () => {
    const dependencies = makeDependencies({ pages: [[{ text: LONG_TEXT, score: 1 }]] });
    vi.mocked(dependencies.ocr.initialize)
      .mockRejectedValueOnce(new Error("model failed"))
      .mockResolvedValueOnce(undefined);

    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).rejects.toThrow("model failed");
    await expect(runScannedPdfOcr(new Uint8Array(), dependencies)).resolves.toContain("Product Analyst");
    expect(dependencies.ocr.initialize).toHaveBeenCalledTimes(2);
  });
});
