import { afterEach, describe, expect, it, vi } from "vitest";

import globalSetup from "../../../tests/e2e/global-setup";

describe("Playwright global setup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips local service health checks for remote Playwright targets", async () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "https://preview.example.test");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await globalSetup();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps both local service health checks for local Playwright runs", async () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await globalSetup();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:54321/auth/v1/health");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:54324/api/v1/messages");
  });
});
