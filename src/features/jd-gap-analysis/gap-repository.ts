import "server-only";

import { z } from "zod";

import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import {
  jdStructureRepository,
  type JDStructureRequirementRecord,
  type JDStructureRun,
} from "./structure-repository";
import {
  aiMetadataSchema,
  coverageStatusSchema,
  criterionEvidenceStatusSchema,
  estimatedCostSchema,
  gapTypeSchema,
  impactLevelSchema,
  processingRunStatusSchema,
  type AIMetadata,
  type EstimatedCost,
  type JDGapCriterionAssessment,
  type JDGapRequirementResult,
} from "./schemas";

type GapRunRow = Database["public"]["Tables"]["jd_gap_v3_runs"]["Row"];
type RequirementResultRow = Database["public"]["Tables"]["jd_gap_v3_requirement_results"]["Row"];
type AssessmentRow = Database["public"]["Tables"]["jd_gap_v3_criterion_assessments"]["Row"];
type SupabaseFactory = typeof createClient;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const timestampSchema = z.iso.datetime({ offset: true });

const gapRunResultSchema = z
  .object({
    requirementCount: z.number().int().min(0).max(80),
    criterionCount: z.number().int().min(0).max(960),
    completeCount: z.number().int().min(0).max(80),
    partialCount: z.number().int().min(0).max(80),
    noneCount: z.number().int().min(0).max(80),
    needsConfirmationCount: z.number().int().min(0).max(80),
    ai: aiMetadataSchema,
    estimatedCost: estimatedCostSchema.nullable(),
  })
  .strict();

