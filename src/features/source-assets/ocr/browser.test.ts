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
  render?: () => { promise: Promise<void>; cancel?: () => void };
  cleanup: ReturnType<typeof vi.fn>;
}) {
  return {
    getViewport: vi.fn(page.getViewport),
    render: page.render ?? vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
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

  async function expectAbortQuickly<T>(promise: Promise<T>, controller: AbortController) {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("abort timed out")), 100);
    });
    controller.abort();
    await expect(Promise.race([promise, timeout])).rejects.toMatchObject({ name: "AbortError" });
  }

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

  it("aborts PDF loading promptly and destroys the loading task", async () => {
    const controller = new AbortController();
    const destroy = vi.fn();
    const pdfjs = {
      getDocument: vi.fn(() => ({
        promise: new Promise<never>(() => undefined),
        destroy,
      })),
      GlobalWorkerOptions: { workerSrc: "" },
    };

    await expectAbortQuickly(
      createBrowserPdfAdapter(pdfjs).open(new Uint8Array(), controller.signal),
      controller,
    );
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("aborts PDF rendering promptly and cancels the render task", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const cleanup = vi.fn();
    const page = makePdfJsPage({
      getViewport: () => ({ width: 100, height: 100 }),
      render: vi.fn(() => ({ promise: new Promise<never>(() => undefined), cancel })),
      cleanup,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    const document = await createBrowserPdfAdapter(makePdfJs(page)).open(new Uint8Array());

    const rendering = document.renderPage(1, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expectAbortQuickly(rendering, controller);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up a page that resolves after getPage was aborted", async () => {
    const controller = new AbortController();
    const cleanup = vi.fn();
    let resolvePage!: (page: object) => void;
    const pagePromise = new Promise<object>((resolve) => {
      resolvePage = resolve;
    });
    const page = makePdfJsPage({
      getViewport: () => ({ width: 100, height: 100 }),
      cleanup,
    });
    const pdfjs = {
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn(() => pagePromise),
          destroy: vi.fn(),
        }),
        destroy: vi.fn(),
      })),
      GlobalWorkerOptions: { workerSrc: "" },
    };
    const document = await createBrowserPdfAdapter(pdfjs).open(new Uint8Array());
    const rendering = document.renderPage(1, controller.signal);

    controller.abort();
    await expect(rendering).rejects.toMatchObject({ name: "AbortError" });
    resolvePage(page);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe("browser PaddleOCR aborts", () => {
  beforeEach(() => resetBrowserOcrModelForTests());
  afterEach(() => resetBrowserOcrModelForTests());

  it("aborts model initialization promptly", async () => {
    const controller = new AbortController();
    const create = vi.fn(() => new Promise<never>(() => undefined));
    const adapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("abort timed out")), 100);
    });

    controller.abort();
    await expect(Promise.race([adapter.initialize(controller.signal), timeout])).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("aborts prediction promptly and disposes the current model", async () => {
    const controller = new AbortController();
    const dispose = vi.fn(async () => undefined);
    const instance = {
      initialize: vi.fn(async () => undefined),
      predict: vi.fn(() => new Promise<never>(() => undefined)),
      dispose,
    };
    const create = vi.fn(async () => instance);
    const adapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    await adapter.initialize();
    const image = {
      page: 1,
      width: 1,
      height: 1,
      source: document.createElement("canvas"),
      release: vi.fn(),
    };
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("abort timed out")), 100);
    });

    controller.abort();
    await expect(Promise.race([adapter.recognize(image, controller.signal), timeout])).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("clears a failed model generation before the next adapter initializes", async () => {
    const disposeFirst = vi.fn(async () => undefined);
    const disposeSecond = vi.fn(async () => undefined);
    const first = {
      initialize: vi.fn(async () => undefined),
      predict: vi.fn(async () => {
        throw new Error("fatal predict");
      }),
      dispose: disposeFirst,
    };
    const second = {
      initialize: vi.fn(async () => undefined),
      predict: vi.fn(async () => [{ items: [] }]),
      dispose: disposeSecond,
    };
    const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const firstAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const secondAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const image = {
      page: 1,
      width: 1,
      height: 1,
      source: document.createElement("canvas"),
      release: vi.fn(),
    };

    await firstAdapter.initialize();
    await expect(firstAdapter.recognize(image)).rejects.toThrow("fatal predict");
    expect(disposeFirst).toHaveBeenCalledOnce();
    await secondAdapter.initialize();
    await expect(secondAdapter.recognize(image)).resolves.toEqual({ items: [] });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps a shared model alive when one consumer aborts initialization", async () => {
    const controller = new AbortController();
    let resolveInitialize!: () => void;
    const initializeGate = new Promise<void>((resolve) => {
      resolveInitialize = resolve;
    });
    const dispose = vi.fn(async () => undefined);
    const instance = {
      initialize: vi.fn(() => initializeGate),
      predict: vi.fn(async () => [{ items: [] }]),
      dispose,
    };
    const create = vi.fn(async () => instance);
    const firstAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const secondAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const first = firstAdapter.initialize(controller.signal);
    const second = secondAdapter.initialize();
    await new Promise((resolve) => setTimeout(resolve, 0));

    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).not.toHaveBeenCalled();
    resolveInitialize();
    await expect(second).resolves.toBeUndefined();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("does not dispose a shared model when one active recognizer fails", async () => {
    let resolveSecond!: (value: Array<{ items: never[] }>) => void;
    const secondPrediction = new Promise<Array<{ items: never[] }>>((resolve) => {
      resolveSecond = resolve;
    });
    const dispose = vi.fn(async () => undefined);
    const instance = {
      initialize: vi.fn(async () => undefined),
      predict: vi
        .fn()
        .mockRejectedValueOnce(new Error("fatal predict"))
        .mockReturnValueOnce(secondPrediction),
      dispose,
    };
    const create = vi.fn(async () => instance);
    const firstAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const secondAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const image = {
      page: 1,
      width: 1,
      height: 1,
      source: document.createElement("canvas"),
      release: vi.fn(),
    };
    await Promise.all([firstAdapter.initialize(), secondAdapter.initialize()]);

    const first = firstAdapter.recognize(image);
    const second = secondAdapter.recognize(image);
    await expect(first).rejects.toThrow("fatal predict");
    expect(dispose).not.toHaveBeenCalled();
    resolveSecond([{ items: [] }]);
    await expect(second).resolves.toEqual({ items: [] });
    expect(dispose).not.toHaveBeenCalled();
  });

  it("releases a healthy consumer lease without disposing the shared model", async () => {
    const instance = {
      initialize: vi.fn(async () => undefined),
      predict: vi.fn(async () => [{ items: [] }]),
      dispose: vi.fn(async () => undefined),
    };
    const create = vi.fn(async () => instance);
    const firstAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const secondAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });

    await firstAdapter.initialize();
    await firstAdapter.dispose();
    await secondAdapter.initialize();

    expect(create).toHaveBeenCalledOnce();
    expect(instance.dispose).not.toHaveBeenCalled();
  });

  it("invalidates a fatal generation and disposes it after the last consumer leaves", async () => {
    const first = {
      initialize: vi.fn(async () => undefined),
      predict: vi.fn(async () => {
        throw new Error("fatal predict");
      }),
      dispose: vi.fn(async () => undefined),
    };
    const second = {
      initialize: vi.fn(async () => undefined),
      predict: vi.fn(async () => [{ items: [] }]),
      dispose: vi.fn(async () => undefined),
    };
    const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const firstAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const secondAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    const image = {
      page: 1,
      width: 1,
      height: 1,
      source: document.createElement("canvas"),
      release: vi.fn(),
    };
    await Promise.all([firstAdapter.initialize(), secondAdapter.initialize()]);

    await expect(firstAdapter.recognize(image)).rejects.toThrow("fatal predict");
    expect(first.dispose).not.toHaveBeenCalled();
    await secondAdapter.dispose();
    expect(first.dispose).toHaveBeenCalledOnce();

    const retryAdapter = createBrowserOcrAdapter({
      createPaddleModule: async () => ({ PaddleOCR: { create } }),
    });
    await retryAdapter.initialize();
    expect(create).toHaveBeenCalledTimes(2);
    expect(second.dispose).not.toHaveBeenCalled();
  });
});
