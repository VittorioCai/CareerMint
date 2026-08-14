import "server-only";

import { z } from "zod";

import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";

import type {
  CompleteResumeGenerationInput,
  FailResumeGenerationInput,
} from "./service";
import {
  resumeFactSnapshotSchema,
  resumeSectionSchema,
  resumeSuggestionDecisionSchema,
  type ResumeGenerationRun,
  type ResumeGenerationRunResult,
  type ResumeRequirementContext,
  type ResumeSuggestionRecord,
  type ResumeVersion,
  type ResumeVersionItem,
} from "./schemas";

type RunRow = Database["public"]["Tables"]["resume_generation_runs"]["Row"];
type SuggestionRow = Database["public"]["Tables"]["resume_suggestions"]["Row"];
type VersionRow = Database["public"]["Tables"]["resume_versions"]["Row"];
type VersionItemRow =
  Database["public"]["Tables"]["resume_version_items"]["Row"];
type EvidenceRow =
  Database["public"]["Tables"]["resume_version_item_evidence"]["Row"];

const runStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
const templateSchema = z.enum(["simple", "modern"]);
const runResultSchema = z.object({
  acceptedSuggestionCount: z.number().int().nonnegative(),
  rejectedSuggestionCount: z.number().int().nonnegative(),
  rejectedReferenceCount: z.number().int().nonnegative(),
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

export class ResumeCustomizationRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ResumeCustomizationRepositoryError";
  }
}

function stableError(error: { code?: string } | null) {
  if (error?.code === "P0002" || error?.code === "PGRST116") {
    return "resume-resource-not-found";
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return "invalid-resume-operation";
  }
  if (error?.code === "23505") return "resume-operation-conflict";
  return "resume-storage-error";
}

function toRun(row: RunRow): ResumeGenerationRun {
  const status = runStatusSchema.safeParse(row.status);
  const result = row.result ? runResultSchema.safeParse(row.result) : null;
  if (!status.success || (result && !result.success)) {
    throw new ResumeCustomizationRepositoryError(
      "invalid-stored-resume-generation",
    );
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
    result: result ? (result.data as ResumeGenerationRunResult) : null,
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
}

async function createOrGet(input: {
  applicationId: string;
  inputHash: string;
  provider: string;
  model: string;
}): Promise<ResumeGenerationRun> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_or_get_resume_generation",
    {
      target_application_id: input.applicationId,
      target_input_hash: input.inputHash,
      target_provider: input.provider,
      target_model: input.model,
    },
  );
  if (error || !data) {
    throw new ResumeCustomizationRepositoryError(stableError(error));
  }
  return toRun(data);
}

async function claim(runId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_resume_generation", {
    target_run_id: runId,
  });
  if (error) throw new ResumeCustomizationRepositoryError(stableError(error));
  return data;
}

async function getOwned(
  userId: string,
  runId: string,
): Promise<ResumeGenerationRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resume_generation_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new ResumeCustomizationRepositoryError(stableError(error));
  return data ? toRun(data) : null;
}

async function getLatestRun(
  userId: string,
  applicationId: string,
): Promise<ResumeGenerationRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resume_generation_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ResumeCustomizationRepositoryError(stableError(error));
  return data ? toRun(data) : null;
}

async function listRuns(userId: string): Promise<ResumeGenerationRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resume_generation_runs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new ResumeCustomizationRepositoryError(stableError(error));
  return (data ?? []).map(toRun);
}

async function complete(
  input: CompleteResumeGenerationInput,
): Promise<ResumeGenerationRun> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_resume_generation", {
    target_run_id: input.runId,
    accepted_suggestions: input.suggestions as Json,
    rejected_suggestion_count: input.rejectedSuggestionCount,
    rejected_reference_count: input.rejectedReferenceCount,
    ai_usage: input.aiUsage as Json,
    estimated_cost: input.estimatedCost as Json,
  });
  if (error || !data) {
    throw new ResumeCustomizationRepositoryError(stableError(error));
  }
  return toRun(data);
}

