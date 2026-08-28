// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AIPriceSchedule } from "@/features/ai/pricing";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import type { SourceAsset } from "@/features/source-assets/repository";

import { createResumeJDDifferenceService } from "./service";
import type { ResumeJDDifferenceRun } from "./repository";
import type { ResumeJDDifferenceOutput } from "./schemas";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const factId = "44444444-4444-4444-8444-444444444444";
const unknownFactId = "55555555-5555-4555-8555-555555555555";
const timestamp = "2026-08-28T10:00:00.000Z";
const jdText = [
  "Collaborate with business stakeholders to align reporting needs.",
  "German C1 is required.",
  "Tableau experience is preferred.",
].join("\n");
const resumeText =
  "Worked with business teams on weekly reports and gathered reporting needs from them.";

const asset: SourceAsset = {
  id: assetId,
  userId,
  originalName: "resume.pdf",
  contentType: "application/pdf",
  storagePath: `${userId}/${assetId}/source.pdf`,
  sizeBytes: 128,
  sha256: "a".repeat(64),
  duplicateOfId: null,
  status: "ready",
  errorCode: null,
  createdAt: timestamp,
};

const facts: ConfirmedFactForAnalysis[] = [
  {
    id: factId,
    factType: "work_experience",
    title: "Data Analyst Intern",
    organization: "Example",
    description: "Gathered reporting needs from business teams.",
    skills: ["Reporting"],
    sourceExcerpt: "gathered reporting needs",
  },
];

const output: ResumeJDDifferenceOutput = {
  jobCore: {
    missionZh: "通过跨团队协作明确报告需求。",
    coreCapabilities: ["相关方协作", "报告需求分析", "德语沟通"],
    concepts: [
      {
        id: "concept-1",
        labelZh: "相关方协作",
        originalTerms: ["business stakeholders", "reporting needs"],
        importanceReasonZh: "出现在岗位核心职责中。",
        priority: "critical",
      },
    ],
    gates: [
      {
        id: "gate-1",
        originalText: "German C1 is required.",
        translationZh: "要求德语 C1。",
        reasonZh: "这是明确资格门槛。",
      },
    ],
    preferredItems: [
      {
        id: "preferred-1",
        originalText: "Tableau experience is preferred.",
        translationZh: "有 Tableau 经验更佳。",
        reasonZh: "JD 明确列为加分项。",
      },
    ],
  },
  overallDifference: {
    summaryZh: "简历有相邻的业务协作经历，但岗位语言和德语等级证据仍不完整。",
    topIssueIds: ["issue-1", "issue-2"],
  },
  issues: [
    {
      id: "issue-1",
      conceptId: "concept-1",
      jdOriginal:
        "Collaborate with business stakeholders to align reporting needs.",
      jdTranslationZh: "与业务相关方协作并对齐报告需求。",
      resumeExcerpt:
        "Worked with business teams on weekly reports and gathered reporting needs from them.",
      resumeStatusZh: "简历描述了与业务团队确认报告需求的经历。",
      profileFactIds: [factId],
      type: "language_misaligned",
      problemZh: "职责相近，但没有使用岗位常用的相关方语言。",
      reasonZh: "行为证据相邻，表达仍可更贴近 JD。",
      priority: "critical",
      isGate: false,
      authenticity: "supported",
    },
    {
      id: "issue-2",
      conceptId: null,
      jdOriginal: "German C1 is required.",
      jdTranslationZh: "要求德语 C1。",
      resumeExcerpt: null,
      resumeStatusZh: "当前材料未找到相关证据",
      profileFactIds: [],
      type: "gate",
      problemZh: "当前材料没有可核验的德语 C1 证据。",
      reasonZh: "语言等级必须严格核验。",
      priority: "critical",
      isGate: true,
      authenticity: "unsupported",
    },
  ],
  matched: [],
  directions: [
    {
      id: "direction-1",
      issueId: "issue-1",
      targetSection: "experience",
      targetExperienceZh: "业务报告经历",
      conceptId: "concept-1",
      jdTerms: ["business stakeholders", "reporting needs"],
      focusAreas: ["action", "stakeholders", "context"],
      synonymousJobLanguage: ["business stakeholders"],
      authenticity: "supported",
      needsConfirmation: false,
      directionZh: "核对真实协作对象，并说明需求确认发生在哪个报告场景。",
    },
  ],
};

