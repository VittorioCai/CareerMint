// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  ResumeJDDifferenceRepositoryError,
  createResumeJDDifferenceRepository,
} from "./repository";
import type { ResumeJDDifferenceOutput } from "./schemas";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-08-28T00:00:00.000Z";

const result: ResumeJDDifferenceOutput = {
  jobCore: {
    missionZh: "通过数据分析支持业务决策。",
    coreCapabilities: ["业务分析", "数据分析", "跨团队协作"],
    concepts: [
      {
        id: "concept-1",
        labelZh: "业务协作",
        originalTerms: ["business stakeholders"],
        importanceReasonZh: "岗位核心职责直接要求。",
        priority: "critical",
      },
    ],
    gates: [],
    preferredItems: [],
  },
  overallDifference: {
    summaryZh: "简历存在相近经历，但岗位语言较弱。",
    topIssueIds: ["issue-1"],
  },
  issues: [
    {
      id: "issue-1",
      conceptId: "concept-1",
      jdOriginal: "Collaborate with business stakeholders.",
      jdTranslationZh: "与业务相关方协作。",
      resumeExcerpt: "Worked with business teams.",
      resumeStatusZh: "简历有相近协作经历。",
      profileFactIds: [],
      type: "language_misaligned",
      problemZh: "岗位语言未对齐。",
      reasonZh: "职责相近但表达较弱。",
      priority: "critical",
      isGate: false,
      authenticity: "supported",
    },
  ],
  matched: [],
  directions: [
    {
      id: "direction-1",
      issueId: "issue-1",
      targetSection: "experience",
      targetExperienceZh: "业务协作经历",
      conceptId: "concept-1",
      jdTerms: ["business stakeholders"],
      focusAreas: ["action", "stakeholders"],
      synonymousJobLanguage: ["business stakeholders"],
      authenticity: "supported",
      needsConfirmation: false,
      directionZh: "补充真实的协作对象和需求确认过程。",
    },
  ],
};