async function fail(
  input: FailResumeGenerationInput,
): Promise<ResumeGenerationRun> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fail_resume_generation", {
    target_run_id: input.runId,
    target_error_code: input.errorCode,
    target_error_message: input.errorMessage,
  });
  if (error || !data) {
    throw new ResumeCustomizationRepositoryError(stableError(error));
  }
  return toRun(data);
}

export async function listRequirementContexts(
  userId: string,
  applicationId: string,
): Promise<ResumeRequirementContext[]> {
  const requirements = await jdAnalysisRepository.listRequirements(
    userId,
    applicationId,
  );
  return requirements.map((requirement) => ({
    id: requirement.id,
    category: requirement.category,
    text: requirement.text,
    priority: requirement.priority,
  }));
}

async function listSuggestions(
  userId: string,
  runId: string,
): Promise<ResumeSuggestionRecord[]> {
  const supabase = await createClient();
  const [{ data: rows, error }, { data: factLinks, error: factError }, { data: requirementLinks, error: requirementError }] =
    await Promise.all([
      supabase
        .from("resume_suggestions")
        .select("*")
        .eq("user_id", userId)
        .eq("run_id", runId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("resume_suggestion_facts")
        .select("suggestion_id, career_fact_id")
        .eq("user_id", userId)
        .eq("run_id", runId),
      supabase
        .from("resume_suggestion_requirements")
        .select("suggestion_id, requirement_id, application_id")
        .eq("user_id", userId)
        .eq("run_id", runId),
    ]);
  if (error || factError || requirementError) {
    throw new ResumeCustomizationRepositoryError(
      stableError(error ?? factError ?? requirementError),
    );
  }

  const applicationId = rows?.[0]?.application_id;
  const [facts, requirements] = await Promise.all([
    listConfirmedFactsForAnalysis(userId),
    applicationId
      ? listRequirementContexts(userId, applicationId)
      : Promise.resolve([]),
  ]);
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const requirementsById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  const factIdsBySuggestion = new Map<string, string[]>();
  for (const link of factLinks ?? []) {
    const current = factIdsBySuggestion.get(link.suggestion_id) ?? [];
    current.push(link.career_fact_id);
    factIdsBySuggestion.set(link.suggestion_id, current);
  }
  const requirementIdsBySuggestion = new Map<string, string[]>();
  for (const link of requirementLinks ?? []) {
    const current = requirementIdsBySuggestion.get(link.suggestion_id) ?? [];
    current.push(link.requirement_id);
    requirementIdsBySuggestion.set(link.suggestion_id, current);
  }

  return (rows ?? []).map((row: SuggestionRow) => {
    const section = resumeSectionSchema.safeParse(row.section);
    const decision = resumeSuggestionDecisionSchema.safeParse(row.decision);
    if (!section.success || !decision.success) {
      throw new ResumeCustomizationRepositoryError(
        "invalid-stored-resume-suggestion",
      );
    }
    return {
      id: row.id,
      runId: row.run_id,
      applicationId: row.application_id,
      section: section.data,
      content: row.content,
      reason: row.reason,
      decision: decision.data,
      reviewedContent: row.reviewed_content,
      sortOrder: row.sort_order,
      facts: (factIdsBySuggestion.get(row.id) ?? [])
        .map((factId) => factsById.get(factId))
        .filter((fact) => fact !== undefined),
      requirements: (requirementIdsBySuggestion.get(row.id) ?? [])
        .map((requirementId) => requirementsById.get(requirementId))
        .filter((requirement) => requirement !== undefined),
    };
  });
}

async function getSuggestion(
  userId: string,
  suggestionId: string,
): Promise<ResumeSuggestionRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resume_suggestions")
    .select("run_id")
    .eq("user_id", userId)
    .eq("id", suggestionId)
    .maybeSingle();
  if (error) throw new ResumeCustomizationRepositoryError(stableError(error));
  if (!data) return null;
  const suggestions = await listSuggestions(userId, data.run_id);
  return suggestions.find((suggestion) => suggestion.id === suggestionId) ?? null;
}

async function review(input: {
  suggestionId: string;
  decision: "pending" | "accepted" | "rejected";
  reviewedContent: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_resume_suggestion", {
    target_suggestion_id: input.suggestionId,
    target_decision: input.decision,
    target_reviewed_content: input.reviewedContent ?? "",
  });
  if (error) throw new ResumeCustomizationRepositoryError(stableError(error));
}