function queuedRun(overrides: Partial<ResumeJDDifferenceRun> = {}): ResumeJDDifferenceRun {
  return {
    id: runId,
    applicationId,
    userId,
    sourceAssetId: assetId,
    sourceFilename: asset.originalName,
    sourceSha256: asset.sha256,
    jdSha256: "b".repeat(64),
    factFingerprint: "c".repeat(64),
    inputHash: "d".repeat(64),
    provider: "deepseek",
    model: "deepseek-v4-flash",
    schemaVersion: "resume-jd-difference-v4",
    promptVersion: "resume-jd-difference-p1-v4.0",
    policyVersion: "resume-jd-difference-policy-v4.0",
    status: "queued",
    attemptCount: 0,
    result: null,
    aiUsage: null,
    estimatedCostUsd: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function succeededRun(result = output): ResumeJDDifferenceRun {
  return queuedRun({
    status: "succeeded",
    attemptCount: 1,
    result,
    aiUsage: {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "req-1",
      usage: {
        inputCacheHitTokens: 0,
        inputCacheMissTokens: 100,
        outputTokens: 200,
      },
      priceScheduleVersion: null,
    },
    startedAt: timestamp,
    completedAt: timestamp,
  });
}

function fakes() {
  const queued = queuedRun();
  const running = queuedRun({
    status: "running",
    attemptCount: 1,
    startedAt: timestamp,
  });
  const aiProvider = {
    analyzeResumeJDDifference: vi.fn().mockResolvedValue({
      data: structuredClone(output),
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "req-1",
      usage: {
        inputCacheHitTokens: 0,
        inputCacheMissTokens: 100,
        outputTokens: 200,
      },
    }),
  };
  const runs = {
    createOrGet: vi.fn().mockResolvedValue(queued),
    claim: vi.fn().mockResolvedValue(true),
    getOwned: vi.fn().mockResolvedValue(running),
    complete: vi.fn().mockImplementation(async (input: { result: ResumeJDDifferenceOutput }) =>
      succeededRun(input.result),
    ),
    fail: vi.fn().mockImplementation(
      async (input: { errorCode: string; errorMessage: string }) =>
        queuedRun({
          status: "failed",
          attemptCount: 1,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          startedAt: timestamp,
          completedAt: timestamp,
        }),
    ),
  };
  return {
    runs,
    storage: {
      download: vi.fn().mockResolvedValue(new Blob(["resume bytes"])),
    },
    parser: vi.fn().mockResolvedValue(resumeText),
    aiProvider,
    providerFactory: vi.fn().mockReturnValue(aiProvider),
    provider: "deepseek",
    model: "deepseek-v4-flash",
    promptVariant: "p1" as const,
    priceSchedule: undefined as AIPriceSchedule | undefined,
    clock: () => new Date(timestamp),
    logger: { info: vi.fn(), error: vi.fn() },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    applicationId,
    jdText,
    asset,
    confirmedFacts: facts,
    ...overrides,
  };
}

describe("resume JD difference service", () => {
  it("reuses the same succeeded input without download or provider construction", async () => {
    const dependencies = fakes();
    dependencies.runs.createOrGet.mockResolvedValueOnce(succeededRun());

    const result = await createResumeJDDifferenceService(dependencies).run(input());

    expect(result).toMatchObject({ reused: true, run: { status: "succeeded" } });
    expect(dependencies.runs.claim).not.toHaveBeenCalled();
    expect(dependencies.storage.download).not.toHaveBeenCalled();
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
  });

  it("creates a stable run and performs exactly one model call for new input", async () => {
    const dependencies = fakes();

    const result = await createResumeJDDifferenceService(dependencies).run(
      input({ ocrText: resumeText }),
    );

    expect(result.reused).toBe(false);
    expect(dependencies.runs.createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId,
        sourceAssetId: assetId,
        sourceFilename: "resume.pdf",
        sourceSha256: "a".repeat(64),
        provider: "deepseek",
        model: "deepseek-v4-flash",
        schemaVersion: "resume-jd-difference-v4",
        promptVersion: "resume-jd-difference-p1-v4.1",
        policyVersion: "resume-jd-difference-policy-v4.0",
        jdSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        factFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
        inputHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    );
    expect(dependencies.aiProvider.analyzeResumeJDDifference).toHaveBeenCalledTimes(1);
    expect(dependencies.runs.complete).toHaveBeenCalledTimes(1);
  });

  it("passes normalized JD, resume, and only confirmed facts to the provider", async () => {
    const dependencies = fakes();
    const pendingFact = {
      ...facts[0],
      id: unknownFactId,
      confirmationStatus: "pending",
    };

    await createResumeJDDifferenceService(dependencies).run(
      input({
        jdText: `  ${jdText.replaceAll("\n", "  \n")}`,
        ocrText: `  ${resumeText}  `,
        confirmedFacts: [
          { ...facts[0], confirmationStatus: "confirmed" },
          pendingFact,
        ],
      }),
    );

    expect(dependencies.aiProvider.analyzeResumeJDDifference).toHaveBeenCalledWith(
      { jdText, resumeText, confirmedFacts: [{ ...facts[0], confirmationStatus: "confirmed" }] },
      { promptVariant: "p1" },
    );
  });

  it.each([
    ["PDF", "application/pdf"],
    [
      "DOCX",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  ] as const)("downloads and parses the selected %s resume", async (_label, contentType) => {
    const dependencies = fakes();
    const bytes = Buffer.from("private resume bytes");
    dependencies.storage.download.mockResolvedValueOnce(new Blob([bytes]));

    await createResumeJDDifferenceService(dependencies).run(
      input({ asset: { ...asset, contentType } }),
    );

    expect(dependencies.storage.download).toHaveBeenCalledWith(asset.storagePath);
    expect(dependencies.parser).toHaveBeenCalledWith(bytes, contentType);
  });

  it("uses validated OCR text without reading storage", async () => {
    const dependencies = fakes();

    await createResumeJDDifferenceService(dependencies).run(
      input({ ocrText: resumeText }),
    );

    expect(dependencies.storage.download).not.toHaveBeenCalled();
    expect(dependencies.parser).not.toHaveBeenCalled();
  });

  it.each([
    ["short text", new Error("resume-text-too-short"), "resume-text-insufficient"],
    ["private parser body", new Error("parser leaked private text"), "resume-parse-failed"],
  ] as const)("fails %s before constructing a provider", async (_label, error, code) => {
    const dependencies = fakes();
    dependencies.parser.mockRejectedValueOnce(error);

    const result = await createResumeJDDifferenceService(dependencies).run(input());

    expect(result.run).toMatchObject({ status: "failed", errorCode: code });
    expect(result.run.errorMessage).not.toContain(error.message);
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
    expect(dependencies.runs.complete).not.toHaveBeenCalled();
  });

  it("rejects a JD quotation that cannot be found and publishes no partial result", async () => {
    const dependencies = fakes();
    const invalid = structuredClone(output);
    invalid.issues[0].jdOriginal = "A requirement that is not in this JD.";
    dependencies.aiProvider.analyzeResumeJDDifference.mockResolvedValueOnce({
      data: invalid,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "req-1",
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 100, outputTokens: 200 },
    });

    const result = await createResumeJDDifferenceService(dependencies).run(
      input({ ocrText: resumeText }),
    );

    expect(result.run.errorCode).toBe("resume-jd-difference-evidence-invalid");
    expect(dependencies.runs.complete).not.toHaveBeenCalled();
    expect(dependencies.aiProvider.analyzeResumeJDDifference).toHaveBeenCalledTimes(1);
  });

  it("removes unverifiable resume and fact evidence and downgrades related advice", async () => {
    const dependencies = fakes();
    const invalid = structuredClone(output);
    invalid.issues[0].resumeExcerpt = "Invented resume sentence.";
    invalid.issues[0].profileFactIds = [unknownFactId];
    dependencies.aiProvider.analyzeResumeJDDifference.mockResolvedValueOnce({
      data: invalid,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: "req-1",
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 100, outputTokens: 200 },
    });

    await createResumeJDDifferenceService(dependencies).run(
      input({ ocrText: resumeText }),
    );

    const published = dependencies.runs.complete.mock.calls[0][0].result;
    expect(published.issues[0]).toMatchObject({
      resumeExcerpt: null,
      profileFactIds: [],
      type: "missing",
      authenticity: "unsupported",
      resumeStatusZh: "当前材料未找到相关证据",
    });
    expect(published.directions[0]).toMatchObject({
      synonymousJobLanguage: [],
      authenticity: "unsupported",
      needsConfirmation: true,
    });
  });

  it("does not treat strict AWS and Azure values as equivalent", async () => {
    const dependencies = fakes();
    const strictJD = `${jdText}\nHands-on AWS experience is required.`;
    const strictResume = `${resumeText} Used Azure for cloud deployment.`;
    const invalid = structuredClone(output);
    invalid.jobCore.concepts[0] = {
      ...invalid.jobCore.concepts[0],
      labelZh: "云平台工具",
      originalTerms: ["AWS"],
    };
    invalid.issues[0] = {
      ...invalid.issues[0],
      jdOriginal: "Hands-on AWS experience is required.",
      jdTranslationZh: "要求 AWS 实践经验。",
      resumeExcerpt: "Used Azure for cloud deployment.",
      type: "language_misaligned",
      authenticity: "supported",
    };
    invalid.directions[0] = {
      ...invalid.directions[0],
      jdTerms: ["AWS"],
      synonymousJobLanguage: ["AWS"],
    };
    dependencies.aiProvider.analyzeResumeJDDifference.mockResolvedValueOnce({
      data: invalid,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: null,
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 100, outputTokens: 200 },
    });

    await createResumeJDDifferenceService(dependencies).run(
      input({ jdText: strictJD, ocrText: strictResume }),
    );

    const published = dependencies.runs.complete.mock.calls[0][0].result;
    expect(published.issues[0]).toMatchObject({
      resumeExcerpt: "Used Azure for cloud deployment.",
      type: "missing",
      authenticity: "unsupported",
    });
    expect(published.directions[0]).toMatchObject({
      synonymousJobLanguage: [],
      authenticity: "unsupported",
      needsConfirmation: true,
    });
  });

  it("rejects paste-ready rewrite directions without a second paid attempt", async () => {
    const dependencies = fakes();
    const invalid = structuredClone(output);
    invalid.directions[0].directionZh =
      "Collaborated with business stakeholders to align reporting needs and delivered weekly dashboards.";
    dependencies.aiProvider.analyzeResumeJDDifference.mockResolvedValueOnce({
      data: invalid,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      requestId: null,
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 100, outputTokens: 200 },
    });

    const result = await createResumeJDDifferenceService(dependencies).run(
      input({ ocrText: resumeText }),
    );

    expect(result.run.errorCode).toBe("resume-jd-difference-invalid-output");
    expect(dependencies.aiProvider.analyzeResumeJDDifference).toHaveBeenCalledTimes(1);
    expect(dependencies.runs.complete).not.toHaveBeenCalled();
    expect(dependencies.runs.fail).toHaveBeenCalledTimes(1);
  });

  it("persists token usage and configured cost but logs no source content", async () => {
    const dependencies = fakes();
    dependencies.priceSchedule = {
      version: "deepseek-2026-08",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      currency: "USD",
      observedAt: "2026-08-14T00:00:00.000Z",
      sourceUrl: "https://example.com/pricing",
      effectiveFrom: "2026-08-16T16:00:00.000Z",
      effectiveUntil: null,
      defaultRates: {
        inputCacheHitPerMillion: 0.01,
        inputCacheMissPerMillion: 0.14,
        outputPerMillion: 0.28,
      },
      peak: null,
    };

    await createResumeJDDifferenceService(dependencies).run(
      input({ ocrText: resumeText }),
    );

    expect(dependencies.runs.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        aiUsage: expect.objectContaining({
          usage: {
            inputCacheHitTokens: 0,
            inputCacheMissTokens: 100,
            outputTokens: 200,
          },
          priceScheduleVersion: "deepseek-2026-08",
        }),
        estimatedCostUsd: expect.closeTo(0.00007, 10),
      }),
    );
    const logs = JSON.stringify({
      info: dependencies.logger.info.mock.calls,
      error: dependencies.logger.error.mock.calls,
    });
    expect(logs).toContain(runId);
    expect(logs).toContain("inputCacheMissTokens");
    expect(logs).not.toContain(jdText);
    expect(logs).not.toContain(resumeText);
  });

  it("deduplicates an interleaved claim without constructing a provider", async () => {
    const dependencies = fakes();
    dependencies.runs.claim.mockResolvedValueOnce(false);
    dependencies.runs.getOwned.mockResolvedValueOnce(
      queuedRun({ status: "running", attemptCount: 1, startedAt: timestamp }),
    );

    const result = await createResumeJDDifferenceService(dependencies).run(input());

    expect(result.reused).toBe(true);
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
    expect(dependencies.storage.download).not.toHaveBeenCalled();
  });

  it.each([
    ["asset owner", { asset: { ...asset, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
    ["asset state", { asset: { ...asset, status: "failed" } }],
  ] as const)("rejects invalid %s before run creation", async (_label, change) => {
    const dependencies = fakes();

    await expect(
      createResumeJDDifferenceService(dependencies).run(input(change)),
    ).rejects.toThrow("application-or-resume-not-found");
    expect(dependencies.runs.createOrGet).not.toHaveBeenCalled();
    expect(dependencies.providerFactory).not.toHaveBeenCalled();
  });
});
