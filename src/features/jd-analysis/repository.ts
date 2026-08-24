import "server-only";

import { z } from "zod";

import type { Json, Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { careerFactRepository } from "@/features/career-profile/repository";

import type {
  CompleteJDAnalysisInput,
  FailJDAnalysisInput,
} from "./service";
import {
  confirmedFactForAnalysisSchema,
  requirementCategorySchema,
  requirementMatchStatusSchema,
  requirementPrioritySchema,
  type ConfirmedFactForAnalysis,
  type JDAnalysisRun,
  type JDAnalysisRunResult,
  type JDRequirementRecord,
} from "./schemas";

type RunRow = Database["public"]["Tables"]["application_analysis_runs"]["Row"];
type RequirementRow =
  Database["public"]["Tables"]["application_requirements"]["Row"];

const runStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);

const runResultSchema = z.object({
  acceptedRequirementCount: z.number().int().nonnegative(),
  rejectedRequirementCount: z.number().int().nonnegative(),
  rejectedEvidenceCount: z.number().int().nonnegative(),
  ai: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    requestId: z.string().nullable(),
    usage: z.object({
      inputCacheHitTokens: z.number().int().nonnegative(),
      inputCacheMissTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    }),
    priceScheduleVersion: z.string().nullable(),
  }),
  estimatedCost: z
    .object({
      amount: z.number().nonnegative(),
      currency: z.literal("USD"),
      scheduleVersion: z.string().min(1),
      tier: z.enum(["default", "peak"]),
    })
    .nullable(),
});

export class JDAnalysisRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "JDAnalysisRepositoryError";
  }
}

function stableError(error: { code?: string; message?: string } | null) {
  if (error?.code === "P0002" || error?.code === "PGRST116") {
    return "application-analysis-not-found";
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return "invalid-application-analysis";
  }
  if (error?.code === "23505") return "application-analysis-conflict";
  return "application-analysis-storage-error";
}

function toRun(row: RunRow): JDAnalysisRun {
  const status = runStatusSchema.safeParse(row.status);
  const result = row.result ? runResultSchema.safeParse(row.result) : null;
  if (!status.success || (result && !result.success)) {
    throw new JDAnalysisRepositoryError("invalid-stored-application-analysis");
  }
  return {
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    inputHash: row.input_hash,
    provider: row.provider,
    model: row.model,
    status: status.data,
    attemptCount: row.attempt_count,
    result: result ? (result.data as JDAnalysisRunResult) : null,
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
}

function toConfirmedFact(input: {
  id: string;
  factType: string;
  data: {
    title: string;
    organization: string | null;
    description: string;
    skills: string[];
  };
  sourceExcerpt: string | null;
  confirmationStatus: string;
}): ConfirmedFactForAnalysis | null {
  if (input.confirmationStatus !== "confirmed") return null;
  const parsed = confirmedFactForAnalysisSchema.safeParse({
    id: input.id,
    factType: input.factType,
    title: input.data.title,
    organization: input.data.organization,
    description: input.data.description,
    skills: input.data.skills,
    sourceExcerpt: input.sourceExcerpt,
  });
  return parsed.success ? parsed.data : null;
}

export async function listConfirmedFactsForAnalysis(
  userId: string,
): Promise<ConfirmedFactForAnalysis[]> {
  const facts = await careerFactRepository.list(userId);
  return facts
    .map(toConfirmedFact)
    .filter((fact): fact is ConfirmedFactForAnalysis => fact !== null);
}

async function createOrGet(input: {
  applicationId: string;
  inputHash: string;
  provider: string;
  model: string;
}): Promise<JDAnalysisRun> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_or_get_application_analysis",
    {
      target_application_id: input.applicationId,
      target_input_hash: input.inputHash,
      target_provider: input.provider,
      target_model: input.model,
    },
  );
  if (error || !data) {
    throw new JDAnalysisRepositoryError(stableError(error));
  }
  return toRun(data);
}

async function claim(runId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_application_analysis", {
    target_run_id: runId,
  });
  if (error) throw new JDAnalysisRepositoryError(stableError(error));
  return data;
}

