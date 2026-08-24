import "server-only";

import type { Json, Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";

import {
  normalizeStoredIdentifier,
  resumeGapItemSchema,
  resumeGapRunResultSchema,
  resumeGapRunSchema,
  resumeGapRunStatusSchema,
  type ResumeGapAIUsage,
  type ResumeGapItem,
  type ResumeGapItemView,
  type ResumeGapRun,
  type ResumeGapRunResult,
} from "./schemas";

type RunRow = Database["public"]["Tables"]["resume_gap_runs"]["Row"];
type ItemRow = Database["public"]["Tables"]["resume_gap_items"]["Row"];

export class ResumeGapRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ResumeGapRepositoryError";
  }
}

type SupabaseFactory = typeof createClient;

function stableError(error: { code?: string; message?: string } | null) {
  if (error?.code === "42501" || error?.message === "authentication-required") {
    return "authentication-required";
  }
  if (
    error?.code === "P0002" ||
    error?.code === "PGRST116" ||
    error?.message === "application-or-resume-not-found"
  ) {
    return "application-or-resume-not-found";
  }
  if (
    error?.code === "22023" ||
    error?.code === "23514" ||
    error?.message === "invalid-resume-gap-input" ||
    error?.message === "invalid-resume-gap-result"
  ) {
    return "invalid-resume-gap";
  }
  if (error?.code === "23505") return "resume-gap-conflict";
  return "resume-gap-storage-error";
}

