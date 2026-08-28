// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { ResumeJDDifferenceRun } from "./repository";
import { createResumeJDDifferencePostHandler } from "./http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const factId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-08-28T10:00:00.000Z";

function run(
  status: ResumeJDDifferenceRun["status"] = "succeeded",
): ResumeJDDifferenceRun {
  const succeeded = status === "succeeded";
  const failed = status === "failed";
  return {
    id: runId,
    applicationId,
    userId,
    sourceAssetId: assetId,
    sourceFilename: "resume.pdf",
    sourceSha256: "a".repeat(64),
    jdSha256: "b".repeat(64),
    factFingerprint: "c".repeat(64),
    inputHash: "d".repeat(64),
    provider: "deepseek",
    model: "deepseek-v4-flash",
    schemaVersion: "resume-jd-difference-v4",
    promptVersion: "resume-jd-difference-p1-v4.0",
    policyVersion: "resume-jd-difference-policy-v4.0",
    status,
    attemptCount: status === "queued" ? 0 : 1,
    result: succeeded ? ({} as never) : null,
    aiUsage: succeeded ? ({} as never) : null,
    estimatedCostUsd: null,
    errorCode: failed ? "ai-timeout" : null,
    errorMessage: failed ? "safe" : null,
    startedAt: status === "queued" ? null : timestamp,
    completedAt: succeeded || failed ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function dependencies() {
  const asset = {
    id: assetId,
    userId,
    originalName: "resume.pdf",
    contentType: "application/pdf",
    storagePath: "private/resume.pdf",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    duplicateOfId: null,
    status: "ready" as const,
    errorCode: null,
    createdAt: timestamp,
  };
  const facts = [
    {
      id: factId,
      factType: "skill" as const,
      title: "SQL",
      organization: null,
      description: "Used SQL for reporting.",
      skills: ["SQL"],
      sourceExcerpt: "Used SQL",
    },
  ];
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: userId }),
    getApplication: vi.fn().mockResolvedValue({
      id: applicationId,
      userId,
      jdText: "Use SQL to produce business reports for stakeholders.",
      resumeSourceAssetId: assetId,
    }),
    getAIProcessingConsentAt: vi.fn().mockResolvedValue(timestamp),
    getOwnedAsset: vi.fn().mockResolvedValue(asset),
    listConfirmedFacts: vi.fn().mockResolvedValue(facts),
    runAnalysis: vi.fn().mockResolvedValue({
      run: run("succeeded"),
      reused: false,
    }),
    asset,
    facts,
  };
}

function context(id = applicationId) {
  return { params: Promise.resolve({ id }) };
}

function request(init: RequestInit = {}) {
  const { headers, ...rest } = init;
  return new Request("http://test", {
    method: "POST",
    ...rest,
    headers: {
      "x-resume-source-asset-id": assetId,
      ...(headers as Record<string, string> | undefined),
    },
  });
}

