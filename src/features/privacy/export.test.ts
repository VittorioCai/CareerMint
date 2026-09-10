// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import {
  RESUME_JD_DIFFERENCE_EXPORT_SELECT,
  buildAccountExport,
} from "./export";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("resume JD difference export query contract", () => {
  it("selects the user result and public metadata without internal hashes or errors", () => {
    expect(RESUME_JD_DIFFERENCE_EXPORT_SELECT).toBe(
      "id,application_id,source_asset_id,source_filename,provider,model,schema_version,prompt_version,policy_version,output_locale,status,result,ai_usage,estimated_cost_usd,completed_at,created_at",
    );
    expect(RESUME_JD_DIFFERENCE_EXPORT_SELECT).not.toMatch(
      /input_hash|source_sha256|jd_sha256|fact_fingerprint|error_code|error_message/u,
    );
  });
});

describe("buildAccountExport", () => {
  it("exports only owned profile data and files without internal paths", async () => {
    const dependencies = {
      getProfile: vi.fn().mockResolvedValue({
        userId,
        displayName: "Lin Chen",
        createdAt: "2026-08-14T00:00:00.000Z",
      }),
      listFacts: vi.fn().mockResolvedValue([
        {
          id: "22222222-2222-4222-8222-222222222222",
          userId,
          data: { title: "SQL" },
          createdAt: "2026-08-14T00:00:00.000Z",
        },
        {
          id: "99999999-9999-4999-8999-999999999999",
          userId: otherUserId,
          data: { title: "Other user secret" },
        },
      ]),
      listAssets: vi.fn().mockResolvedValue([
        {
          id: "11111111-1111-4111-8111-111111111111",
          userId,
          originalName: "../resume.pdf",
          contentType: "application/pdf",
          storagePath: `${userId}/asset/source.pdf`,
          sizeBytes: 12,
          sha256: "a".repeat(64),
          status: "ready",
          createdAt: "2026-08-14T00:00:00.000Z",
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          userId: otherUserId,
          originalName: "other.pdf",
          storagePath: `${otherUserId}/asset/source.pdf`,
        },
        {
          id: "12121212-1212-4121-8121-121212121212",
          userId,
          originalName: ".",
          storagePath: `${userId}/asset/dot.pdf`,
        },
        {
          id: "13131313-1313-4131-8131-131313131313",
          userId,
          originalName: "nested/..",
          storagePath: `${userId}/asset/dot-dot.pdf`,
        },
      ]),
      listApplications: vi.fn().mockResolvedValue([
        {
          id: "33333333-3333-4333-8333-333333333333",
          userId,
          companyName: "Acme GmbH",
          roleTitle: "Product Manager",
          jdText: "Private owned JD text",
          resumeSourceAssetId: "11111111-1111-4111-8111-111111111111",
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          userId,
          companyName: "Owned Second Company",
          roleTitle: "Analyst",
          jdText: "Second owned JD",
        },
        {
          id: "77777777-7777-4777-8777-777777777777",
          userId: otherUserId,
          companyName: "Other Company",
          roleTitle: "Secret",
          jdText: "Other user private JD",
        },
      ]),
      listApplicationEvents: vi.fn().mockResolvedValue([
        {
          id: "44444444-4444-4444-8444-444444444444",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          toStage: "applied",
        },
      ]),
      listResumeJDDifferenceRuns: vi.fn().mockResolvedValue([
        {
          id: "10707070-7070-4070-8070-707070707070",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          sourceAssetId: "11111111-1111-4111-8111-111111111111",
          sourceFilename: "resume.pdf",
          provider: "deepseek",
          model: "deepseek-v4-flash",
          schemaVersion: "resume-jd-difference-v4",
          promptVersion: "resume-jd-difference-p1-v4.0",
          policyVersion: "resume-jd-difference-policy-v4.0",
          outputLocale: "zh-CN",
          status: "succeeded",
          result: {
            jobCore: {
              mission: "支持业务决策。",
              coreCapabilities: ["分析", "SQL", "协作"],
              concepts: [{
                id: "concept-1",
                label: "分析",
                originalTerms: ["analysis"],
                importanceReason: "核心职责。",
                priority: "critical",
              }],
              gates: [],
              preferredItems: [],
            },
            overallDifference: {
              summary: "需要补足业务场景。",
              topIssueIds: ["issue-1"],
            },
            issues: [{
              id: "issue-1",
              conceptId: "concept-1",
              jdOriginal: "Analyze customer data.",
              jdTranslation: "分析客户数据。",
              resumeExcerpt: "Analyzed user data.",
              resumeStatus: "有相邻证据。",
              profileFactIds: [],
              type: "missing_context",
              problem: "缺少业务场景。",
              reason: "简历未说明分析用途。",
              priority: "critical",
              isGate: false,
              authenticity: "supported",
            }],
            matched: [],
            directions: [{
              id: "direction-1",
              issueId: "issue-1",
              targetSection: "experience",
              targetExperience: "数据分析经历",
              conceptId: "concept-1",
              jdTerms: ["customer data"],
              focusAreas: ["context"],
              synonymousJobLanguage: [],
              authenticity: "supported",
              needsConfirmation: false,
              direction: "核对真实业务场景。",
            }],
          },
          aiUsage: {
            provider: "deepseek",
            model: "deepseek-v4-flash",
            requestId: "private-request-id",
            usage: {
              inputCacheHitTokens: 10,
              inputCacheMissTokens: 20,
              outputTokens: 30,
            },
            priceScheduleVersion: "2026-08-16",
          },
          estimatedCostUsd: 0.001,
          completedAt: "2026-08-28T00:01:00.000Z",
          createdAt: "2026-08-28T00:00:00.000Z",
          inputHash: "INTERNAL INPUT HASH MUST NOT EXPORT",
          sourceSha256: "INTERNAL SOURCE HASH MUST NOT EXPORT",
          errorMessage: "PRIVATE DIFFERENCE ERROR MUST NOT EXPORT",
          providerRawResponse: "RAW DIFFERENCE RESPONSE MUST NOT EXPORT",
        },
        {
          id: "bbbbbbbb-7070-4070-8070-707070707070",
          userId: otherUserId,
          applicationId: "77777777-7777-4777-8777-777777777777",
          sourceAssetId: null,
          sourceFilename: "secret.pdf",
          provider: "deepseek",
          model: "deepseek-v4-flash",
          schemaVersion: "resume-jd-difference-v4",
          promptVersion: "resume-jd-difference-p1-v4.0",
          policyVersion: "resume-jd-difference-policy-v4.0",
          outputLocale: "zh-CN",
          status: "succeeded",
          result: { secret: "OTHER USER DIFFERENCE SECRET" },
          aiUsage: null,
          estimatedCostUsd: null,
          completedAt: null,
          createdAt: "2026-08-28T00:00:00.000Z",
        },
      ]),
      listInterviewQuestions: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-4444-4444-8444-444444444444",
          userId,
          prompt: "Tell me about yourself.",
          answerOutline: "Present, past, and why this role.",
          applicationLinks: [],
          facts: [],
        },
        {
          id: "aaaaaaaa-5555-4555-8555-555555555555",
          userId: otherUserId,
          prompt: "Other user interview secret",
          applicationLinks: [],
          facts: [],
        },
      ]),
      listInterviewGenerationRuns: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-6666-4666-8666-666666666666",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          schemaVersion: "interview-question-generation-v1",
          provider: "deepseek",
          model: "deepseek-chat",
          status: "succeeded",
          attemptCount: 1,
          result: {
            acceptedCandidateCount: 1,
            rejectedCandidateCount: 0,
            pendingCandidateCount: 0,
            ai: {
              provider: "deepseek",
              model: "deepseek-chat",
              requestId: "req-owned",
              usage: {
                inputCacheHitTokens: 10,
                inputCacheMissTokens: 20,
                outputTokens: 30,
              },
              priceScheduleVersion: "2026-01",
            },
            estimatedCost: {
              amount: 0.001,
              currency: "USD",
              scheduleVersion: "2026-01",
              tier: "default",
            },
          },
          errorCode: null,
          errorMessage: "FULL JD SECRET MUST NOT EXPORT",
          requestId: "req-owned",
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:01:00.000Z",
          rawFullJobDescription: "FULL JD SECRET MUST NOT EXPORT",
          providerRawBody: "PROVIDER RAW SECRET MUST NOT EXPORT",
        },
        {
          id: "bbbbbbbb-6666-4666-8666-666666666666",
          userId: otherUserId,
          applicationId: "77777777-7777-4777-8777-777777777777",
          schemaVersion: "interview-question-generation-v1",
          provider: "deepseek",
          model: "deepseek-chat",
          status: "succeeded",
          attemptCount: 1,
          result: null,
          errorCode: null,
          errorMessage: "OTHER USER SECRET",
          requestId: "req-other",
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:01:00.000Z",
          rawFullJobDescription: "OTHER USER FULL JD",
        },
        {
          id: "cccccccc-6666-4666-8666-666666666666",
          userId,
          applicationId: "77777777-7777-4777-8777-777777777777",
          schemaVersion: "interview-question-generation-v1",
          provider: "deepseek",
          model: "deepseek-chat",
          status: "failed",
          attemptCount: 1,
          result: null,
          errorCode: "interview-question-generation-provider-error",
          errorMessage: "FULL JD SECRET MUST NOT EXPORT",
          requestId: null,
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:01:00.000Z",
          rawFullJobDescription: "FULL JD SECRET MUST NOT EXPORT",
        },
      ]),
      listInterviewGenerationCandidates: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-7777-4777-8777-777777777777",
          runId: "aaaaaaaa-6666-4666-8666-666666666666",
          applicationId: "33333333-3333-4333-8333-333333333333",
          userId,
          category: "function",
          prompt: "How would you improve this workflow?",
          canonicalKey: "how would you improve this workflow?",
          sourceExcerpt: "improve this workflow",
          relevanceReason: "The role emphasizes workflow improvement.",
          status: "accepted",
          questionId: "aaaaaaaa-8888-4888-8888-888888888888",
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:02:00.000Z",
        },
        {
          id: "bbbbbbbb-7777-4777-8777-777777777777",
          runId: "aaaaaaaa-6666-4666-8666-666666666666",
          applicationId: "77777777-7777-4777-8777-777777777777",
          userId,
          category: "job_specific",
          prompt: "Cross-application candidate",
          canonicalKey: "cross-application candidate",
          sourceExcerpt: "cross application",
          relevanceReason: "Should not be exported.",
          status: "pending",
          questionId: null,
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
        {
          id: "cccccccc-7777-4777-8777-777777777777",
          runId: "aaaaaaaa-6666-4666-8666-666666666666",
          applicationId: "33333333-3333-4333-8333-333333333333",
          userId: otherUserId,
          category: "industry",
          prompt: "Cross-user candidate",
          canonicalKey: "cross-user candidate",
          sourceExcerpt: "cross user",
          relevanceReason: "Should not be exported.",
          status: "pending",
          questionId: null,
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
      ]),
      download: vi.fn().mockResolvedValue(new Blob(["synthetic pdf"])),
    };

    const buffer = await buildAccountExport(userId, dependencies);
    const zip = await JSZip.loadAsync(buffer);

    expect(Object.keys(zip.files).sort()).toEqual([
      "files/",
      "files/11111111-1111-4111-8111-111111111111/",
      "files/11111111-1111-4111-8111-111111111111/resume.pdf",
      "files/12121212-1212-4121-8121-121212121212/",
      "files/12121212-1212-4121-8121-121212121212/source-file",
      "files/13131313-1313-4131-8131-131313131313/",
      "files/13131313-1313-4131-8131-131313131313/source-file",
      "application-workspaces.json",
      "interview-preparation.json",
      "profile.json",
      "resume-jd-difference.json",
      "source-assets.json",
    ].sort());
    const profileJson = await zip.file("profile.json")!.async("string");
    const assetsJson = await zip.file("source-assets.json")!.async("string");
    const applicationsJson = await zip
      .file("application-workspaces.json")!
      .async("string");
    const interviewJson = await zip
      .file("interview-preparation.json")!
      .async("string");
    const differenceJson = await zip.file("resume-jd-difference.json")!.async("string");
    expect(profileJson).toContain("Lin Chen");
    expect(profileJson).toContain("SQL");
    expect(profileJson).not.toContain("Other user secret");
    expect(assetsJson).not.toContain("storagePath");
    expect(assetsJson).not.toContain("storage_path");
    expect(assetsJson).not.toContain(`${userId}/asset/source.pdf`);
    expect(JSON.stringify(Object.keys(zip.files))).not.toContain(otherUserId);
    expect(applicationsJson).toContain("Acme GmbH");
    expect(applicationsJson).toContain("Private owned JD text");
    expect(applicationsJson).toContain("resumeSourceAssetId");
    expect(applicationsJson).toContain("11111111-1111-4111-8111-111111111111");
    expect(applicationsJson).not.toContain("Other user private JD");
    expect(interviewJson).toContain("Tell me about yourself.");
    expect(interviewJson).toContain("Present, past, and why this role.");
    expect(interviewJson).not.toContain("Other user interview secret");
    const interviewExport = JSON.parse(interviewJson) as {
      generationRuns: Array<Record<string, unknown>>;
      generationCandidates: Array<Record<string, unknown>>;
    };
    expect(interviewExport.generationRuns).toHaveLength(1);
    expect(interviewExport.generationRuns[0]).toMatchObject({
      id: "aaaaaaaa-6666-4666-8666-666666666666",
      applicationId: "33333333-3333-4333-8333-333333333333",
      provider: "deepseek",
      model: "deepseek-chat",
      status: "succeeded",
      attemptCount: 1,
      requestId: "req-owned",
    });
    expect(interviewExport.generationRuns[0]).not.toHaveProperty("errorMessage");
    expect(interviewExport.generationRuns[0]).not.toHaveProperty("rawFullJobDescription");
    expect(interviewExport.generationRuns[0]).not.toHaveProperty("providerRawBody");
    expect(interviewExport.generationCandidates).toHaveLength(1);
    expect(interviewExport.generationCandidates[0]).toMatchObject({
      id: "aaaaaaaa-7777-4777-8777-777777777777",
      runId: "aaaaaaaa-6666-4666-8666-666666666666",
      applicationId: "33333333-3333-4333-8333-333333333333",
      canonicalKey: "how would you improve this workflow?",
      status: "accepted",
      questionId: "aaaaaaaa-8888-4888-8888-888888888888",
      createdAt: "2026-08-21T00:00:00.000Z",
      reviewedAt: "2026-08-21T00:02:00.000Z",
    });
    expect(interviewJson).not.toContain("FULL JD SECRET MUST NOT EXPORT");
    expect(interviewJson).not.toContain("PROVIDER RAW SECRET MUST NOT EXPORT");
    expect(interviewJson).not.toContain("Cross-application candidate");
    expect(interviewJson).not.toContain("Cross-user candidate");
    const differenceExport = JSON.parse(differenceJson) as {
      schemaVersion: string;
      runs: Array<Record<string, unknown>>;
    };
    expect(differenceExport.schemaVersion).toBe("resume-jd-difference-history-v4");
    expect(differenceExport.runs).toHaveLength(1);
    expect(differenceExport.runs[0]).toMatchObject({
      id: "10707070-7070-4070-8070-707070707070",
      applicationId: "33333333-3333-4333-8333-333333333333",
      sourceAssetId: "11111111-1111-4111-8111-111111111111",
      sourceFilename: "resume.pdf",
      status: "succeeded",
      result: expect.objectContaining({
        overallDifference: { summary: "需要补足业务场景。", topIssueIds: ["issue-1"] },
      }),
    });
    expect(differenceExport.runs[0]).not.toHaveProperty("inputHash");
    expect(differenceExport.runs[0]).not.toHaveProperty("sourceSha256");
    expect(differenceExport.runs[0]).not.toHaveProperty("errorMessage");
    expect(JSON.stringify(differenceExport.runs[0])).not.toContain("private-request-id");
    expect(differenceJson).not.toContain("RAW DIFFERENCE RESPONSE MUST NOT EXPORT");
    expect(differenceJson).not.toContain("INTERNAL INPUT HASH MUST NOT EXPORT");
    expect(differenceJson).not.toContain("PRIVATE DIFFERENCE ERROR MUST NOT EXPORT");
    expect(differenceJson).not.toContain("OTHER USER DIFFERENCE SECRET");
    expect(dependencies.download).toHaveBeenCalledTimes(3);
    expect(dependencies.download).toHaveBeenCalledWith(
      `${userId}/asset/source.pdf`,
    );
    expect(dependencies.download).toHaveBeenCalledWith(
      `${userId}/asset/dot.pdf`,
    );
    expect(dependencies.download).toHaveBeenCalledWith(
      `${userId}/asset/dot-dot.pdf`,
    );
  });
});