function hydrateVersions(
  versionRows: VersionRow[],
  itemRows: VersionItemRow[],
  evidenceRows: EvidenceRow[],
): ResumeVersion[] {
  const evidenceByItem = new Map<
    string,
    ResumeVersionItem["evidence"]
  >();
  for (const evidence of evidenceRows) {
    const snapshot = resumeFactSnapshotSchema.safeParse(evidence.fact_snapshot);
    if (!snapshot.success) {
      throw new ResumeCustomizationRepositoryError(
        "invalid-stored-resume-evidence",
      );
    }
    const current = evidenceByItem.get(evidence.item_id) ?? [];
    current.push({
      careerFactId: evidence.career_fact_id,
      factSnapshot: snapshot.data,
    });
    evidenceByItem.set(evidence.item_id, current);
  }

  const itemsByVersion = new Map<string, ResumeVersionItem[]>();
  for (const item of itemRows) {
    const section = resumeSectionSchema.safeParse(item.section);
    if (!section.success) {
      throw new ResumeCustomizationRepositoryError(
        "invalid-stored-resume-version-item",
      );
    }
    const current = itemsByVersion.get(item.version_id) ?? [];
    current.push({
      id: item.id,
      section: section.data,
      content: item.content,
      reason: item.reason,
      sortOrder: item.sort_order,
      evidence: evidenceByItem.get(item.id) ?? [],
    });
    itemsByVersion.set(item.version_id, current);
  }

  return versionRows.map((row) => {
    const template = templateSchema.safeParse(row.template);
    if (!template.success) {
      throw new ResumeCustomizationRepositoryError(
        "invalid-stored-resume-version",
      );
    }
    return {
      id: row.id,
      applicationId: row.application_id,
      userId: row.user_id,
      sourceRunId: row.source_run_id,
      versionNumber: row.version_number,
      template: template.data,
      createdAt: row.created_at,
      items: (itemsByVersion.get(row.id) ?? []).sort(
        (left, right) => left.sortOrder - right.sortOrder,
      ),
    };
  });
}

async function listVersions(
  userId: string,
  applicationId: string,
): Promise<ResumeVersion[]> {
  const supabase = await createClient();
  const [{ data: versions, error }, { data: items, error: itemError }, { data: evidence, error: evidenceError }] =
    await Promise.all([
      supabase
        .from("resume_versions")
        .select("*")
        .eq("user_id", userId)
        .eq("application_id", applicationId)
        .order("version_number", { ascending: false }),
      supabase
        .from("resume_version_items")
        .select("*")
        .eq("user_id", userId)
        .eq("application_id", applicationId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("resume_version_item_evidence")
        .select("*")
        .eq("user_id", userId)
        .eq("application_id", applicationId),
    ]);
  if (error || itemError || evidenceError) {
    throw new ResumeCustomizationRepositoryError(
      stableError(error ?? itemError ?? evidenceError),
    );
  }
  return hydrateVersions(versions ?? [], items ?? [], evidence ?? []);
}

async function getVersion(
  userId: string,
  applicationId: string,
  versionId: string,
): Promise<ResumeVersion | null> {
  const versions = await listVersions(userId, applicationId);
  return versions.find((version) => version.id === versionId) ?? null;
}

async function createVersion(input: {
  applicationId: string;
  runId: string;
  template: "simple" | "modern";
}): Promise<ResumeVersion> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_resume_version", {
    target_application_id: input.applicationId,
    target_source_run_id: input.runId,
    target_template: input.template,
  });
  if (error || !data) {
    throw new ResumeCustomizationRepositoryError(stableError(error));
  }
  const version = await getVersion(data.user_id, data.application_id, data.id);
  if (!version) {
    throw new ResumeCustomizationRepositoryError("resume-resource-not-found");
  }
  return version;
}

export const resumeCustomizationRepository = {
  createOrGet,
  claim,
  getOwned,
  getLatestRun,
  listRuns,
  complete,
  fail,
  listSuggestions,
  getSuggestion,
  review,
  createVersion,
  listVersions,
  getVersion,
};
