// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createResumeGapPostHandler } from "./http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";
const analysisId = "22222222-2222-4222-8222-222222222222";
const run = {
  id: "44444444-4444-4444-8444-444444444444",
  status: "queued" as const,
  errorCode: null,
};

function deps() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: userId }),
    getApplication: vi.fn().mockResolvedValue({ id: applicationId, userId, resumeSourceAssetId: assetId }),
    getAIProcessingConsentAt: vi.fn().mockResolvedValue("2026-08-24T00:00:00Z"),
    getLatestSucceededAnalysis: vi.fn().mockResolvedValue({ id: analysisId, applicationId, userId, status: "succeeded" }),
    listRequirements: vi.fn().mockResolvedValue([{ id: "55555555-5555-4555-8555-555555555555", category: "skill", text: "SQL", priority: "core" }]),
    getOwnedAsset: vi.fn().mockResolvedValue({ id: assetId, userId, originalName: "resume.pdf", sha256: "a".repeat(64), contentType: "application/pdf", storagePath: "safe/path" }),
    createOrGetRun: vi.fn().mockResolvedValue(run),
    providerConfig: { provider: "deepseek", model: "deepseek-chat" },
    providerFactory: vi.fn(),
    runAnalysis: vi.fn().mockResolvedValue({ run: { ...run, status: "succeeded" }, reused: false }),
  };
}

function context() { return { params: Promise.resolve({ id: applicationId }) }; }

describe("resume gaps POST handler", () => {
  it("rejects malformed/oversized JSON without touching persistence", async () => {
    const dependencies = deps();
    const post = createResumeGapPostHandler(dependencies);
    const malformed = await post(new Request("http://test", { method: "POST", body: "{", headers: { "content-type": "application/json" } }), context());
    expect(malformed.status).toBe(400);
    const oversized = await post(new Request("http://test", { method: "POST", body: JSON.stringify({ ocrText: "x".repeat(1_048_577) }), headers: { "content-type": "application/json" } }), context());
    expect(oversized.status).toBe(413);
    expect(dependencies.createOrGetRun).not.toHaveBeenCalled();
  });

  it("guards owner and consent before provider construction, then returns only the mutation DTO", async () => {
    const dependencies = deps();
    const post = createResumeGapPostHandler(dependencies);
    dependencies.getCurrentUser.mockResolvedValue(null);
    expect((await post(new Request("http://test", { method: "POST" }), context())).status).toBe(401);
    dependencies.getCurrentUser.mockResolvedValue({ id: userId });
    dependencies.getAIProcessingConsentAt.mockResolvedValue(null);
    expect((await post(new Request("http://test", { method: "POST" }), context())).status).toBe(403);
    expect(dependencies.providerFactory).not.toHaveBeenCalled();

    dependencies.getAIProcessingConsentAt.mockResolvedValue("2026-08-24T00:00:00Z");
    const response = await post(new Request("http://test", { method: "POST", body: JSON.stringify({ ocrText: "validated OCR" }), headers: { "content-type": "application/json" } }), context());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ runId: run.id, status: "succeeded", reused: false, errorCode: null });
  });
});