const aiUsage = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  requestId: null,
  usage: {
    inputCacheHitTokens: 1,
    inputCacheMissTokens: 2,
    outputTokens: 3,
  },
  priceScheduleVersion: null,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    application_id: applicationId,
    user_id: userId,
    source_asset_id: assetId,
    source_filename: "resume.pdf",
    source_sha256: "a".repeat(64),
    jd_sha256: "b".repeat(64),
    fact_fingerprint: "c".repeat(64),
    input_hash: "d".repeat(64),
    provider: "deepseek",
    model: "deepseek-v4-flash",
    schema_version: "resume-jd-difference-v4",
    prompt_version: "resume-jd-difference-p1-v4.0",
    policy_version: "resume-jd-difference-policy-v4.0",
    status: "succeeded",
    attempt_count: 1,
    result,
    ai_usage: aiUsage,
    estimated_cost_usd: 0.001,
    error_code: null,
    error_message: null,
    started_at: timestamp,
    completed_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function query(response: { data: unknown; error?: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({
    data: response.data,
    error: response.error ?? null,
  });
  return chain;
}

function client(queryRows: unknown[] = []) {
  let queryIndex = 0;
  const queries: ReturnType<typeof query>[] = [];
  const from = vi.fn(() => {
    const chain = query({ data: queryRows[queryIndex++] ?? null });
    queries.push(chain);
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue({ data: row(), error: null });
  return { from, rpc, queries };
}

function repository(supabase: ReturnType<typeof client>) {
  return createResumeJDDifferenceRepository(async () => supabase as never);
}

describe("resume JD difference repository", () => {
  it("calls owner-safe RPCs with exact parameters", async () => {
    const supabase = client();
    const runs = repository(supabase);

    await runs.createOrGet({
      applicationId,
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
    });
    await runs.claim(runId, 0, "queued");
    await runs.complete({
      runId,
      expectedAttemptCount: 1,
      result,
      aiUsage,
      estimatedCostUsd: 0.001,
    });
    await runs.fail({
      runId,
      expectedAttemptCount: 2,
      errorCode: "ai-timeout",
      errorMessage: "safe timeout",
    });

    expect(supabase.rpc).toHaveBeenNthCalledWith(
      1,
      "create_or_get_resume_jd_difference",
      {
        target_application_id: applicationId,
        target_source_asset_id: assetId,
        target_source_filename: "resume.pdf",
        target_source_sha256: "a".repeat(64),
        target_jd_sha256: "b".repeat(64),
        target_fact_fingerprint: "c".repeat(64),
        target_input_hash: "d".repeat(64),
        target_provider: "deepseek",
        target_model: "deepseek-v4-flash",
        target_schema_version: "resume-jd-difference-v4",
        target_prompt_version: "resume-jd-difference-p1-v4.0",
        target_policy_version: "resume-jd-difference-policy-v4.0",
      },
    );
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      "claim_resume_jd_difference",
      {
        target_run_id: runId,
        expected_attempt_count: 0,
        expected_status: "queued",
        stale_after_seconds: 120,
      },
    );
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      3,
      "complete_resume_jd_difference",
      {
        target_run_id: runId,
        expected_attempt_count: 1,
        target_result: result,
        target_ai_usage: aiUsage,
        target_estimated_cost_usd: 0.001,
      },
    );
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      4,
      "fail_resume_jd_difference",
      {
        target_run_id: runId,
        expected_attempt_count: 2,
        target_error_code: "ai-timeout",
        target_error_message: "safe timeout",
      },
    );
  });

  it("maps and validates an atomic succeeded run", async () => {
    const runs = repository(client([row()]));

    await expect(runs.getOwned(userId, runId)).resolves.toMatchObject({
      id: runId,
      status: "succeeded",
      result,
      aiUsage,
    });
  });

  it("rejects malformed stored JSON", async () => {
    const runs = repository(client([row({ result: { issues: [] } })]));

    await expect(runs.getOwned(userId, runId)).rejects.toEqual(
      new ResumeJDDifferenceRepositoryError(
        "invalid-stored-resume-jd-difference",
      ),
    );
  });

  it("returns a current succeeded run without a duplicate previous result", async () => {
    const current = row();
    const runs = repository(client([current, current]));

    await expect(
      runs.getView(userId, applicationId, "d".repeat(64)),
    ).resolves.toMatchObject({
      current: { id: runId, status: "succeeded" },
      previousSucceeded: null,
      freshness: "current",
    });
  });

  it("keeps an older success separate while the current input is running", async () => {
    const running = row({
      id: "44444444-4444-4444-8444-444444444444",
      status: "running",
      attempt_count: 2,
      result: null,
      ai_usage: null,
      estimated_cost_usd: null,
      completed_at: null,
    });
    const previous = row({ input_hash: "e".repeat(64) });
    const runs = repository(client([running, previous]));

    await expect(
      runs.getView(userId, applicationId, "d".repeat(64)),
    ).resolves.toMatchObject({
      current: { id: running.id, status: "running" },
      previousSucceeded: { id: runId, status: "succeeded" },
      freshness: "current",
    });
  });

  it("marks a previous success stale when inputs change", async () => {
    const previous = row({ input_hash: "e".repeat(64) });
    const runs = repository(client([previous, previous]));

    await expect(
      runs.getView(userId, applicationId, "f".repeat(64)),
    ).resolves.toMatchObject({
      current: null,
      previousSucceeded: { id: runId },
      freshness: "stale",
    });
  });

  it("uses owner filters and deterministic ordering", async () => {
    const supabase = client([row()]);
    const runs = repository(supabase);

    await runs.getLatest(userId, applicationId);

    expect(supabase.queries[0]!.eq).toHaveBeenCalledWith("user_id", userId);
    expect(supabase.queries[0]!.eq).toHaveBeenCalledWith(
      "application_id",
      applicationId,
    );
    expect(supabase.queries[0]!.order).toHaveBeenNthCalledWith(
      1,
      "created_at",
      { ascending: false },
    );
    expect(supabase.queries[0]!.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: false,
    });
  });
});
