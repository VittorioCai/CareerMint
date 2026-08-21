// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createAbortError, raceWithAbort } from "./abort";

function neverSettles<T>() {
  return new Promise<T>(() => undefined);
}

async function expectAbortQuickly<T>(promise: Promise<T>, controller: AbortController) {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("abort timed out")), 100);
  });
  controller.abort();
  await expect(Promise.race([promise, timeout])).rejects.toMatchObject({ name: "AbortError" });
}

describe("raceWithAbort", () => {
  it("rejects a never-settling operation promptly and consumes its late settlement", async () => {
    const controller = new AbortController();
    const late = neverSettles<string>();

    await expectAbortQuickly(raceWithAbort(late, controller.signal), controller);
    expect(createAbortError().name).toBe("AbortError");
  });

  it("runs cancellation exactly once when aborting", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();

    await expectAbortQuickly(raceWithAbort(neverSettles(), controller.signal, cancel), controller);
    controller.abort();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
