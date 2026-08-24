// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { buildResumeGapInputHash, createResumeGapPostHandler } from "./http";

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

  it("delegates every running run to the service so fresh versus stale leases are decided by claim", async () => {
    const dependencies = deps();
    dependencies.createOrGetRun.mockResolvedValue({ ...run, status: "running" });
    const post = createResumeGapPostHandler(dependencies);
    const response = await post(new Request("http://test", { method: "POST" }), context());
    expect(response.status).toBe(200);
    expect(dependencies.runAnalysis).toHaveBeenCalledTimes(1);
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["unowned application", () => ({ getApplication: null }), 404, "getAIProcessingConsentAt"],
    ["no consent", () => ({ getAIProcessingConsentAt: null }), 403, "getLatestSucceededAnalysis"],
    ["absent JD run", () => ({ getLatestSucceededAnalysis: null }), 409, "listRequirements"],
    ["failed JD run", () => ({ getLatestSucceededAnalysis: { id: analysisId, applicationId, userId, status: "failed" } }), 409, "listRequirements"],
    ["foreign JD run", () => ({ getLatestSucceededAnalysis: { id: analysisId, applicationId, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "succeeded" } }), 409, "listRequirements"],
    ["no requirements", () => ({ listRequirements: [] }), 409, "getOwnedAsset"],
    ["no selected resume", () => ({ application: { id: applicationId, userId, resumeSourceAssetId: null } }), 409, "getOwnedAsset"],
    ["deleted asset", () => ({ getOwnedAsset: null }), 409, "createOrGetRun"],
  ] as const)("stops at the %s guard before later dependencies", async (_label, override, expectedStatus, forbidden) => {
    const dependencies = deps();
    const changes = override();
    if ("application" in changes) dependencies.getApplication.mockResolvedValue(changes.application);
    if ("getApplication" in changes) dependencies.getApplication.mockResolvedValue(changes.getApplication);
    if ("getAIProcessingConsentAt" in changes) dependencies.getAIProcessingConsentAt.mockResolvedValue(changes.getAIProcessingConsentAt);
    if ("getLatestSucceededAnalysis" in changes) dependencies.getLatestSucceededAnalysis.mockResolvedValue(changes.getLatestSucceededAnalysis);
    if ("listRequirements" in changes) dependencies.listRequirements.mockResolvedValue(changes.listRequirements);
    if ("getOwnedAsset" in changes) dependencies.getOwnedAsset.mockResolvedValue(changes.getOwnedAsset);
    const response = await createResumeGapPostHandler(dependencies)(new Request("http://test", { method: "POST" }), context());
    expect(response.status).toBe(expectedStatus);
    expect(dependencies[forbidden as keyof typeof dependencies]).not.toHaveBeenCalled();
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
  });

  it("accepts an empty body and rejects every non-strict body shape", async () => {
    const shapes: Array<[string, RequestInit]> = [
      ["malformed", { method: "POST", body: "{", headers: { "content-type": "application/json" } }],
      ["array", { method: "POST", body: "[]", headers: { "content-type": "application/json" } }],
      ["extra key", { method: "POST", body: JSON.stringify({ ocrText: "x", extra: true }), headers: { "content-type": "application/json" } }],
      ["missing key", { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } }],
      ["non-string", { method: "POST", body: JSON.stringify({ ocrText: 42 }), headers: { "content-type": "application/json" } }],
      ["non-json", { method: "POST", body: "not json", headers: { "content-type": "text/plain" } }],
    ];
    const dependencies = deps();
    const post = createResumeGapPostHandler(dependencies);
    expect((await post(new Request("http://test", { method: "POST" }), context())).status).toBe(200);
    for (const [, init] of shapes) {
      const response = await post(new Request("http://test", init), context());
      expect(response.status).toBe(400);
    }
    expect(dependencies.createOrGetRun).toHaveBeenCalledTimes(1);
  });

  it("accepts the exact one-megabyte body and rejects streamed bytes beyond it", async () => {
    const dependencies = deps();
    const post = createResumeGapPostHandler(dependencies);
    const maxBytes = 1_048_576;
    const prefixLength = JSON.stringify({ ocrText: "" }).length;
    const exactText = "x".repeat(maxBytes - prefixLength);
    const exact = await post(new Request("http://test", { method: "POST", body: JSON.stringify({ ocrText: exactText }), headers: { "content-type": "application/json" } }), context());
    expect(exact.status).toBe(200);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(maxBytes));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const streamed = await post(new Request("http://test", { method: "POST", body: stream, headers: { "content-type": "application/json" }, duplex: "half" } as RequestInit & { duplex: "half" }), context());
    expect(streamed.status).toBe(413);
  });

  it("hashes only the specified projection, without mutating requirements", () => {
    const requirement = { id: "55555555-5555-4555-8555-555555555555", category: "skill" as const, text: "SQL", priority: "core" as const };
    const other = { id: "66666666-6666-4666-8666-666666666666", category: "preferred" as const, text: "Python", priority: "supporting" as const };
    const requirements = [requirement, other];
    const baseline = buildResumeGapInputHash({ provider: "deepseek", model: "deepseek-chat", analysisRunId: analysisId, sourceSha256: "a".repeat(64), requirements });
    const before = JSON.stringify(requirements);
    expect(buildResumeGapInputHash({ provider: "deepseek", model: "deepseek-chat", analysisRunId: analysisId, sourceSha256: "a".repeat(64), requirements: [...requirements].reverse() })).toBe(baseline);
    expect(JSON.stringify(requirements)).toBe(before);
    for (const change of [
      { schemaVersion: "other-v1" }, { provider: "other" }, { model: "other" }, { analysisRunId: "66666666-6666-4666-8666-666666666666" }, { sourceSha256: "c".repeat(64) },
    ]) expect(buildResumeGapInputHash({ provider: "deepseek", model: "deepseek-chat", analysisRunId: analysisId, sourceSha256: "a".repeat(64), requirements, ...change })).not.toBe(baseline);
    for (const field of ["id", "category", "text", "priority"] as const) {
      const changed = [{ ...requirement, [field]: field === "id" ? "77777777-7777-4777-8777-777777777777" : field === "category" ? "preferred" : field === "text" ? "Other" : "supporting" }, other] as typeof requirements;
      expect(buildResumeGapInputHash({ provider: "deepseek", model: "deepseek-chat", analysisRunId: analysisId, sourceSha256: "a".repeat(64), requirements: changed })).not.toBe(baseline);
    }
  });
});