describe("resume JD difference POST handler", () => {
  it("returns 401 before application access for signed-out users", async () => {
    const fakes = dependencies();
    fakes.getCurrentUser.mockResolvedValueOnce(null);

    const response = await createResumeJDDifferencePostHandler(fakes)(
      request(),
      context(),
    );

    expect(response.status).toBe(401);
    expect(fakes.getApplication).not.toHaveBeenCalled();
    expect(fakes.runAnalysis).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed id", context("not-a-uuid")],
    ["unowned application", context()],
  ] as const)("returns 404 for %s", async (label, routeContext) => {
    const fakes = dependencies();
    if (label === "unowned application") {
      fakes.getApplication.mockResolvedValueOnce(null);
    }

    const response = await createResumeJDDifferencePostHandler(fakes)(
      request(),
      routeContext,
    );

    expect(response.status).toBe(404);
    expect(fakes.runAnalysis).not.toHaveBeenCalled();
  });

  it("requires explicit AI processing consent before loading the resume", async () => {
    const fakes = dependencies();
    fakes.getAIProcessingConsentAt.mockResolvedValueOnce(null);

    const response = await createResumeJDDifferencePostHandler(fakes)(
      request(),
      context(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "ai-processing-consent-required",
    });
    expect(fakes.getOwnedAsset).not.toHaveBeenCalled();
  });

  it.each([
    ["not selected", null, undefined, "resume-source-required"],
    ["header missing", assetId, undefined, "resume-source-changed"],
    [
      "header stale",
      assetId,
      "55555555-5555-4555-8555-555555555555",
      "resume-source-changed",
    ],
  ] as const)(
    "rejects a resume that is %s before analysis",
    async (_label, selectedAssetId, headerAssetId, error) => {
      const fakes = dependencies();
      fakes.getApplication.mockResolvedValueOnce({
        id: applicationId,
        userId,
        jdText: "Use SQL to produce business reports for stakeholders.",
        resumeSourceAssetId: selectedAssetId,
      });
      const response = await createResumeJDDifferencePostHandler(fakes)(
        new Request("http://test", {
          method: "POST",
          headers: headerAssetId
            ? { "x-resume-source-asset-id": headerAssetId }
            : undefined,
        }),
        context(),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error });
      expect(fakes.runAnalysis).not.toHaveBeenCalled();
    },
  );

  it("rejects a deleted or foreign selected asset", async () => {
    const fakes = dependencies();
    fakes.getOwnedAsset.mockResolvedValueOnce(null);

    const response = await createResumeJDDifferencePostHandler(fakes)(
      request(),
      context(),
    );

    expect(response.status).toBe(409);
    expect(fakes.listConfirmedFacts).not.toHaveBeenCalled();
    expect(fakes.runAnalysis).not.toHaveBeenCalled();
  });

  it("passes the current JD, selected resume, confirmed facts, and optional OCR once", async () => {
    const fakes = dependencies();
    const response = await createResumeJDDifferencePostHandler(fakes)(
      request({
        body: JSON.stringify({ ocrText: "Validated OCR resume text." }),
        headers: {
          "content-type": "application/json",
          "x-resume-source-asset-id": assetId,
        },
      }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId,
      status: "succeeded",
      reused: false,
      freshness: "current",
      errorCode: null,
    });
    expect(fakes.runAnalysis).toHaveBeenCalledTimes(1);
    expect(fakes.runAnalysis).toHaveBeenCalledWith({
      userId,
      applicationId,
      jdText: "Use SQL to produce business reports for stakeholders.",
      asset: fakes.asset,
      confirmedFacts: fakes.facts,
      ocrText: "Validated OCR resume text.",
    });
  });

  it.each(["queued", "running"] as const)(
    "returns 202 while an exact-input run is %s",
    async (status) => {
      const fakes = dependencies();
      fakes.runAnalysis.mockResolvedValueOnce({ run: run(status), reused: true });

      const response = await createResumeJDDifferencePostHandler(fakes)(
        request(),
        context(),
      );

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({
        runId,
        status,
        reused: true,
        freshness: "current",
      });
    },
  );

  it("returns a cache-reuse success without changing the response shape", async () => {
    const fakes = dependencies();
    fakes.runAnalysis.mockResolvedValueOnce({
      run: run("succeeded"),
      reused: true,
    });

    const response = await createResumeJDDifferencePostHandler(fakes)(
      request(),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      status: "succeeded",
      reused: true,
      freshness: "current",
    });
    expect(fakes.runAnalysis).toHaveBeenCalledTimes(1);
  });

  it("returns a stable failed-run DTO without exposing service details", async () => {
    const fakes = dependencies();
    fakes.runAnalysis.mockResolvedValueOnce({
      run: run("failed"),
      reused: false,
    });

    const response = await createResumeJDDifferencePostHandler(fakes)(
      request(),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId,
      status: "failed",
      reused: false,
      freshness: "current",
      errorCode: "ai-timeout",
    });
  });

  it("rejects malformed and oversized OCR bodies before analysis", async () => {
    const fakes = dependencies();
    const post = createResumeJDDifferencePostHandler(fakes);
    const malformed = await post(
      request({ body: "{", headers: { "content-type": "application/json" } }),
      context(),
    );
    const oversized = await post(
      request({
        body: JSON.stringify({ ocrText: "x".repeat(1_048_577) }),
        headers: { "content-type": "application/json" },
      }),
      context(),
    );

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(fakes.runAnalysis).not.toHaveBeenCalled();
  });
});
