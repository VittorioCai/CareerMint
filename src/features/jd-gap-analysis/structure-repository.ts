import "server-only";

import { z } from "zod";

import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { requirementCategorySchema } from "@/features/jd-analysis/schemas";

import {
  aiMetadataSchema,
  criterionConstraintSchema,
  criterionGroupRuleSchema,
  criterionKindSchema,
  estimatedCostSchema,
  jdStructureProviderOutputSchema,
  processingRunStatusSchema,
  requirementTypeSchema,
  type AIMetadata,
  type EstimatedCost,
  type JDGapRequirementForComparison,
  type JDStructureProviderOutput,
} from "./schemas";

type StructureRunRow = Database["public"]["Tables"]["jd_structure_runs"]["Row"];
type RequirementRow = Database["public"]["Tables"]["jd_structure_requirements"]["Row"];
type CriterionRow = Database["public"]["Tables"]["jd_structure_criteria"]["Row"];
type SupabaseFactory = typeof createClient;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const timestampSchema = z.iso.datetime({ offset: true });

const structureResultSchema = z
  .object({
    requirementCount: z.number().int().min(0).max(80),
    criterionCount: z.number().int().min(0).max(960),
    translationAvailable: z.boolean(),
    ai: aiMetadataSchema,
    estimatedCost: estimatedCostSchema.nullable(),
  })
  .strict();

const structureRunSchema = z
  .object({
    id: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    jdSha256: sha256Schema,
    inputHash: sha256Schema,
    provider: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(160),
    schemaVersion: z.string().trim().min(1).max(80),
    promptVersion: z.string().trim().min(1).max(80),
    status: processingRunStatusSchema,
    attemptCount: z.number().int().min(0).max(1000),
    jdTranslationZh: z.string().trim().min(1).max(100_000).nullable(),
    result: structureResultSchema.nullable(),
    errorCode: z.string().trim().min(1).max(120).nullable(),
    errorMessage: z.string().trim().min(1).max(500).nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    finishedAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((run, context) => {
    const succeeded = run.status === "succeeded";
    if (succeeded !== (run.result !== null && run.jdTranslationZh !== null)) {
      context.addIssue({ code: "custom", message: "Invalid structure run result state." });
    }
    const failed = run.status === "failed";
    if (failed !== (run.errorCode !== null && run.errorMessage !== null)) {
      context.addIssue({ code: "custom", message: "Invalid structure run error state." });
    }
  });

const storedRequirementSchema = z
  .object({
    id: z.uuid(),
    runId: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    category: requirementCategorySchema,
    requirementType: requirementTypeSchema,
    originalText: z.string().trim().min(1).max(500),
    translationZh: z.string().trim().min(1).max(1000),
    sourceExcerpt: z.string().trim().min(12).max(1000),
    allowsEquivalent: z.boolean(),
    explicitGate: z.boolean(),
    sortOrder: z.number().int().min(0).max(79),
    createdAt: timestampSchema,
  })
  .strict();

const storedCriterionSchema = z
  .object({
    id: z.uuid(),
    requirementId: z.uuid(),
    runId: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    groupKey: z.string().regex(/^g[1-9][0-9]?$/u),
    groupRule: criterionGroupRuleSchema,
    kind: criterionKindSchema,
    originalText: z.string().trim().min(1).max(500),
    translationZh: z.string().trim().min(1).max(1000),
    constraint: criterionConstraintSchema,
    sortOrder: z.number().int().min(0).max(11),
    createdAt: timestampSchema,
  })
  .strict();

export type JDStructureRun = z.infer<typeof structureRunSchema>;
export type JDStructureRequirementRecord = z.infer<typeof storedRequirementSchema> & {
  criteria: Array<z.infer<typeof storedCriterionSchema>>;
};

export class JDStructureRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "JDStructureRepositoryError";
  }
}

function stableError(error: { code?: string; message?: string } | null) {
  if (error?.code === "42501" || error?.message === "authentication-required") {
    return "authentication-required";
  }
  if (
    error?.code === "P0002" ||
    error?.code === "PGRST116" ||
    error?.message === "application-not-found" ||
    error?.message === "jd-structure-run-not-found" ||
    error?.message === "jd-structure-not-running"
  ) {
    return "jd-structure-not-found";
  }
  if (
    error?.code === "22023" ||
    error?.code === "23514" ||
    error?.message?.startsWith("invalid-jd-structure")
  ) {
    return "invalid-jd-structure";
  }
  if (error?.code === "23505" || error?.message === "jd-structure-conflict") {
    return "jd-structure-conflict";
  }
  return "jd-structure-storage-error";
}

