// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { extractScannedPdfText } from "./index";

describe("extractScannedPdfText", () => {
  it("aborts a never-settling file read before loading OCR dependencies", async () => {
    const controller = new AbortController();
    const file = {
      arrayBuffer: vi.fn(() => new Promise<ArrayBuffer>(() => undefined)),
    } as unknown as Blob;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("abort timed out")), 100);
    });

    controller.abort();
    await expect(
      Promise.race([extractScannedPdfText(file, { signal: controller.signal }), timeout]),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(file.arrayBuffer).toHaveBeenCalledOnce();
  });
});
