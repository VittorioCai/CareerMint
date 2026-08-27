// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import {
  JD_GAP_V3_ASSESSMENT_EXPORT_SELECT,
  JD_GAP_V3_RESULT_EXPORT_SELECT,
  JD_GAP_V3_RUN_EXPORT_SELECT,
  JD_STRUCTURE_CRITERION_EXPORT_SELECT,
  JD_STRUCTURE_REQUIREMENT_EXPORT_SELECT,
  JD_STRUCTURE_RUN_EXPORT_SELECT,
  RESUME_GAP_ITEM_EXPORT_SELECT,
  RESUME_GAP_RUN_EXPORT_SELECT,
  buildAccountExport,
} from "./export";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("resume gap export query contract", () => {
  it("selects only the minimum run and item fields used by the export DTO", () => {
    expect(RESUME_GAP_RUN_EXPORT_SELECT).toBe(
      "id,user_id,application_id,analysis_run_id,source_asset_id,source_filename,source_sha256,provider,model,status,attempt_count,result,error_code,created_at,updated_at,started_at,finished_at",
    );
    expect(RESUME_GAP_ITEM_EXPORT_SELECT).toBe(
      "id,run_id,application_id,user_id,requirement_id,requirement_text,category,priority,jd_source_excerpt,resume_coverage,verified_resume_excerpt,sort_order,created_at",
    );
    expect(RESUME_GAP_RUN_EXPORT_SELECT).not.toContain("input_hash");
    expect(RESUME_GAP_RUN_EXPORT_SELECT).not.toContain("error_message");
  });
});

