// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getApplication: vi.fn(),
  getLatestSucceededAnalysis: vi.fn(),
  getLatestForCombination: vi.fn(),
  listItems: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/features/applications/repository", () => ({
  applicationRepository: { get: mocks.getApplication },
}));
vi.mock("@/features/jd-analysis/repository", () => ({
  jdAnalysisRepository: {
    getLatestSucceeded: mocks.getLatestSucceededAnalysis,
  },
}));
vi.mock("@/features/resume-gaps/repository", () => ({
  resumeGapRepository: {
    getLatestForCombination: mocks.getLatestForCombination,
    listItems: mocks.listItems,
  },
}));

import { GET, runtime } from "./route";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const analysisRunId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const gapRunId = "44444444-4444-4444-8444-444444444444";

describe("resume gap Markdown export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: userId });
    mocks.getApplication.mockResolvedValue({
      id: applicationId,
      userId,
      companyName: "Acme",
      roleTitle: "Product Lead",
      resumeSourceAssetId: assetId,
    });
    mocks.getLatestSucceededAnalysis.mockResolvedValue({
      id: analysisRunId,
      status: "succeeded",
      applicationId,
      userId,
    });
    mocks.getLatestForCombination.mockResolvedValue({
      id: gapRunId,
      status: "succeeded",
      applicationId,
      userId,
      analysisRunId,
      sourceAssetId: assetId,
      sourceFilename: "resume.pdf",
    });
    mocks.listItems.mockResolvedValue([]);
  });

  it("is a Node route and wires the exact current resume/JD combination", async () => {
    expect(runtime).toBe("nodejs");
    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: applicationId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getLatestForCombination).toHaveBeenCalledWith(
      userId,
      applicationId,
      assetId,
      analysisRunId,
      true,
    );
    expect(mocks.listItems).toHaveBeenCalledWith(userId, gapRunId);
  });
});
