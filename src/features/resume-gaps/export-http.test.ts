// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createResumeGapExportGetHandler } from "./export-http";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const analysisRunId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const gapRunId = "44444444-4444-4444-8444-444444444444";

function dependencies() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: userId }),
    getApplication: vi.fn().mockResolvedValue({
      id: applicationId,
      userId,
      companyName: "Acme",
      roleTitle: "Product Lead",
      resumeSourceAssetId: assetId,
    }),
    getLatestSucceededAnalysis: vi.fn().mockResolvedValue({
      id: analysisRunId,
      status: "succeeded",
      applicationId,
      userId,
    }),
    getCurrentSucceededGap: vi.fn().mockResolvedValue({
      id: gapRunId,
      status: "succeeded",
      applicationId,
      userId,
      analysisRunId,
      sourceAssetId: assetId,
      sourceFilename: "resume.pdf",
    }),
    listGapItems: vi.fn().mockResolvedValue([
      {
        requirementText: "Advanced SQL",
        translationZh: "高级 SQL",
        priority: "core",
        matchStatus: "none",
        resumeCoverage: "missing",
        verifiedResumeExcerpt: null,
        profileEvidence: [],
        sortOrder: 0,
        historical: false,
      },
    ]),
    clock: () => new Date("2026-08-25T08:30:00.000Z"),
  };
}

const context = (id = applicationId) => ({ params: Promise.resolve({ id }) });

describe("resume gap export GET handler", () => {
  it("requires authentication and hides invalid or unowned applications", async () => {
    const deps = dependencies();
    deps.getCurrentUser.mockResolvedValue(null);
    const get = createResumeGapExportGetHandler(deps);
    expect((await get(new Request("http://test"), context())).status).toBe(401);

    deps.getCurrentUser.mockResolvedValue({ id: userId });
    expect((await get(new Request("http://test"), context("invalid"))).status).toBe(404);
    deps.getApplication.mockResolvedValue(null);
    expect((await get(new Request("http://test"), context())).status).toBe(404);
  });

  it.each([
    ["resume-source-required", "application", 409],
    ["jd-analysis-required", "analysis", 409],
    ["resume-gap-required", "gap", 409],
  ] as const)("returns %s when the current export precondition is absent", async (code, missing, status) => {
    const deps = dependencies();
    if (missing === "application") {
      deps.getApplication.mockResolvedValue({
        id: applicationId,
        userId,
        companyName: "Acme",
        roleTitle: "Product Lead",
        resumeSourceAssetId: null,
      });
    }
    if (missing === "analysis") deps.getLatestSucceededAnalysis.mockResolvedValue(null);
    if (missing === "gap") deps.getCurrentSucceededGap.mockResolvedValue(null);

    const response = await createResumeGapExportGetHandler(deps)(
      new Request("http://test"),
      context(),
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: code });
  });

  it("rejects a stale gap and returns a UTF-8 attachment only for the exact current pair", async () => {
    const stale = dependencies();
    stale.getCurrentSucceededGap.mockResolvedValue({
      ...(await stale.getCurrentSucceededGap()),
      analysisRunId: "55555555-5555-4555-8555-555555555555",
    });
    const staleResponse = await createResumeGapExportGetHandler(stale)(
      new Request("http://test"),
      context(),
    );
    expect(staleResponse.status).toBe(409);

    const current = dependencies();
    const response = await createResumeGapExportGetHandler(current)(
      new Request("http://test"),
      context(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(await response.text()).toContain("高级 SQL");
    expect(current.getCurrentSucceededGap).toHaveBeenCalledWith(
      userId,
      applicationId,
      assetId,
      analysisRunId,
    );
  });
});
