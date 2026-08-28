// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  application: "11111111-1111-4111-8111-111111111111",
  asset: "22222222-2222-4222-8222-222222222222",
  run: "33333333-3333-4333-8333-333333333333",
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getApplication: vi.fn(),
  getOwnedRun: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/features/applications/repository", () => ({
  applicationRepository: { get: mocks.getApplication },
}));
vi.mock("@/features/resume-jd-difference/repository", () => ({
  resumeJDDifferenceRepository: { getOwned: mocks.getOwnedRun },
}));

const application = {
  id: ids.application,
  userId: ids.user,
  companyName: "München & Co",
  roleTitle: "Data Analyst",
  resumeSourceAssetId: ids.asset,
};

const result = {
  jobCore: {
    missionZh: "支持业务决策。",
    coreCapabilities: ["分析", "SQL", "协作"],
    concepts: [{
      id: "concept-1",
      labelZh: "分析",
      originalTerms: ["analysis"],
      importanceReasonZh: "核心任务。",
      priority: "critical",
    }],
    gates: [],
    preferredItems: [],
  },
  overallDifference: {
    summaryZh: "需要补足场景。",
    topIssueIds: ["issue-1"],
  },
  issues: [{
    id: "issue-1",
    conceptId: "concept-1",
    jdOriginal: "Analyze customer data.",
    jdTranslationZh: "分析客户数据。",
    resumeExcerpt: "Analyzed user data.",
    resumeStatusZh: "有相邻证据。",
    profileFactIds: [],
    type: "missing_context",
    problemZh: "缺少业务场景。",
    reasonZh: "简历未说明分析用途。",
    priority: "critical",
    isGate: false,
    authenticity: "supported",
  }],
  matched: [],
  directions: [{
    id: "direction-1",
    issueId: "issue-1",
    targetSection: "experience",
    targetExperienceZh: "数据分析经历",
    conceptId: "concept-1",
    jdTerms: ["customer data"],
    focusAreas: ["context"],
    synonymousJobLanguage: [],
    authenticity: "supported",
    needsConfirmation: false,
    directionZh: "核对真实的业务场景。",
  }],
};

const run = {
  id: ids.run,
  applicationId: ids.application,
  userId: ids.user,
  sourceAssetId: ids.asset,
  sourceFilename: "resume.pdf",
  status: "succeeded",
  result,
};

const context = (id = ids.application) => ({ params: Promise.resolve({ id }) });
const request = (query = `runId=${ids.run}`) =>
  new Request(`http://test/api/export?${query}`);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: ids.user });
  mocks.getApplication.mockResolvedValue(application);
  mocks.getOwnedRun.mockResolvedValue(run);
});

describe("resume JD difference Markdown export route", () => {
  it("exports one explicitly selected owned succeeded run", async () => {
    const route = await import("./route");
    const response = await route.GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''M%C3%BCnchen-%26-Co-Data-Analyst-difference-analysis.md",
    );
    await expect(response.text()).resolves.toContain("分析客户数据。");
    expect(mocks.getOwnedRun).toHaveBeenCalledWith(ids.user, ids.run);
  });

  it("marks an explicitly requested previous result as stale", async () => {
    const route = await import("./route");
    const response = await route.GET(
      request(`runId=${ids.run}&stale=1`),
      context(),
    );
    await expect(response.text()).resolves.toContain("此结果可能已过期");
  });

  it("requires authentication, valid IDs, ownership, and a succeeded result", async () => {
    const route = await import("./route");
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await route.GET(request(), context())).status).toBe(401);

    mocks.getCurrentUser.mockResolvedValue({ id: ids.user });
    expect((await route.GET(request(), context("invalid"))).status).toBe(404);
    expect((await route.GET(request(""), context())).status).toBe(400);

    mocks.getApplication.mockResolvedValue(null);
    expect((await route.GET(request(), context())).status).toBe(404);
    mocks.getApplication.mockResolvedValue(application);

    mocks.getOwnedRun.mockResolvedValue(null);
    expect((await route.GET(request(), context())).status).toBe(404);
    mocks.getOwnedRun.mockResolvedValue({ ...run, applicationId: crypto.randomUUID() });
    expect((await route.GET(request(), context())).status).toBe(404);
    mocks.getOwnedRun.mockResolvedValue({ ...run, status: "failed", result: null });
    expect((await route.GET(request(), context())).status).toBe(409);
  });

  it("never returns provider failures", async () => {
    mocks.getOwnedRun.mockRejectedValue(new Error("raw provider body secret"));
    const route = await import("./route");
    const response = await route.GET(request(), context());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "resume-jd-difference-export-failed",
    });
  });
});