function toRun(row: RunRow): ResumeGapRun {
  const status = resumeGapRunStatusSchema.safeParse(row.status);
  const result = row.result === null ? null : resumeGapRunResultSchema.safeParse(row.result);
  if (!status.success || (result !== null && !result.success)) {
    throw new ResumeGapRepositoryError("invalid-stored-resume-gap");
  }
  const parsed = resumeGapRunSchema.safeParse({
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    analysisRunId: row.analysis_run_id,
    sourceAssetId: row.source_asset_id,
    sourceFilename: row.source_filename,
    sourceSha256: row.source_sha256,
    inputHash: row.input_hash,
    provider: row.provider,
    model: row.model,
    status: status.data,
    attemptCount: row.attempt_count,
    result: result === null ? null : result.data,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
  if (!parsed.success) throw new ResumeGapRepositoryError("invalid-stored-resume-gap");
  return parsed.data;
}

function toItem(row: ItemRow): ResumeGapItem {
  const parsed = resumeGapItemSchema.safeParse({
    id: row.id,
    runId: row.run_id,
    applicationId: row.application_id,
    userId: row.user_id,
    requirementId: row.requirement_id,
    requirementText: row.requirement_text,
    category: row.category,
    priority: row.priority,
    jdSourceExcerpt: row.jd_source_excerpt,
    resumeCoverage: row.resume_coverage,
    verifiedResumeExcerpt: row.verified_resume_excerpt,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  });
  if (!parsed.success) throw new ResumeGapRepositoryError("invalid-stored-resume-gap-item");
  return parsed.data;
}

function asRun(data: RunRow | RunRow[] | null, code?: string): ResumeGapRun {
  if (!data || Array.isArray(data)) {
    throw new ResumeGapRepositoryError(code ?? "resume-gap-storage-error");
  }
  return toRun(data);
}

export type ResumeGapCompleteInput = {
  runId: string;
  expectedAttemptCount: number;
  items: Array<{
    requirementId: string;
    resumeCoverage: "covered" | "partial" | "missing";
    resumeExcerpt: string | null;
  }>;
  aiUsage: ResumeGapAIUsage;
  estimatedCost: ResumeGapRunResult["estimatedCost"];
};

export type ResumeGapFailInput = {
  runId: string;
  expectedAttemptCount: number;
  errorCode: string;
  errorMessage: string;
};

export function createResumeGapRepository(
  getClient: SupabaseFactory = createClient,
  listCurrentRequirements: typeof jdAnalysisRepository.listRequirements =
    jdAnalysisRepository.listRequirements,
) {
  async function createOrGet(input: {
    applicationId: string;
    analysisRunId: string;
    sourceAssetId: string;
    inputHash: string;
    provider: string;
    model: string;
  }) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("create_or_get_resume_gap", {
      target_application_id: input.applicationId,
      target_analysis_run_id: input.analysisRunId,
      target_source_asset_id: input.sourceAssetId,
      target_input_hash: input.inputHash,
      target_provider: input.provider,
      target_model: input.model,
    });
    if (error || !data) throw new ResumeGapRepositoryError(stableError(error));
    return asRun(data as RunRow);
  }

  async function claim(runId: string, leaseSeconds = 120) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("claim_resume_gap", {
      target_run_id: runId,
      target_lease_seconds: leaseSeconds,
    });
    if (error || data == null) throw new ResumeGapRepositoryError(stableError(error));
    return data;
  }

  async function getOwned(userId: string, runId: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("resume_gap_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("id", runId)
      .maybeSingle();
    if (error) throw new ResumeGapRepositoryError(stableError(error));
    return data ? toRun(data as RunRow) : null;
  }

  async function getLatest(userId: string, applicationId: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("resume_gap_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new ResumeGapRepositoryError(stableError(error));
    return data ? toRun(data as RunRow) : null;
  }

  async function getLatestSucceeded(userId: string, applicationId: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("resume_gap_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new ResumeGapRepositoryError(stableError(error));
    return data ? toRun(data as RunRow) : null;
  }

  async function listItems(userId: string, runId: string): Promise<(ResumeGapItemView & { historical: boolean })[]> {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("resume_gap_items")
      .select("*")
      .eq("user_id", userId)
      .eq("run_id", runId)
      .order("sort_order", { ascending: true });
    if (error) throw new ResumeGapRepositoryError(stableError(error));
    const items = (data ?? []).map((row) => toItem(row as ItemRow));
    const run = await getOwned(userId, runId);
    if (!run) return [];

    // Requirement rows are mutable between JD runs. Only the current row and
    // its confirmed evidence can be joined; snapshots stay readable for old rows.
    const current = await listCurrentRequirements(userId, run.applicationId);
    const byId = new Map(current.map((requirement) => [requirement.id, requirement]));
    return items.map((item) => {
      const requirement = item.requirementId ? byId.get(item.requirementId) : undefined;
      const sameRun = requirement?.analysisRunId === run.analysisRunId;
      return {
        ...item,
        profileEvidence: sameRun ? requirement?.evidence ?? [] : [],
        matchStatus: sameRun ? requirement?.matchStatus : undefined,
        matchReason: sameRun ? requirement?.matchReason : null,
        historical: !sameRun,
      };
    });
  }

  async function complete(input: ResumeGapCompleteInput) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("complete_resume_gap", {
      target_run_id: input.runId,
      target_attempt_count: input.expectedAttemptCount,
      target_items: input.items as unknown as Json,
      target_ai_usage: input.aiUsage as unknown as Json,
      target_estimated_cost: input.estimatedCost as unknown as Json,
    });
    if (error || !data) throw new ResumeGapRepositoryError(stableError(error));
    return asRun(data as RunRow);
  }

  async function fail(input: ResumeGapFailInput) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("fail_resume_gap", {
      target_run_id: input.runId,
      target_attempt_count: input.expectedAttemptCount,
      target_error_code: input.errorCode,
      target_error_message: input.errorMessage,
    });
    if (error || !data) throw new ResumeGapRepositoryError(stableError(error));
    return asRun(data as RunRow);
  }

  return { createOrGet, claim, getOwned, getLatest, getLatestSucceeded, listItems, complete, fail };
}

export const resumeGapRepository = createResumeGapRepository();

export { normalizeStoredIdentifier };
