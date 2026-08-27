// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createJDGapV3Repository } from "./gap-repository";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "11111111-1111-4111-8111-111111111111";
const structureRunId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const requirementId = "55555555-5555-4555-8555-555555555555";
const criterionId = "66666666-6666-4666-8666-666666666666";
const factId = "77777777-7777-4777-8777-777777777777";
const timestamp = "2026-08-25T00:00:00.000Z";

const ai = {
  provider: "deepseek",
  model: "deepseek-chat",
  requestId: null,
  usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
  priceScheduleVersion: null,
};

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    application_id: applicationId,
    user_id: userId,
    structure_run_id: structureRunId,
    source_asset_id: assetId,
    source_filename: "resume.pdf",
    source_sha256: "a".repeat(64),
    fact_fingerprint: "b".repeat(64),
    input_hash: "c".repeat(64),
    provider: "deepseek",
    model: "deepseek-chat",
    schema_version: "resume-gap-v3",
    prompt_version: "jd-gap-v3",
    policy_version: "jd-gap-policy-v3",
    status: "succeeded",
    attempt_count: 1,
    result: {
      requirementCount: 1,
      criterionCount: 1,
      completeCount: 0,
      partialCount: 1,
      noneCount: 0,
      needsConfirmationCount: 0,
      ai,
      estimatedCost: null,
    },
    error_code: null,
    error_message: null,
    created_at: timestamp,
    updated_at: timestamp,
    started_at: timestamp,
    finished_at: timestamp,
    ...overrides,
  };
}

function requirementResultRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    run_id: runId,
    requirement_id: requirementId,
    application_id: applicationId,
    user_id: userId,
    coverage_status: "partial",
    impact_level: "important",
    covered_criterion_count: 0,
    missing_criterion_count: 1,
    sort_order: 0,
    created_at: timestamp,
    ...overrides,
  };
}

function assessmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    run_id: runId,
    criterion_id: criterionId,
    requirement_id: requirementId,
    application_id: applicationId,
    user_id: userId,
    resume_evidence_status: "partial_direct",
    verified_resume_excerpt: "Built reports with SQL.",
    profile_fact_ids: [factId],
    gap_type: "too_vague",
    reason_zh: "简历提到 SQL，但没有说明复杂查询能力。",
    user_question_zh: "你是否使用过窗口函数？",
    created_at: timestamp,
    ...overrides,
  };
}

const requirement = {
  id: requirementId,
  runId: structureRunId,
  applicationId,
  userId,
  category: "skill" as const,
  requirementType: "required" as const,
  originalText: "Advanced SQL",
  translationZh: "高级 SQL",
  sourceExcerpt: "Advanced SQL experience is required.",
  allowsEquivalent: false,
  explicitGate: false,
  sortOrder: 0,
  createdAt: timestamp,
  criteria: [{
    id: criterionId,
    requirementId,
    runId: structureRunId,
    applicationId,
    userId,
    groupKey: "g1",
    groupRule: "all" as const,
    kind: "tool" as const,
    originalText: "Advanced SQL",
    translationZh: "高级 SQL",
    constraint: { operator: "exact" as const, value: "SQL", unit: null },
    sortOrder: 0,
    createdAt: timestamp,
  }],
};

const structureRun = {
  id: structureRunId,
  applicationId,
  userId,
  jdSha256: "d".repeat(64),
  inputHash: "e".repeat(64),
  provider: "deepseek",
  model: "deepseek-chat",
  schemaVersion: "jd-analysis-v3",
  promptVersion: "jd-structure-v3",
  status: "succeeded" as const,
  attemptCount: 1,
  jdTranslationZh: "要求熟练使用 SQL。",
  result: {
    requirementCount: 1,
    criterionCount: 1,
    translationAvailable: true,
    ai,
    estimatedCost: null,
  },
  errorCode: null,
  errorMessage: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  startedAt: timestamp,
  finishedAt: timestamp,
};

const ownFact = {
  id: factId,
  factType: "work_experience" as const,
  title: "Data Analyst Intern",
  organization: "Example",
  description: "Built SQL reports.",
  skills: ["SQL"],
  sourceExcerpt: "Built SQL reports",
};

function query(result: { data: unknown; error?: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data: result.data, error: result.error ?? null });
  chain.then.mockImplementation((resolve) =>
    Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  );
  return chain;
}

