// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

describe("source parser module loading", () => {
  it("does not evaluate PDF.js when the parser index is imported", async () => {
    const pdfjsImported = vi.fn();
    vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => {
      pdfjsImported();
      return { getDocument: vi.fn() };
    });
    vi.doMock("pdfjs-dist/legacy/build/pdf.worker.mjs", () => {
      pdfjsImported();
      return { WorkerMessageHandler: {} };
    });

    await import("./index");

    expect(pdfjsImported).not.toHaveBeenCalled();
  });
});
