// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

describe("server PDF canvas setup", () => {
  it("installs DOMMatrix and Path2D before PDF.js is evaluated", async () => {
    const globals = globalThis as unknown as {
      DOMMatrix?: unknown;
      Path2D?: unknown;
    };
    const previousDomMatrix = globals.DOMMatrix;
    const previousPath2D = globals.Path2D;
    delete globals.DOMMatrix;
    delete globals.Path2D;

    const observed = { domMatrix: undefined as unknown, path2D: undefined as unknown };
    vi.doMock("@napi-rs/canvas", () => ({
      DOMMatrix: class MockDOMMatrix {},
      Path2D: class MockPath2D {},
    }));
    vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => {
      observed.domMatrix = globals.DOMMatrix;
      observed.path2D = globals.Path2D;
      return {
        getDocument: vi.fn().mockReturnValue({
          promise: Promise.resolve({ numPages: 0 }),
          destroy: vi.fn().mockResolvedValue(undefined),
        }),
      };
    });
    vi.doMock("pdfjs-dist/legacy/build/pdf.worker.mjs", () => ({
      WorkerMessageHandler: {},
    }));

    try {
      const { extractPdfText } = await import("./pdf");
      await extractPdfText(Buffer.from("synthetic-pdf"));

      expect(observed.domMatrix).toBeDefined();
      expect(observed.path2D).toBeDefined();
    } finally {
      if (previousDomMatrix === undefined) delete globals.DOMMatrix;
      else globals.DOMMatrix = previousDomMatrix;
      if (previousPath2D === undefined) delete globals.Path2D;
      else globals.Path2D = previousPath2D;
    }
  });
});