describe("JD gap V3 export query contract", () => {
  it("selects bounded public fields without source documents or internal hashes", () => {
    expect(JD_STRUCTURE_RUN_EXPORT_SELECT).not.toMatch(/jd_sha256|input_hash|jd_translation_zh|error_message/u);
    expect(JD_GAP_V3_RUN_EXPORT_SELECT).not.toMatch(/source_sha256|fact_fingerprint|input_hash|error_message/u);
    expect(JD_STRUCTURE_REQUIREMENT_EXPORT_SELECT).toContain("translation_zh");
    expect(JD_STRUCTURE_CRITERION_EXPORT_SELECT).toContain("constraint_payload");
    expect(JD_GAP_V3_RESULT_EXPORT_SELECT).toContain("coverage_status");
    expect(JD_GAP_V3_ASSESSMENT_EXPORT_SELECT).toContain("verified_resume_excerpt");
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
      listAnalysisRuns: vi.fn().mockResolvedValue([
        {
          id: "55555555-5555-4555-8555-555555555555",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          status: "succeeded",
        },
      ]),
      listRequirements: vi.fn().mockResolvedValue([
        {
          id: "66666666-6666-4666-8666-666666666666",
          applicationId: "33333333-3333-4333-8333-333333333333",
          text: "Advanced SQL",
          evidence: [],
        },
      ]),
      listResumeRuns: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-1111-4111-8111-111111111111",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          status: "succeeded",
        },
      ]),
      listResumeGapRuns: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-9999-4999-8999-999999999999",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          analysisRunId: "55555555-5555-4555-8555-555555555555",
          sourceAssetId: "11111111-1111-4111-8111-111111111111",
          sourceFilename: "resume.pdf",
          sourceSha256: "a".repeat(64),
          inputHash: "b".repeat(64),
          provider: "deepseek",
          model: "deepseek-chat",
          status: "succeeded",
          attemptCount: 1,
          result: {
            acceptedItemCount: 1,
            coveredItemCount: 0,
            partialItemCount: 0,
            missingItemCount: 1,
            fullResumeText: "PARSED FULL RESUME MUST NOT EXPORT",
            providerRawResponse: "RAW PROVIDER RESPONSE MUST NOT EXPORT",
          },
          errorCode: null,
          errorMessage: "PRIVATE PROVIDER ERROR MUST NOT EXPORT",
          errorStack: "PRIVATE STACK MUST NOT EXPORT",
          createdAt: "2026-08-22T00:00:00.000Z",
          updatedAt: "2026-08-22T00:01:00.000Z",
          startedAt: "2026-08-22T00:00:30.000Z",
          finishedAt: "2026-08-22T00:01:00.000Z",
          signedUrl: "https://private.example/signed",
          storageCredential: "private-storage-secret",
        },
        {
          id: "aaaaaaaa-9999-4999-8999-999999999998",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          analysisRunId: "55555555-5555-4555-8555-555555555555",
          sourceAssetId: "11111111-1111-4111-8111-111111111111",
          sourceFilename: "resume.pdf",
          sourceSha256: "a".repeat(64),
          provider: "deepseek",
          model: "deepseek-chat",
          status: "succeeded",
          attemptCount: 1,
          result: {
            acceptedItemCount: 2,
            coveredItemCount: 0,
            partialItemCount: 0,
            missingItemCount: 1,
          },
          errorCode: null,
          createdAt: "2026-08-22T00:00:00.000Z",
          updatedAt: "2026-08-22T00:01:00.000Z",
          startedAt: "2026-08-22T00:00:30.000Z",
          finishedAt: "2026-08-22T00:01:00.000Z",
        },
        {
          id: "aaaaaaaa-9999-4999-8999-999999999997",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          analysisRunId: "55555555-5555-4555-8555-555555555555",
          sourceAssetId: "11111111-1111-4111-8111-111111111111",
          sourceFilename: "resume.pdf",
          sourceSha256: "a".repeat(64),
          provider: "deepseek",
          model: "deepseek-chat",
          status: "succeeded",
          attemptCount: 1,
          result: {
            acceptedItemCount: 81,
            coveredItemCount: 81,
            partialItemCount: 0,
            missingItemCount: 0,
          },
          errorCode: null,
          createdAt: "2026-08-22T00:00:00.000Z",
          updatedAt: "2026-08-22T00:01:00.000Z",
          startedAt: "2026-08-22T00:00:30.000Z",
          finishedAt: "2026-08-22T00:01:00.000Z",
        },
        {
          id: "bbbbbbbb-9999-4999-8999-999999999999",
          userId: otherUserId,
          applicationId: "77777777-7777-4777-8777-777777777777",
          analysisRunId: "bbbbbbbb-5555-4555-8555-555555555555",
          sourceAssetId: null,
          sourceFilename: "other.pdf",
          sourceSha256: "c".repeat(64),
          inputHash: "d".repeat(64),
          provider: "deepseek",
          model: "deepseek-chat",
          status: "succeeded",
          attemptCount: 1,
          result: null,
          errorCode: null,
          errorMessage: null,
          createdAt: "2026-08-22T00:00:00.000Z",
          updatedAt: "2026-08-22T00:01:00.000Z",
          startedAt: "2026-08-22T00:00:30.000Z",
          finishedAt: "2026-08-22T00:01:00.000Z",
        },
      ]),
      listResumeGapItems: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-111111111111",
          runId: "aaaaaaaa-9999-4999-8999-999999999999",
          applicationId: "33333333-3333-4333-8333-333333333333",
          userId,
          requirementId: "66666666-6666-4666-8666-666666666666",
          requirementText: "Advanced SQL",
          category: "skill",
          priority: "core",
          jdSourceExcerpt: "Use SQL for business analysis.",
          resumeCoverage: "missing",
          verifiedResumeExcerpt: null,
          sortOrder: 0,
          createdAt: "2026-08-22T00:01:00.000Z",
          fullJdText: "FULL ADDITIONAL JD MUST NOT EXPORT",
          signedUrl: "https://private.example/signed-item",
        },
        {
          id: "cccccccc-cccc-4ccc-8ccc-111111111111",
          runId: "aaaaaaaa-9999-4999-8999-999999999999",
          applicationId: "44444444-4444-4444-8444-444444444444",
          userId,
          requirementId: null,
          requirementText: "Cross-application item must not export",
          category: "skill",
          priority: "core",
          jdSourceExcerpt: "Cross-application source",
          resumeCoverage: "missing",
          verifiedResumeExcerpt: null,
          sortOrder: 1,
          createdAt: "2026-08-22T00:01:00.000Z",
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-111111111111",
          runId: "bbbbbbbb-9999-4999-8999-999999999999",
          applicationId: "77777777-7777-4777-8777-777777777777",
          userId: otherUserId,
          requirementId: null,
          requirementText: "Other user's secret",
          category: "skill",
          priority: "core",
          jdSourceExcerpt: "Other user's source",
          resumeCoverage: "missing",
          verifiedResumeExcerpt: null,
          sortOrder: 0,
          createdAt: "2026-08-22T00:01:00.000Z",
        },
      ]),
      listJDStructureRuns: vi.fn().mockResolvedValue([
        {
          id: "10101010-1010-4010-8010-101010101010",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          provider: "deepseek",
          model: "deepseek-v4-flash",
          schemaVersion: "jd-analysis-v3",
          promptVersion: "jd-structure-v3.1",
          status: "succeeded",
          attemptCount: 1,
          result: {
            requirementCount: 1,
            criterionCount: 1,
            translationAvailable: true,
            providerRawBody: "RAW STRUCTURE PROVIDER BODY MUST NOT EXPORT",
          },
          errorCode: null,
          createdAt: "2026-08-26T00:00:00.000Z",
          updatedAt: "2026-08-26T00:01:00.000Z",
          startedAt: "2026-08-26T00:00:30.000Z",
          finishedAt: "2026-08-26T00:01:00.000Z",
          fullJdText: "FULL V3 JD MUST NOT EXPORT",
          inputHash: "f".repeat(64),
        },
        {
          id: "bbbbbbbb-1010-4010-8010-101010101010",
          userId: otherUserId,
          applicationId: "77777777-7777-4777-8777-777777777777",
          provider: "deepseek",
          model: "deepseek-v4-flash",
          schemaVersion: "jd-analysis-v3",
          promptVersion: "jd-structure-v3.1",
          status: "succeeded",
          attemptCount: 1,
          result: null,
          errorCode: null,
          createdAt: "2026-08-26T00:00:00.000Z",
          updatedAt: "2026-08-26T00:01:00.000Z",
          startedAt: null,
          finishedAt: null,
        },
      ]),
      listJDStructureRequirements: vi.fn().mockResolvedValue([
        {
          id: "10202020-2020-4020-8020-202020202020",
          runId: "10101010-1010-4010-8010-101010101010",
          applicationId: "33333333-3333-4333-8333-333333333333",
          userId,
          category: "skill",
          requirementType: "required",
          originalText: "Advanced SQL required",
          translationZh: "需要高级 SQL",
          sourceExcerpt: "Advanced SQL is required for this role.",
          allowsEquivalent: false,
          explicitGate: false,
          sortOrder: 0,
          createdAt: "2026-08-26T00:01:00.000Z",
        },
        {
          id: "bbbbbbbb-2020-4020-8020-202020202020",
          runId: "bbbbbbbb-1010-4010-8010-101010101010",
          applicationId: "77777777-7777-4777-8777-777777777777",
          userId: otherUserId,
          category: "skill",
          requirementType: "required",
          originalText: "Other V3 user secret",
          translationZh: "其他用户秘密",
          sourceExcerpt: "Other V3 user secret source.",
          allowsEquivalent: false,
          explicitGate: false,
          sortOrder: 0,
          createdAt: "2026-08-26T00:01:00.000Z",
        },
      ]),
      listJDStructureCriteria: vi.fn().mockResolvedValue([
        {
          id: "10303030-3030-4030-8030-303030303030",
          requirementId: "10202020-2020-4020-8020-202020202020",
          runId: "10101010-1010-4010-8010-101010101010",
          applicationId: "33333333-3333-4333-8333-333333333333",
          userId,
          groupKey: "g1",
          groupRule: "all",
          kind: "tool",
          originalText: "Advanced SQL",
          translationZh: "高级 SQL",
          constraint: { operator: "exact", value: "SQL", unit: null },
          sortOrder: 0,
          createdAt: "2026-08-26T00:01:00.000Z",
          signedUrl: "https://private.example/v3-criterion",
        },
      ]),
      listJDGapV3Runs: vi.fn().mockResolvedValue([
        {
          id: "10404040-4040-4040-8040-404040404040",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          structureRunId: "10101010-1010-4010-8010-101010101010",
          sourceAssetId: "11111111-1111-4111-8111-111111111111",
          sourceFilename: "resume.pdf",
          provider: "deepseek",
          model: "deepseek-v4-flash",
          schemaVersion: "resume-gap-v3",
          promptVersion: "jd-gap-p3-self-check-v1",
          policyVersion: "jd-gap-policy-v3.1",
          status: "succeeded",
          attemptCount: 1,
          result: {
            requirementCount: 1,
            criterionCount: 1,
            completeCount: 0,
            partialCount: 0,
            noneCount: 1,
            needsConfirmationCount: 0,
            providerRawBody: "RAW V3 PROVIDER BODY MUST NOT EXPORT",
          },
          errorCode: null,
          createdAt: "2026-08-26T00:02:00.000Z",
          updatedAt: "2026-08-26T00:03:00.000Z",
          startedAt: "2026-08-26T00:02:30.000Z",
          finishedAt: "2026-08-26T00:03:00.000Z",
          fullResumeText: "FULL V3 RESUME MUST NOT EXPORT",
          storagePath: "private/v3/resume.pdf",
        },
      ]),
      listJDGapV3RequirementResults: vi.fn().mockResolvedValue([
        {
          id: "10505050-5050-4050-8050-505050505050",
          runId: "10404040-4040-4040-8040-404040404040",
          requirementId: "10202020-2020-4020-8020-202020202020",
          applicationId: "33333333-3333-4333-8333-333333333333",
          userId,
          coverageStatus: "none",
          impactLevel: "important",
          coveredCriterionCount: 0,
          missingCriterionCount: 1,
          sortOrder: 0,
          createdAt: "2026-08-26T00:03:00.000Z",
        },
      ]),
      listJDGapV3Assessments: vi.fn().mockResolvedValue([
        {
          id: "10606060-6060-4060-8060-606060606060",
          runId: "10404040-4040-4040-8040-404040404040",
          criterionId: "10303030-3030-4030-8030-303030303030",
          requirementId: "10202020-2020-4020-8020-202020202020",
          applicationId: "33333333-3333-4333-8333-333333333333",
          userId,
          resumeEvidenceStatus: "partial_direct",
          verifiedResumeExcerpt: `Exact resume evidence ${"x".repeat(1100)}`,
          profileFactIds: [
            "22222222-2222-4222-8222-222222222222",
            "99999999-9999-4999-8999-999999999999",
          ],
          gapType: "missing_result_or_number",
          reasonZh: `缺少量化结果${"理".repeat(800)}`,
          userQuestionZh: `是否有可核实结果${"问".repeat(600)}`,
          createdAt: "2026-08-26T00:03:00.000Z",
          providerRawBody: "ASSESSMENT PROVIDER BODY MUST NOT EXPORT",
        },
      ]),
      listResumeSuggestions: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-2222-4222-8222-222222222222",
          applicationId: "33333333-3333-4333-8333-333333333333",
          content: "Improved checkout conversion by 18%.",
          facts: [],
          requirements: [],
        },
      ]),
      listResumeVersions: vi.fn().mockResolvedValue([
        {
          id: "aaaaaaaa-3333-4333-8333-333333333333",
          userId,
          applicationId: "33333333-3333-4333-8333-333333333333",
          versionNumber: 1,
          items: [
            {
              content: "Improved checkout conversion by 18%.",
              evidence: [],
            },
          ],
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
      "jd-gap-analysis-v3.json",
      "profile.json",
      "resume-gaps.json",
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
    const resumeGapsJson = await zip.file("resume-gaps.json")!.async("string");
    const jdGapV3Json = await zip.file("jd-gap-analysis-v3.json")!.async("string");
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
    expect(applicationsJson).toContain("Advanced SQL");
    expect(applicationsJson).toContain("resumeRuns");
    expect(applicationsJson).toContain("resumeSuggestions");
    expect(applicationsJson).toContain("resumeVersions");
    expect(applicationsJson).toContain("Improved checkout conversion by 18%.");
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
    const resumeGapsExport = JSON.parse(resumeGapsJson) as {
      schemaVersion: string;
      generatedAt: string;
      runs: Array<Record<string, unknown>>;
      items: Array<Record<string, unknown>>;
    };
    expect(resumeGapsExport.schemaVersion).toBe("resume-gap-history-v1");
    expect(resumeGapsExport.generatedAt).toMatch(/Z$/);
    expect(resumeGapsExport.runs).toHaveLength(3);
    expect(resumeGapsExport.runs[0]).toMatchObject({
      id: "aaaaaaaa-9999-4999-8999-999999999999",
      applicationId: "33333333-3333-4333-8333-333333333333",
      baselineAssetId: "11111111-1111-4111-8111-111111111111",
      sourceFilename: "resume.pdf",
      status: "succeeded",
      attemptCount: 1,
      provider: "deepseek",
      model: "deepseek-chat",
      counts: {
        acceptedItemCount: 1,
        coveredItemCount: 0,
        partialItemCount: 0,
        missingItemCount: 1,
      },
    });
    expect(resumeGapsExport.runs[0]).not.toHaveProperty("inputHash");
    expect(resumeGapsExport.runs[0]).not.toHaveProperty("result");
    expect(resumeGapsExport.runs[0]).not.toHaveProperty("errorMessage");
    expect(resumeGapsExport.runs[0]).not.toHaveProperty("errorStack");
    expect(resumeGapsExport.runs[0]).not.toHaveProperty("signedUrl");
    expect(resumeGapsExport.runs[0]).not.toHaveProperty("storageCredential");
    expect(
      resumeGapsExport.runs.find(
        (run) => run.id === "aaaaaaaa-9999-4999-8999-999999999998",
      )?.counts,
    ).toBeNull();
    expect(
      resumeGapsExport.runs.find(
        (run) => run.id === "aaaaaaaa-9999-4999-8999-999999999997",
      )?.counts,
    ).toBeNull();
    expect(resumeGapsExport.items).toHaveLength(1);
    expect(resumeGapsExport.items[0]).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-111111111111",
      runId: "aaaaaaaa-9999-4999-8999-999999999999",
      applicationId: "33333333-3333-4333-8333-333333333333",
      requirementId: "66666666-6666-4666-8666-666666666666",
      requirementText: "Advanced SQL",
      jdSourceExcerpt: "Use SQL for business analysis.",
      resumeCoverage: "missing",
      verifiedResumeExcerpt: null,
    });
    expect(resumeGapsJson).not.toContain("PARSED FULL RESUME MUST NOT EXPORT");
    expect(resumeGapsJson).not.toContain("RAW PROVIDER RESPONSE MUST NOT EXPORT");
    expect(resumeGapsJson).not.toContain("FULL ADDITIONAL JD MUST NOT EXPORT");
    expect(resumeGapsJson).not.toContain("PRIVATE STACK MUST NOT EXPORT");
    expect(resumeGapsJson).not.toContain("private.example");
    expect(resumeGapsJson).not.toContain("Other user's secret");
    expect(resumeGapsJson).not.toContain("Cross-application item must not export");
    const jdGapV3Export = JSON.parse(jdGapV3Json) as {
      schemaVersion: string;
      structureRuns: Array<Record<string, unknown>>;
      requirements: Array<Record<string, unknown>>;
      criteria: Array<Record<string, unknown>>;
      gapRuns: Array<Record<string, unknown>>;
      requirementResults: Array<Record<string, unknown>>;
      assessments: Array<{
        verifiedResumeExcerpt: string | null;
        reasonZh: string;
        userQuestionZh: string | null;
        profileFactIds: string[];
        [key: string]: unknown;
      }>;
    };
    expect(jdGapV3Export.schemaVersion).toBe("jd-gap-analysis-v3");
    expect(jdGapV3Export.structureRuns).toHaveLength(1);
    expect(jdGapV3Export.requirements).toHaveLength(1);
    expect(jdGapV3Export.criteria).toHaveLength(1);
    expect(jdGapV3Export.gapRuns).toHaveLength(1);
    expect(jdGapV3Export.requirementResults).toHaveLength(1);
    expect(jdGapV3Export.assessments).toHaveLength(1);
    expect(jdGapV3Export.structureRuns[0]).toMatchObject({
      id: "10101010-1010-4010-8010-101010101010",
      schemaVersion: "jd-analysis-v3",
      promptVersion: "jd-structure-v3.1",
      status: "succeeded",
      counts: { requirementCount: 1, criterionCount: 1 },
    });
    expect(jdGapV3Export.gapRuns[0]).toMatchObject({
      id: "10404040-4040-4040-8040-404040404040",
      structureRunId: "10101010-1010-4010-8010-101010101010",
      schemaVersion: "resume-gap-v3",
      promptVersion: "jd-gap-p3-self-check-v1",
      policyVersion: "jd-gap-policy-v3.1",
      status: "succeeded",
      counts: { requirementCount: 1, criterionCount: 1, noneCount: 1 },
    });
    expect(jdGapV3Export.assessments[0].verifiedResumeExcerpt?.length).toBeLessThanOrEqual(1000);
    expect(jdGapV3Export.assessments[0].reasonZh.length).toBeLessThanOrEqual(700);
    expect(jdGapV3Export.assessments[0].userQuestionZh?.length).toBeLessThanOrEqual(500);
    expect(jdGapV3Export.assessments[0].profileFactIds).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(jdGapV3Json).not.toContain("FULL V3 JD MUST NOT EXPORT");
    expect(jdGapV3Json).not.toContain("FULL V3 RESUME MUST NOT EXPORT");
    expect(jdGapV3Json).not.toContain("RAW V3 PROVIDER BODY MUST NOT EXPORT");
    expect(jdGapV3Json).not.toContain("ASSESSMENT PROVIDER BODY MUST NOT EXPORT");
    expect(jdGapV3Json).not.toContain("Other V3 user secret");
    expect(jdGapV3Json).not.toContain("private.example");
    expect(jdGapV3Json).not.toContain("storagePath");
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