function client(tableData: Record<string, unknown> = {}) {
  const queries = new Map<string, ReturnType<typeof query>[]>();
  const from = vi.fn((table: string) => {
    const chain = query({ data: tableData[table] ?? null });
    queries.set(table, [...(queries.get(table) ?? []), chain]);
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue({ data: runRow(), error: null });
  return { from, rpc, queries };
}

function dependencies(supabase: ReturnType<typeof client>) {
  const structures = {
    getOwned: vi.fn().mockResolvedValue(structureRun),
    listRequirementsWithCriteria: vi.fn().mockResolvedValue([requirement]),
  };
  const listFacts = vi.fn().mockResolvedValue([
    ownFact,
    { ...ownFact, id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", title: "Unreferenced fact" },
  ]);
  return {
    repository: createJDGapV3Repository(
      async () => supabase as never,
      structures,
      listFacts,
    ),
    structures,
    listFacts,
  };
}

describe("JD gap v3 repository", () => {
  it("calls every owner-safe RPC with exact parameter names", async () => {
    const supabase = client();
    const { repository } = dependencies(supabase);

    await repository.createOrGet({
      applicationId,
      structureRunId,
      sourceAssetId: assetId,
      factFingerprint: "b".repeat(64),
      inputHash: "c".repeat(64),
      provider: "deepseek",
      model: "deepseek-chat",
      schemaVersion: "resume-gap-v3",
      promptVersion: "jd-gap-v3",
      policyVersion: "jd-gap-policy-v3",
    });
    await repository.claim(runId, 0, "queued");
    await repository.complete({
      runId,
      expectedAttemptCount: 1,
      requirementResults: [{
        requirementId,
        coverageStatus: "partial",
        impactLevel: "important",
        coveredCriterionCount: 0,
        missingCriterionCount: 1,
        sourceOrder: 0,
      }],
      assessments: [{
        criterionId,
        requirementId,
        resumeEvidenceStatus: "partial_direct",
        resumeExcerpt: "Built reports with SQL.",
        profileFactIds: [factId],
        gapType: "too_vague",
        reasonZh: "简历提到 SQL，但没有说明复杂查询能力。",
        userQuestionZh: "你是否使用过窗口函数？",
      }],
      ai,
      estimatedCost: null,
    });
    await repository.fail({
      runId,
      expectedAttemptCount: 2,
      errorCode: "jd-gap-failed",
      errorMessage: "safe",
    });

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, "create_or_get_jd_gap_v3", {
      target_application_id: applicationId,
      target_structure_run_id: structureRunId,
      target_source_asset_id: assetId,
      target_fact_fingerprint: "b".repeat(64),
      target_input_hash: "c".repeat(64),
      target_provider: "deepseek",
      target_model: "deepseek-chat",
      target_schema_version: "resume-gap-v3",
      target_prompt_version: "jd-gap-v3",
      target_policy_version: "jd-gap-policy-v3",
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, "claim_jd_gap_v3", {
      target_run_id: runId,
      expected_attempt_count: 0,
      expected_status: "queued",
      target_lease_seconds: 120,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(3, "complete_jd_gap_v3", {
      target_run_id: runId,
      target_attempt_count: 1,
      target_requirement_results: [{
        requirementId,
        coverageStatus: "partial",
        impactLevel: "important",
        coveredCriterionCount: 0,
        missingCriterionCount: 1,
        sortOrder: 0,
      }],
      target_criterion_assessments: [{
        criterionId,
        requirementId,
        resumeEvidenceStatus: "partial_direct",
        verifiedResumeExcerpt: "Built reports with SQL.",
        profileFactIds: [factId],
        gapType: "too_vague",
        reasonZh: "简历提到 SQL，但没有说明复杂查询能力。",
        userQuestionZh: "你是否使用过窗口函数？",
      }],
      target_ai_metadata: ai,
      target_estimated_cost: null,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(4, "fail_jd_gap_v3", {
      target_run_id: runId,
      target_attempt_count: 2,
      target_error_code: "jd-gap-failed",
      target_error_message: "safe",
    });
  });

  it.each(["queued", "running", "succeeded", "failed"] as const)(
    "strictly maps the %s run status",
    async (status) => {
      const result = status === "succeeded" ? runRow() : runRow({
        status,
        attempt_count: status === "queued" ? 0 : 1,
        result: null,
        error_code: status === "failed" ? "safe-failure" : null,
        error_message: status === "failed" ? "safe" : null,
        started_at: status === "queued" ? null : timestamp,
        finished_at: status === "failed" ? timestamp : null,
      });
      const supabase = client({ jd_gap_v3_runs: result });
      const { repository } = dependencies(supabase);
      await expect(repository.getOwned(userId, runId)).resolves.toMatchObject({ status });
    },
  );

  it("uses owner filters and deterministic ordering for latest combination reads", async () => {
    const supabase = client({ jd_gap_v3_runs: runRow() });
    const { repository } = dependencies(supabase);
    await repository.getLatestForCombination(
      userId,
      applicationId,
      assetId,
      structureRunId,
      true,
    );
    const chain = supabase.queries.get("jd_gap_v3_runs")![0]!;
    expect(chain.eq).toHaveBeenCalledWith("user_id", userId);
    expect(chain.eq).toHaveBeenCalledWith("application_id", applicationId);
    expect(chain.eq).toHaveBeenCalledWith("source_asset_id", assetId);
    expect(chain.eq).toHaveBeenCalledWith("structure_run_id", structureRunId);
    expect(chain.eq).toHaveBeenCalledWith("status", "succeeded");
    expect(chain.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("builds an owner-safe latest view and resolves only allowlisted confirmed facts", async () => {
    const supabase = client({
      jd_gap_v3_runs: runRow(),
      jd_gap_v3_requirement_results: [requirementResultRow()],
      jd_gap_v3_criterion_assessments: [assessmentRow()],
    });
    const { repository, structures, listFacts } = dependencies(supabase);
    const view = await repository.listLatestView(userId, applicationId);

    expect(view?.run.id).toBe(runId);
    expect(view?.requirements[0]?.result).toMatchObject({ coverageStatus: "partial" });
    expect(view?.requirements[0]?.criteria[0]?.assessment).toMatchObject({
      resumeEvidenceStatus: "partial_direct",
      profileFacts: [ownFact],
    });
    expect(structures.getOwned).toHaveBeenCalledWith(userId, structureRunId);
    expect(structures.listRequirementsWithCriteria).toHaveBeenCalledWith(userId, structureRunId);
    expect(listFacts).toHaveBeenCalledWith(userId);
    expect(JSON.stringify(view)).not.toContain("Unreferenced fact");

    for (const table of ["jd_gap_v3_runs", "jd_gap_v3_requirement_results", "jd_gap_v3_criterion_assessments"]) {
      for (const chain of supabase.queries.get(table) ?? []) {
        expect(chain.eq).toHaveBeenCalledWith("user_id", userId);
      }
    }
  });

  it("maps every assessment and requirement result enum without coercion", async () => {
    const assessmentStatuses = ["direct", "partial_direct", "none", "needs_confirmation"] as const;
    const gapTypes = [
      "none",
      "too_vague",
      "missing_from_resume",
      "language_or_authorization_confirmation",
    ] as const;
    const coverageStatuses = ["complete", "partial", "none", "needs_confirmation"] as const;
    const impacts = ["blocking", "important", "minor", "important"] as const;
    const supabase = client({
      jd_gap_v3_runs: runRow(),
      jd_gap_v3_requirement_results: coverageStatuses.map((coverage, index) =>
        requirementResultRow({
          id: `${index + 1}8888888-8888-4888-8888-888888888888`,
          coverage_status: coverage,
          impact_level: impacts[index],
          sort_order: index,
        }),
      ),
      jd_gap_v3_criterion_assessments: assessmentStatuses.map((status, index) =>
        assessmentRow({
          id: `${index + 1}9999999-9999-4999-8999-999999999999`,
          resume_evidence_status: status,
          verified_resume_excerpt: status === "direct" || status === "partial_direct"
            ? "Built reports with SQL."
            : null,
          gap_type: gapTypes[index],
        }),
      ),
    });
    const { repository } = dependencies(supabase);
    const view = await repository.listView(userId, runId);
    expect(view?.requirementResults.map((item) => item.coverageStatus)).toEqual(coverageStatuses);
    expect(view?.assessments.map((item) => item.resumeEvidenceStatus)).toEqual(assessmentStatuses);
  });

  it("rejects malformed stored metadata containing source resume content", async () => {
    const supabase = client({
      jd_gap_v3_runs: runRow({ result: { ...runRow().result as object, resumeText: "private resume" } }),
    });
    const { repository } = dependencies(supabase);
    await expect(repository.getOwned(userId, runId)).rejects.toMatchObject({
      code: "invalid-stored-jd-gap-v3",
    });
  });
});
