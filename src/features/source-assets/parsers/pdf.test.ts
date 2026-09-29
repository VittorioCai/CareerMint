// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const { getDocument } = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument }));

import { extractPdfText, MAX_PDF_PAGES, PDF_PARSE_BUDGET_MS } from "./pdf";

describe("extractPdfText", () => {
  it("registers the worker handler for the server-side parser", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        }),
      }),
      destroy,
    });

    await extractPdfText(Buffer.from("synthetic-pdf"));

    expect(getDocument).toHaveBeenCalledOnce();
    expect(
      (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker,
    ).toBeDefined();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("refuses a document longer than a resume without reading a page of it", async () => {
    const getPage = vi.fn();
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: MAX_PDF_PAGES + 1, getPage }),
      destroy,
    });

    await expect(extractPdfText(Buffer.from("synthetic-pdf"))).rejects.toThrow(
      "resume-text-too-long",
    );
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("reads a document of exactly the limit", async () => {
    const getPage = vi.fn().mockResolvedValue({
      getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "page" }] }),
    });
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: MAX_PDF_PAGES, getPage }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    await extractPdfText(Buffer.from("synthetic-pdf"));

    expect(getPage).toHaveBeenCalledTimes(MAX_PDF_PAGES);
  });

  it("stops between pages once the time for parsing is spent", async () => {
    const getPage = vi.fn().mockResolvedValue({
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    });
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 10, getPage }),
      destroy,
    });
    // Each look at the clock finds it eight seconds later than the last.
    let clock = 0;
    const now = () => (clock += 8_000);

    await expect(
      extractPdfText(Buffer.from("synthetic-pdf"), now),
    ).rejects.toThrow("resume-parse-timeout");
    // Started at 8s; pages begin at 16s and 24s, and 32s is past the budget.
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledOnce();
    expect(PDF_PARSE_BUDGET_MS).toBe(20_000);
  });
});
