// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  createBrowserOcrAdapter,
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