async function getOwned(
  userId: string,
  runId: string,
): Promise<JDAnalysisRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_analysis_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new JDAnalysisRepositoryError(stableError(error));
  return data ? toRun(data) : null;
}

async function getLatest(
  userId: string,
  applicationId: string,
): Promise<JDAnalysisRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_analysis_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new JDAnalysisRepositoryError(stableError(error));
  return data ? toRun(data) : null;
}

async function getLatestSucceeded(
  userId: string,
  applicationId: string,
): Promise<JDAnalysisRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_analysis_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new JDAnalysisRepositoryError(stableError(error));
  return data ? toRun(data) : null;
}

async function listRuns(userId: string): Promise<JDAnalysisRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_analysis_runs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new JDAnalysisRepositoryError(stableError(error));
  return (data ?? []).map(toRun);
}

async function complete(
  input: CompleteJDAnalysisInput,
): Promise<JDAnalysisRun> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_application_analysis", {
    target_run_id: input.runId,
    accepted_requirements: input.requirements as Json,
    rejected_requirement_count: input.rejectedRequirementCount,
    rejected_evidence_count: input.rejectedEvidenceCount,
    ai_usage: input.aiUsage as Json,
    estimated_cost: input.estimatedCost as Json,
  });
  if (error || !data) {
    throw new JDAnalysisRepositoryError(stableError(error));
  }
  return toRun(data);
}

async function fail(input: FailJDAnalysisInput): Promise<JDAnalysisRun> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fail_application_analysis", {
    target_run_id: input.runId,
    target_error_code: input.errorCode,
    target_error_message: input.errorMessage,
  });
  if (error || !data) {
    throw new JDAnalysisRepositoryError(stableError(error));
  }
  return toRun(data);
}

async function listRequirements(
  userId: string,
  applicationId: string,
  analysisRunId?: string,
): Promise<JDRequirementRecord[]> {
  const supabase = await createClient();
  let requirementsQuery = supabase
    .from("application_requirements")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId);
  if (analysisRunId) requirementsQuery = requirementsQuery.eq("analysis_run_id", analysisRunId);
  const [{ data: rows, error }, { data: evidenceRows, error: evidenceError }] =
    await Promise.all([
      requirementsQuery.order("sort_order", { ascending: true }),
      supabase
        .from("application_requirement_evidence")
        .select("requirement_id, career_fact_id")
        .eq("user_id", userId)
        .eq("application_id", applicationId),
    ]);
  if (error || evidenceError) {
    throw new JDAnalysisRepositoryError(stableError(error ?? evidenceError));
  }

  const facts = await listConfirmedFactsForAnalysis(userId);
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const evidenceByRequirement = new Map<string, ConfirmedFactForAnalysis[]>();
  for (const row of evidenceRows ?? []) {
    const fact = factsById.get(row.career_fact_id);
    if (!fact) continue;
    const current = evidenceByRequirement.get(row.requirement_id) ?? [];
    current.push(fact);
    evidenceByRequirement.set(row.requirement_id, current);
  }

  return (rows ?? []).map((row: RequirementRow) => {
    const category = requirementCategorySchema.safeParse(row.category);
    const priority = requirementPrioritySchema.safeParse(row.priority);
    const matchStatus = requirementMatchStatusSchema.safeParse(row.match_status);
    if (!category.success || !priority.success || !matchStatus.success) {
      throw new JDAnalysisRepositoryError("invalid-stored-application-requirement");
    }
    return {
      id: row.id,
      analysisRunId: row.analysis_run_id,
      applicationId: row.application_id,
      category: category.data,
      text: row.requirement_text,
      sourceExcerpt: row.source_excerpt,
      priority: priority.data,
      matchStatus: matchStatus.data,
      matchReason: row.match_reason,
      sortOrder: row.sort_order,
      evidence: evidenceByRequirement.get(row.id) ?? [],
    };
  });
}

export const jdAnalysisRepository = {
  createOrGet,
  claim,
  getOwned,
  getLatest,
  getLatestSucceeded,
  listRuns,
  complete,
  fail,
  listRequirements,
};