const gapRunSchema = z
  .object({
    id: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    structureRunId: z.uuid(),
    sourceAssetId: z.uuid().nullable(),
    sourceFilename: z.string().trim().min(1).max(260),
    sourceSha256: sha256Schema,
    factFingerprint: sha256Schema,
    inputHash: sha256Schema,
    provider: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(160),
    schemaVersion: z.string().trim().min(1).max(80),
    promptVersion: z.string().trim().min(1).max(80),
    policyVersion: z.string().trim().min(1).max(80),
    status: processingRunStatusSchema,
    attemptCount: z.number().int().min(0).max(1000),
    result: gapRunResultSchema.nullable(),
    errorCode: z.string().trim().min(1).max(120).nullable(),
    errorMessage: z.string().trim().min(1).max(500).nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    finishedAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((run, context) => {
    if ((run.status === "succeeded") !== (run.result !== null)) {
      context.addIssue({ code: "custom", message: "Invalid gap run result state." });
    }
    const failed = run.status === "failed";
    if (failed !== (run.errorCode !== null && run.errorMessage !== null)) {
      context.addIssue({ code: "custom", message: "Invalid gap run error state." });
    }
  });

const storedRequirementResultSchema = z
  .object({
    id: z.uuid(),
    runId: z.uuid(),
    requirementId: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    coverageStatus: coverageStatusSchema,
    impactLevel: impactLevelSchema,
    coveredCriterionCount: z.number().int().min(0).max(12),
    missingCriterionCount: z.number().int().min(0).max(12),
    sourceOrder: z.number().int().min(0).max(79),
    createdAt: timestampSchema,
  })
  .strict();

const storedAssessmentSchema = z
  .object({
    id: z.uuid(),
    runId: z.uuid(),
    criterionId: z.uuid(),
    requirementId: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    resumeEvidenceStatus: criterionEvidenceStatusSchema,
    resumeExcerpt: z.string().trim().min(1).max(1000).nullable(),
    profileFactIds: z.array(z.uuid()).max(5),
    gapType: gapTypeSchema,
    reasonZh: z.string().trim().min(1).max(700),
    userQuestionZh: z.string().trim().min(1).max(500).nullable(),
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((assessment, context) => {
    const needsExcerpt = assessment.resumeEvidenceStatus === "direct" ||
      assessment.resumeEvidenceStatus === "partial_direct";
    if (needsExcerpt !== (assessment.resumeExcerpt !== null)) {
      context.addIssue({ code: "custom", message: "Invalid assessment excerpt state." });
    }
  });

export type JDGapV3Run = z.infer<typeof gapRunSchema>;
export type JDGapV3RequirementResultRecord = z.infer<typeof storedRequirementResultSchema>;
export type JDGapV3AssessmentRecord = z.infer<typeof storedAssessmentSchema>;
export type JDGapAssessmentForPersistence = JDGapCriterionAssessment & {
  requirementId: string;
};
export type JDGapV3AssessmentView = JDGapV3AssessmentRecord & {
  profileFacts: ConfirmedFactForAnalysis[];
};
export type JDGapV3View = {
  run: JDGapV3Run;
  structureRun: JDStructureRun;
  requirementResults: JDGapV3RequirementResultRecord[];
  assessments: JDGapV3AssessmentView[];
  confirmedFacts: ConfirmedFactForAnalysis[];
  requirements: Array<Omit<JDStructureRequirementRecord, "criteria"> & {
    result: JDGapV3RequirementResultRecord | null;
    criteria: Array<JDStructureRequirementRecord["criteria"][number] & {
      assessment: JDGapV3AssessmentView | null;
    }>;
  }>;
};

type StructureReader = Pick<
  typeof jdStructureRepository,
  "getOwned" | "listRequirementsWithCriteria"
>;

export class JDGapV3RepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "JDGapV3RepositoryError";
  }
}

function stableError(error: { code?: string; message?: string } | null) {
  if (error?.code === "42501" || error?.message === "authentication-required") {
    return "authentication-required";
  }
  if (
    error?.code === "P0002" ||
    error?.code === "PGRST116" ||
    error?.message === "application-or-resume-not-found" ||
    error?.message === "jd-gap-run-not-found" ||
    error?.message === "jd-gap-not-running"
  ) {
    return "jd-gap-v3-not-found";
  }
  if (
    error?.code === "22023" ||
    error?.code === "23514" ||
    error?.message?.startsWith("invalid-jd-gap")
  ) {
    return "invalid-jd-gap-v3";
  }
  if (error?.code === "23505" || error?.message === "jd-gap-conflict") {
    return "jd-gap-v3-conflict";
  }
  return "jd-gap-v3-storage-error";
}

function toRun(row: GapRunRow): JDGapV3Run {
  const parsed = gapRunSchema.safeParse({
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    structureRunId: row.structure_run_id,
    sourceAssetId: row.source_asset_id,
    sourceFilename: row.source_filename,
    sourceSha256: row.source_sha256,
    factFingerprint: row.fact_fingerprint,
    inputHash: row.input_hash,
    provider: row.provider,
    model: row.model,
    schemaVersion: row.schema_version,
    promptVersion: row.prompt_version,
    policyVersion: row.policy_version,
    status: row.status,
    attemptCount: row.attempt_count,
    result: row.result,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
  if (!parsed.success) {
    throw new JDGapV3RepositoryError("invalid-stored-jd-gap-v3");
  }
  return parsed.data;
}

function toRequirementResult(row: RequirementResultRow) {
  const parsed = storedRequirementResultSchema.safeParse({
    id: row.id,
    runId: row.run_id,
    requirementId: row.requirement_id,
    applicationId: row.application_id,
    userId: row.user_id,
    coverageStatus: row.coverage_status,
    impactLevel: row.impact_level,
    coveredCriterionCount: row.covered_criterion_count,
    missingCriterionCount: row.missing_criterion_count,
    sourceOrder: row.sort_order,
    createdAt: row.created_at,
  });
  if (!parsed.success) {
    throw new JDGapV3RepositoryError("invalid-stored-jd-gap-v3-requirement");
  }
  return parsed.data;
}

function toAssessment(row: AssessmentRow) {
  const parsed = storedAssessmentSchema.safeParse({
    id: row.id,
    runId: row.run_id,
    criterionId: row.criterion_id,
    requirementId: row.requirement_id,
    applicationId: row.application_id,
    userId: row.user_id,
    resumeEvidenceStatus: row.resume_evidence_status,
    resumeExcerpt: row.verified_resume_excerpt,
    profileFactIds: row.profile_fact_ids,
    gapType: row.gap_type,
    reasonZh: row.reason_zh,
    userQuestionZh: row.user_question_zh,
    createdAt: row.created_at,
  });
  if (!parsed.success) {
    throw new JDGapV3RepositoryError("invalid-stored-jd-gap-v3-assessment");
  }
  return parsed.data;
}

function asRun(data: GapRunRow | GapRunRow[] | null) {
  if (!data || Array.isArray(data)) {
    throw new JDGapV3RepositoryError("jd-gap-v3-storage-error");
  }
  return toRun(data);
}

export function createJDGapV3Repository(
  getClient: SupabaseFactory = createClient,
  structureReader: StructureReader = jdStructureRepository,
  listConfirmedFacts: typeof listConfirmedFactsForAnalysis = listConfirmedFactsForAnalysis,
) {
  async function createOrGet(input: {
    applicationId: string;
    structureRunId: string;
    sourceAssetId: string;
    factFingerprint: string;
    inputHash: string;
    provider: string;
    model: string;
    schemaVersion: string;
    promptVersion: string;
    policyVersion: string;
  }) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("create_or_get_jd_gap_v3", {
      target_application_id: input.applicationId,
      target_structure_run_id: input.structureRunId,
      target_source_asset_id: input.sourceAssetId,
      target_fact_fingerprint: input.factFingerprint,
      target_input_hash: input.inputHash,
      target_provider: input.provider,
      target_model: input.model,
      target_schema_version: input.schemaVersion,
      target_prompt_version: input.promptVersion,
      target_policy_version: input.policyVersion,
    });
    if (error || !data) throw new JDGapV3RepositoryError(stableError(error));
    return asRun(data as GapRunRow);
  }

  async function claim(
    runId: string,
    expectedAttemptCount: number,
    expectedStatus: "queued" | "running" | "failed",
    leaseSeconds = 120,
  ) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("claim_jd_gap_v3", {
      target_run_id: runId,
      expected_attempt_count: expectedAttemptCount,
      expected_status: expectedStatus,
      target_lease_seconds: leaseSeconds,
    });
    if (error || data == null) throw new JDGapV3RepositoryError(stableError(error));
    return data;
  }

  async function getOwned(userId: string, runId: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("jd_gap_v3_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("id", runId)
      .maybeSingle();
    if (error) throw new JDGapV3RepositoryError(stableError(error));
    return data ? toRun(data as GapRunRow) : null;
  }

  async function getLatestByStatus(
    userId: string,
    applicationId: string,
    succeededOnly: boolean,
  ) {
    const supabase = await getClient();
    let query = supabase
      .from("jd_gap_v3_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId);
    if (succeededOnly) query = query.eq("status", "succeeded");
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new JDGapV3RepositoryError(stableError(error));
    return data ? toRun(data as GapRunRow) : null;
  }

  async function getLatestForCombination(
    userId: string,
    applicationId: string,
    sourceAssetId: string,
    structureRunId: string,
    succeededOnly = false,
  ) {
    const supabase = await getClient();
    let query = supabase
      .from("jd_gap_v3_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .eq("source_asset_id", sourceAssetId)
      .eq("structure_run_id", structureRunId);
    if (succeededOnly) query = query.eq("status", "succeeded");
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new JDGapV3RepositoryError(stableError(error));
    return data ? toRun(data as GapRunRow) : null;
  }

  async function hydrateView(userId: string, run: JDGapV3Run): Promise<JDGapV3View> {
    const [structureRun, requirements] = await Promise.all([
      structureReader.getOwned(userId, run.structureRunId),
      structureReader.listRequirementsWithCriteria(userId, run.structureRunId),
    ]);
    if (!structureRun || structureRun.applicationId !== run.applicationId) {
      throw new JDGapV3RepositoryError("jd-gap-v3-not-found");
    }
    const supabase = await getClient();
    const [resultsResponse, assessmentsResponse, confirmedFacts] = await Promise.all([
      supabase
        .from("jd_gap_v3_requirement_results")
        .select("*")
        .eq("user_id", userId)
        .eq("run_id", run.id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("jd_gap_v3_criterion_assessments")
        .select("*")
        .eq("user_id", userId)
        .eq("run_id", run.id)
        .order("requirement_id", { ascending: true })
        .order("criterion_id", { ascending: true })
        .order("id", { ascending: true }),
      listConfirmedFacts(userId),
    ]);
    if (resultsResponse.error || assessmentsResponse.error) {
      throw new JDGapV3RepositoryError(
        stableError(resultsResponse.error ?? assessmentsResponse.error),
      );
    }
    const requirementResults = (resultsResponse.data ?? [])
      .map((row) => toRequirementResult(row as RequirementResultRow))
      .sort((left, right) => left.sourceOrder - right.sourceOrder || left.id.localeCompare(right.id));
    const storedAssessments = (assessmentsResponse.data ?? [])
      .map((row) => toAssessment(row as AssessmentRow))
      .sort((left, right) =>
        left.requirementId.localeCompare(right.requirementId) ||
        left.criterionId.localeCompare(right.criterionId) ||
        left.id.localeCompare(right.id),
      );
    const allowlistedFactIds = new Set(
      storedAssessments.flatMap((assessment) => assessment.profileFactIds),
    );
    const safeFacts = confirmedFacts.filter((fact) => allowlistedFactIds.has(fact.id));
    const factById = new Map(safeFacts.map((fact) => [fact.id, fact]));
    const assessments: JDGapV3AssessmentView[] = storedAssessments.map((assessment) => ({
      ...assessment,
      profileFacts: assessment.profileFactIds
        .map((id) => factById.get(id))
        .filter((fact): fact is ConfirmedFactForAnalysis => fact !== undefined),
    }));
    const resultByRequirement = new Map(
      requirementResults.map((result) => [result.requirementId, result]),
    );
    const assessmentByCriterion = new Map(
      assessments.map((assessment) => [assessment.criterionId, assessment]),
    );
    return {
      run,
      structureRun,
      requirementResults,
      assessments,
      confirmedFacts: safeFacts,
      requirements: requirements.map(({ criteria, ...requirement }) => ({
        ...requirement,
        result: resultByRequirement.get(requirement.id) ?? null,
        criteria: criteria.map((criterion) => ({
          ...criterion,
          assessment: assessmentByCriterion.get(criterion.id) ?? null,
        })),
      })),
    };
  }

  async function listView(userId: string, runId: string) {
    const run = await getOwned(userId, runId);
    return run ? hydrateView(userId, run) : null;
  }

  async function listLatestView(userId: string, applicationId: string) {
    const run = await getLatestByStatus(userId, applicationId, true);
    return run ? hydrateView(userId, run) : null;
  }

  async function complete(input: {
    runId: string;
    expectedAttemptCount: number;
    requirementResults: JDGapRequirementResult[];
    assessments: JDGapAssessmentForPersistence[];
    ai: AIMetadata;
    estimatedCost: EstimatedCost | null;
  }) {
    const requirementResults = input.requirementResults.map((result) => ({
      requirementId: result.requirementId,
      coverageStatus: result.coverageStatus,
      impactLevel: result.impactLevel,
      coveredCriterionCount: result.coveredCriterionCount,
      missingCriterionCount: result.missingCriterionCount,
      sortOrder: result.sourceOrder,
    }));
    const assessments = input.assessments.map((assessment) => ({
      criterionId: assessment.criterionId,
      requirementId: assessment.requirementId,
      resumeEvidenceStatus: assessment.resumeEvidenceStatus,
      verifiedResumeExcerpt: assessment.resumeExcerpt,
      profileFactIds: assessment.profileFactIds,
      gapType: assessment.gapType,
      reasonZh: assessment.reasonZh,
      userQuestionZh: assessment.userQuestionZh,
    }));
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("complete_jd_gap_v3", {
      target_run_id: input.runId,
      target_attempt_count: input.expectedAttemptCount,
      target_requirement_results: requirementResults as unknown as Json,
      target_criterion_assessments: assessments as unknown as Json,
      target_ai_metadata: aiMetadataSchema.parse(input.ai) as Json,
      target_estimated_cost: input.estimatedCost === null
        ? null
        : estimatedCostSchema.parse(input.estimatedCost) as Json,
    });
    if (error || !data) throw new JDGapV3RepositoryError(stableError(error));
    return asRun(data as GapRunRow);
  }

  async function fail(input: {
    runId: string;
    expectedAttemptCount: number;
    errorCode: string;
    errorMessage: string;
  }) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("fail_jd_gap_v3", {
      target_run_id: input.runId,
      target_attempt_count: input.expectedAttemptCount,
      target_error_code: input.errorCode,
      target_error_message: input.errorMessage,
    });
    if (error || !data) throw new JDGapV3RepositoryError(stableError(error));
    return asRun(data as GapRunRow);
  }

  return {
    createOrGet,
    claim,
    getOwned,
    getLatest: (userId: string, applicationId: string) =>
      getLatestByStatus(userId, applicationId, false),
    getLatestSucceeded: (userId: string, applicationId: string) =>
      getLatestByStatus(userId, applicationId, true),
    getLatestForCombination,
    listView,
    listLatestView,
    complete,
    fail,
  };
}

export const jdGapV3Repository = createJDGapV3Repository();
