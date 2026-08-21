// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const { getDocument } = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument }));

import { extractPdfText } from "./pdf";

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
});
