// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  createBrowserOcrAdapter,
  createBrowserPdfAdapter,
  PADDLE_OPTIONS,
  resetBrowserOcrModelForTests,
} from "./browser";

describe("createBrowserOcrAdapter", () => {
  beforeEach(() => resetBrowserOcrModelForTests());
  afterEach(() => resetBrowserOcrModelForTests());

  it("configures PP-OCRv6 Small in a single-threaded WASM worker", async () => {
    const create = vi.fn(async () => ({
      initialize: vi.fn(async () => undefined),
      predict: vi.fn(async () => [{ items: [] }]),
      dispose: vi.fn(async () => undefined),
    }));
    const adapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });

    await adapter.initialize();

    expect(create).toHaveBeenCalledWith(PADDLE_OPTIONS);
    expect(PADDLE_OPTIONS).toMatchObject({
      worker: true,
      textDetectionModelName: "PP-OCRv6_small_det",
      textRecognitionModelName: "PP-OCRv6_small_rec",
      ortOptions: {
        backend: "wasm",
        numThreads: 1,
        simd: true,
      },
    });
  });

  it("clears a rejected model promise so initialization can be retried", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("download failed"))
      .mockResolvedValue({
        initialize: vi.fn(async () => undefined),
        predict: vi.fn(async () => [{ items: [] }]),
        dispose: vi.fn(async () => undefined),
      });
    const adapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });

    await expect(adapter.initialize()).rejects.toThrow("download failed");
    await expect(adapter.initialize()).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });
});

function makePdfJsPage(page: {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render?: () => { promise: Promise<void> };
  cleanup: ReturnType<typeof vi.fn>;
}) {
  return {
    getViewport: vi.fn(page.getViewport),
    render: page.render ?? vi.fn(() => ({ promise: Promise.resolve() })),
    cleanup: page.cleanup,
  };
}

function makePdfJs(page: object) {
  const document = {
    numPages: 1,
    getPage: vi.fn(async () => page),
    destroy: vi.fn(),
  };
  return {
    getDocument: vi.fn(() => ({
      promise: Promise.resolve(document),
      destroy: vi.fn(),
    })),
    GlobalWorkerOptions: { workerSrc: "" },
  };
}

describe("createBrowserPdfAdapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("cleans up a page when viewport setup throws", async () => {
    const cleanup = vi.fn();
    const page = makePdfJsPage({
      getViewport: () => {
        throw new Error("viewport failed");
      },
      cleanup,
    });
    const document = await createBrowserPdfAdapter(makePdfJs(page)).open(new Uint8Array());

    await expect(document.renderPage(1)).rejects.toThrow("viewport failed");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("clamps rendered canvas dimensions to a positive 2400px longest side", async () => {
    const cleanup = vi.fn();
    const page = makePdfJsPage({
      getViewport: ({ scale }) =>
        scale === 1.75
          ? { width: 4_000.1, height: 1_000 }
          : { width: 2_400.0001, height: 1_200.5 },
      cleanup,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    const document = await createBrowserPdfAdapter(makePdfJs(page)).open(new Uint8Array());

    const image = await document.renderPage(1);

    expect(image.width).toBeGreaterThanOrEqual(1);
    expect(image.height).toBeGreaterThanOrEqual(1);
    expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(2_400);
    image.release();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up a page when canvas context setup fails", async () => {
    const cleanup = vi.fn();
    const page = makePdfJsPage({
      getViewport: () => ({ width: 100, height: 100 }),
      cleanup,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const document = await createBrowserPdfAdapter(makePdfJs(page)).open(new Uint8Array());

    await expect(document.renderPage(1)).rejects.toThrow("resume-ocr-unavailable");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up a page when rendering fails", async () => {
    const cleanup = vi.fn();
    const page = makePdfJsPage({
      getViewport: () => ({ width: 100, height: 100 }),
      render: vi.fn(() => ({ promise: Promise.reject(new Error("render failed")) })),
      cleanup,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    const document = await createBrowserPdfAdapter(makePdfJs(page)).open(new Uint8Array());

    await expect(document.renderPage(1)).rejects.toThrow("render failed");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
