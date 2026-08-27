// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  application: "11111111-1111-4111-8111-111111111111",
  structure: "22222222-2222-4222-8222-222222222222",
  asset: "33333333-3333-4333-8333-333333333333",
  gap: "44444444-4444-4444-8444-444444444444",
  requirement: "55555555-5555-4555-8555-555555555555",
  criterion: "66666666-6666-4666-8666-666666666666",
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getApplication: vi.fn(),
  getLatestStructure: vi.fn(),
  getLatestGapForCombination: vi.fn(),
  listGapView: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/features/applications/repository", () => ({
  applicationRepository: { get: mocks.getApplication },
}));
vi.mock("@/features/jd-gap-analysis/structure-repository", () => ({
  jdStructureRepository: { getLatest: mocks.getLatestStructure },
}));
vi.mock("@/features/jd-gap-analysis/gap-repository", () => ({
  jdGapV3Repository: {
    getLatestForCombination: mocks.getLatestGapForCombination,
    listView: mocks.listGapView,
  },
}));

const application = {
  id: ids.application,
  userId: ids.user,
  companyName: "München & Co",
  roleTitle: "Data Analyst",
  resumeSourceAssetId: ids.asset,
};
const structure = {
  id: ids.structure,
  applicationId: ids.application,
  userId: ids.user,
  status: "succeeded" as const,
};
const gap = {
  id: ids.gap,
  applicationId: ids.application,
  userId: ids.user,
  structureRunId: ids.structure,
  sourceAssetId: ids.asset,
  sourceFilename: "resume.pdf",
  status: "succeeded" as const,
};
const view = {
  run: gap,
  structureRun: structure,
  requirements: [{
    id: ids.requirement,
    translationZh: "需要高级 SQL",
    originalText: "Advanced SQL required",
    sortOrder: 0,
    result: {
      coverageStatus: "none" as const,
      impactLevel: "important" as const,
      coveredCriterionCount: 0,
      missingCriterionCount: 1,
    },
    criteria: [{
      id: ids.criterion,
      translationZh: "高级 SQL",
      originalText: "Advanced SQL",
      assessment: {
        resumeEvidenceStatus: "none" as const,
        resumeExcerpt: null,
        profileFacts: [],
        gapType: "missing_from_resume" as const,
        reasonZh: "当前简历没有高级 SQL 证据。",
        userQuestionZh: "是否有高级 SQL 项目？",
      },
    }],
  }],
};

function context(id = ids.application) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: ids.user });
  mocks.getApplication.mockResolvedValue(application);
  mocks.getLatestStructure.mockResolvedValue(structure);
  mocks.getLatestGapForCombination.mockResolvedValue(gap);
  mocks.listGapView.mockResolvedValue(view);
});

describe("JD gap Markdown export route", () => {
  it("exports only the current owned succeeded V3 result", async () => {
    const route = await import("./route");
    const response = await route.GET(new Request("http://test"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''M%C3%BCnchen-%26-Co-Data-Analyst-jd-gap.md");
    await expect(response.text()).resolves.toContain("需要高级 SQL");
    expect(mocks.getLatestGapForCombination).toHaveBeenCalledWith(
      ids.user,
      ids.application,
      ids.asset,
      ids.structure,
    );
    expect(mocks.listGapView).toHaveBeenCalledWith(ids.user, ids.gap);
  });

  it.each([
    ["missing selected resume", { application: { ...application, resumeSourceAssetId: null } }],
    ["missing structure", { structure: null }],
    ["stale or absent gap", { gap: null }],
    ["latest gap failed", { gap: { ...gap, status: "failed" } }],
    ["cross-user gap", { gap: { ...gap, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["mismatched view", { view: { ...view, run: { ...gap, id: "77777777-7777-4777-8777-777777777777" } } }],
  ])("returns 409 for %s", async (_label, setup) => {
    if ("application" in setup) mocks.getApplication.mockResolvedValue(setup.application);
    if ("structure" in setup) mocks.getLatestStructure.mockResolvedValue(setup.structure);
    if ("gap" in setup) mocks.getLatestGapForCombination.mockResolvedValue(setup.gap);
    if ("view" in setup) mocks.listGapView.mockResolvedValue(setup.view);
    const route = await import("./route");

    const response = await route.GET(new Request("http://test"), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "jd-gap-export-not-current" });
  });

  it("does not expose provider errors", async () => {
    mocks.listGapView.mockRejectedValue(new Error("raw provider body secret"));
    const route = await import("./route");
    const response = await route.GET(new Request("http://test"), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "jd-gap-export-failed" });
  });
});