function toRun(row: StructureRunRow): JDStructureRun {
  const parsed = structureRunSchema.safeParse({
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    jdSha256: row.jd_sha256,
    inputHash: row.input_hash,
    provider: row.provider,
    model: row.model,
    schemaVersion: row.schema_version,
    promptVersion: row.prompt_version,
    status: row.status,
    attemptCount: row.attempt_count,
    jdTranslationZh: row.jd_translation_zh,
    result: row.result,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
  if (!parsed.success) {
    throw new JDStructureRepositoryError("invalid-stored-jd-structure");
  }
  return parsed.data;
}

function toRequirement(row: RequirementRow) {
  const parsed = storedRequirementSchema.safeParse({
    id: row.id,
    runId: row.run_id,
    applicationId: row.application_id,
    userId: row.user_id,
    category: row.category,
    requirementType: row.requirement_type,
    originalText: row.original_text,
    translationZh: row.translation_zh,
    sourceExcerpt: row.source_excerpt,
    allowsEquivalent: row.allows_equivalent,
    explicitGate: row.explicit_gate,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  });
  if (!parsed.success) {
    throw new JDStructureRepositoryError("invalid-stored-jd-structure-requirement");
  }
  return parsed.data;
}

function toCriterion(row: CriterionRow) {
  const parsed = storedCriterionSchema.safeParse({
    id: row.id,
    requirementId: row.requirement_id,
    runId: row.run_id,
    applicationId: row.application_id,
    userId: row.user_id,
    groupKey: row.group_key,
    groupRule: row.group_rule,
    kind: row.kind,
    originalText: row.original_text,
    translationZh: row.translation_zh,
    constraint: row.constraint_payload,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  });
  if (!parsed.success) {
    throw new JDStructureRepositoryError("invalid-stored-jd-structure-criterion");
  }
  return parsed.data;
}

function asRun(data: StructureRunRow | StructureRunRow[] | null) {
  if (!data || Array.isArray(data)) {
    throw new JDStructureRepositoryError("jd-structure-storage-error");
  }
  return toRun(data);
}

export function createJDStructureRepository(
  getClient: SupabaseFactory = createClient,
) {
  async function createOrGet(input: {
    applicationId: string;
    jdSha256: string;
    inputHash: string;
    provider: string;
    model: string;
    schemaVersion: string;
    promptVersion: string;
  }) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("create_or_get_jd_structure", {
      target_application_id: input.applicationId,
      target_jd_sha256: input.jdSha256,
      target_input_hash: input.inputHash,
      target_provider: input.provider,
      target_model: input.model,
      target_schema_version: input.schemaVersion,
      target_prompt_version: input.promptVersion,
    });
    if (error || !data) throw new JDStructureRepositoryError(stableError(error));
    return asRun(data as StructureRunRow);
  }

  async function claim(
    runId: string,
    expectedAttemptCount: number,
    expectedStatus: "queued" | "running" | "failed",
    leaseSeconds = 120,
  ) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("claim_jd_structure", {
      target_run_id: runId,
      expected_attempt_count: expectedAttemptCount,
      expected_status: expectedStatus,
      target_lease_seconds: leaseSeconds,
    });
    if (error || data == null) throw new JDStructureRepositoryError(stableError(error));
    return data;
  }

  async function getOwned(userId: string, runId: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("jd_structure_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("id", runId)
      .maybeSingle();
    if (error) throw new JDStructureRepositoryError(stableError(error));
    return data ? toRun(data as StructureRunRow) : null;
  }

  async function getLatestByStatus(
    userId: string,
    applicationId: string,
    succeededOnly: boolean,
  ) {
    const supabase = await getClient();
    let query = supabase
      .from("jd_structure_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId);
    if (succeededOnly) query = query.eq("status", "succeeded");
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new JDStructureRepositoryError(stableError(error));
    return data ? toRun(data as StructureRunRow) : null;
  }

  async function listRequirementsWithCriteria(userId: string, runId: string) {
    const supabase = await getClient();
    const [requirementsResponse, criteriaResponse] = await Promise.all([
      supabase
        .from("jd_structure_requirements")
        .select("*")
        .eq("user_id", userId)
        .eq("run_id", runId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("jd_structure_criteria")
        .select("*")
        .eq("user_id", userId)
        .eq("run_id", runId)
        .order("requirement_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
    ]);
    if (requirementsResponse.error || criteriaResponse.error) {
      throw new JDStructureRepositoryError(
        stableError(requirementsResponse.error ?? criteriaResponse.error),
      );
    }
    const requirements = (requirementsResponse.data ?? [])
      .map((row) => toRequirement(row as RequirementRow))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    const criteria = (criteriaResponse.data ?? [])
      .map((row) => toCriterion(row as CriterionRow))
      .sort((left, right) =>
        left.requirementId.localeCompare(right.requirementId) ||
        left.sortOrder - right.sortOrder ||
        left.id.localeCompare(right.id),
      );
    const byRequirement = new Map<string, typeof criteria>();
    for (const criterion of criteria) {
      const current = byRequirement.get(criterion.requirementId) ?? [];
      current.push(criterion);
      byRequirement.set(criterion.requirementId, current);
    }
    return requirements.map((requirement) => ({
      ...requirement,
      criteria: byRequirement.get(requirement.id) ?? [],
    })) satisfies JDStructureRequirementRecord[];
  }

  async function complete(input: {
    runId: string;
    expectedAttemptCount: number;
    output: JDStructureProviderOutput;
    ai: AIMetadata;
    estimatedCost: EstimatedCost | null;
  }) {
    const output = jdStructureProviderOutputSchema.parse(input.output);
    const requirements = output.requirements.map((requirement, requirementIndex) => ({
      category: requirement.category,
      requirementType: requirement.requirementType,
      originalText: requirement.originalText,
      translationZh: requirement.translationZh,
      sourceExcerpt: requirement.sourceExcerpt,
      allowsEquivalent: requirement.allowsEquivalent,
      explicitGate: requirement.explicitGate,
      sortOrder: requirementIndex,
      criteria: requirement.criteria.map((criterion, criterionIndex) => ({
        groupKey: criterion.groupKey,
        groupRule: criterion.groupRule,
        kind: criterion.kind,
        originalText: criterion.originalText,
        translationZh: criterion.translationZh,
        constraint: criterion.constraint,
        sortOrder: criterionIndex,
      })),
    }));
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("complete_jd_structure", {
      target_run_id: input.runId,
      target_attempt_count: input.expectedAttemptCount,
      target_jd_translation_zh: output.jdTranslationZh,
      target_requirements: requirements as unknown as Json,
      target_ai_metadata: aiMetadataSchema.parse(input.ai) as Json,
      target_estimated_cost: input.estimatedCost === null
        ? null
        : estimatedCostSchema.parse(input.estimatedCost) as Json,
    });
    if (error || !data) throw new JDStructureRepositoryError(stableError(error));
    return asRun(data as StructureRunRow);
  }

  async function fail(input: {
    runId: string;
    expectedAttemptCount: number;
    errorCode: string;
    errorMessage: string;
  }) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("fail_jd_structure", {
      target_run_id: input.runId,
      target_attempt_count: input.expectedAttemptCount,
      target_error_code: input.errorCode,
      target_error_message: input.errorMessage,
    });
    if (error || !data) throw new JDStructureRepositoryError(stableError(error));
    return asRun(data as StructureRunRow);
  }

  return {
    createOrGet,
    claim,
    getOwned,
    getLatest: (userId: string, applicationId: string) =>
      getLatestByStatus(userId, applicationId, false),
    getLatestSucceeded: (userId: string, applicationId: string) =>
      getLatestByStatus(userId, applicationId, true),
    listRequirementsWithCriteria,
    complete,
    fail,
  };
}

export const jdStructureRepository = createJDStructureRepository();

export function asJDGapRequirements(
  requirements: JDStructureRequirementRecord[],
): JDGapRequirementForComparison[] {
  return requirements.map((requirement) => ({
    id: requirement.id,
    category: requirement.category,
    requirementType: requirement.requirementType,
    originalText: requirement.originalText,
    translationZh: requirement.translationZh,
    sourceExcerpt: requirement.sourceExcerpt,
    allowsEquivalent: requirement.allowsEquivalent,
    explicitGate: requirement.explicitGate,
    sortOrder: requirement.sortOrder,
    criteria: requirement.criteria.map((criterion) => ({
      id: criterion.id,
      groupKey: criterion.groupKey,
      groupRule: criterion.groupRule,
      kind: criterion.kind,
      originalText: criterion.originalText,
      translationZh: criterion.translationZh,
      constraint: criterion.constraint,
      sortOrder: criterion.sortOrder,
    })),
  }));
}
