import "server-only";

import { z } from "zod";

import type { AIUsage } from "@/features/extraction/provider";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { resumeJDDifferenceOutputSchema } from "./schemas";
import type { ResumeJDDifferenceOutput } from "./schemas";

type RunRow =
  Database["public"]["Tables"]["resume_jd_difference_runs"]["Row"];
type SupabaseFactory = typeof createClient;

const timestampSchema = z.iso.datetime({ offset: true });
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const statusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
const aiUsageSchema = z
  .object({
    provider: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(160),
    requestId: z.string().trim().min(1).max(200).nullable(),
    usage: z
      .object({
        inputCacheHitTokens: z.number().int().min(0),
        inputCacheMissTokens: z.number().int().min(0),
        outputTokens: z.number().int().min(0),
      })
      .strict(),
    priceScheduleVersion: z.string().trim().min(1).max(80).nullable(),
  })
  .strict();

const storedRunSchema = z
  .object({
    id: z.uuid(),
    applicationId: z.uuid(),
    userId: z.uuid(),
    sourceAssetId: z.uuid().nullable(),
    sourceFilename: z.string().trim().min(1).max(260),
    sourceSha256: sha256Schema,
    jdSha256: sha256Schema,
    factFingerprint: sha256Schema,
    inputHash: sha256Schema,
    provider: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(160),
    schemaVersion: z.string().trim().min(1).max(80),
    promptVersion: z.string().trim().min(1).max(80),
    policyVersion: z.string().trim().min(1).max(80),
    status: statusSchema,
    attemptCount: z.number().int().min(0).max(1000),
    result: resumeJDDifferenceOutputSchema.nullable(),
    aiUsage: aiUsageSchema.nullable(),
    estimatedCostUsd: z.number().min(0).nullable(),
    errorCode: z.string().trim().min(1).max(120).nullable(),
    errorMessage: z.string().trim().min(1).max(1000).nullable(),
    startedAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((run, context) => {
    if ((run.status === "succeeded") !== (run.result !== null)) {
      context.addIssue({ code: "custom", message: "Invalid result state." });
    }
    if ((run.status === "succeeded") !== (run.aiUsage !== null)) {
      context.addIssue({ code: "custom", message: "Invalid AI usage state." });
    }
    const failed = run.status === "failed";
    if (failed !== (run.errorCode !== null && run.errorMessage !== null)) {
      context.addIssue({ code: "custom", message: "Invalid error state." });
    }
  });

export type ResumeJDDifferenceRun = z.infer<typeof storedRunSchema>;
export type ResumeJDDifferenceAIUsage = z.infer<typeof aiUsageSchema>;
export type ResumeJDDifferenceFreshness = "current" | "stale" | "missing";
export type ResumeJDDifferenceRunView = {
  current: ResumeJDDifferenceRun | null;
  previousSucceeded: ResumeJDDifferenceRun | null;
  freshness: ResumeJDDifferenceFreshness;
};

export class ResumeJDDifferenceRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ResumeJDDifferenceRepositoryError";
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
    error?.message === "resume-jd-difference-run-not-claimable"
  ) {
    return "resume-jd-difference-not-found";
  }
  if (
    error?.code === "22023" ||
    error?.code === "23514" ||
    error?.message?.startsWith("invalid-resume-jd-difference") ||
    error?.message === "resume-source-metadata-mismatch"
  ) {
    return "invalid-resume-jd-difference";
  }
  if (
    error?.code === "23505" ||
    error?.message === "resume-jd-difference-conflict"
  ) {
    return "resume-jd-difference-conflict";
  }
  return "resume-jd-difference-storage-error";
}

function toRun(row: RunRow): ResumeJDDifferenceRun {
  const parsed = storedRunSchema.safeParse({
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    sourceAssetId: row.source_asset_id,
    sourceFilename: row.source_filename,
    sourceSha256: row.source_sha256,
    jdSha256: row.jd_sha256,
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
    aiUsage: row.ai_usage,
    estimatedCostUsd: row.estimated_cost_usd,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!parsed.success) {
    throw new ResumeJDDifferenceRepositoryError(
      "invalid-stored-resume-jd-difference",
    );
  }
  return parsed.data;
}

function asRun(data: RunRow | RunRow[] | null) {
  if (!data || Array.isArray(data)) {
    throw new ResumeJDDifferenceRepositoryError(
      "resume-jd-difference-storage-error",
    );
  }
  return toRun(data);
}

export function createResumeJDDifferenceRepository(
  getClient: SupabaseFactory = createClient,
) {
  async function createOrGet(input: {
    applicationId: string;
    sourceAssetId: string;
    sourceFilename: string;
    sourceSha256: string;
    jdSha256: string;
    factFingerprint: string;
    inputHash: string;
    provider: string;
    model: string;
    schemaVersion: string;
    promptVersion: string;
    policyVersion: string;
  }) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc(
      "create_or_get_resume_jd_difference",
      {
        target_application_id: input.applicationId,
        target_source_asset_id: input.sourceAssetId,
        target_source_filename: input.sourceFilename,
        target_source_sha256: input.sourceSha256,
        target_jd_sha256: input.jdSha256,
        target_fact_fingerprint: input.factFingerprint,
        target_input_hash: input.inputHash,
        target_provider: input.provider,
        target_model: input.model,
        target_schema_version: input.schemaVersion,
        target_prompt_version: input.promptVersion,
        target_policy_version: input.policyVersion,
      },
    );
    if (error || !data) {
      throw new ResumeJDDifferenceRepositoryError(stableError(error));
    }
    return asRun(data as RunRow);
  }

  async function claim(
    runId: string,
    expectedAttemptCount: number,
    expectedStatus: "queued" | "running" | "failed",
    leaseSeconds = 120,
  ) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc(
      "claim_resume_jd_difference",
      {
        target_run_id: runId,
        expected_attempt_count: expectedAttemptCount,
        expected_status: expectedStatus,
        stale_after_seconds: leaseSeconds,
      },
    );
    if (error || data == null) {
      throw new ResumeJDDifferenceRepositoryError(stableError(error));
    }
    return data;
  }

  async function complete(input: {
    runId: string;
    expectedAttemptCount: number;
    result: ResumeJDDifferenceOutput;
    aiUsage: ResumeJDDifferenceAIUsage;
    estimatedCostUsd: number | null;
  }) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc(
      "complete_resume_jd_difference",
      {
        target_run_id: input.runId,
        expected_attempt_count: input.expectedAttemptCount,
        target_result: input.result as unknown as Json,
        target_ai_usage: input.aiUsage as unknown as Json,
        target_estimated_cost_usd: input.estimatedCostUsd ?? undefined,
      },
    );
    if (error || !data) {
      throw new ResumeJDDifferenceRepositoryError(stableError(error));
    }
    return asRun(data as RunRow);
  }

  async function fail(input: {
    runId: string;
    expectedAttemptCount: number;
    errorCode: string;
    errorMessage: string;
  }) {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc("fail_resume_jd_difference", {
      target_run_id: input.runId,
      expected_attempt_count: input.expectedAttemptCount,
      target_error_code: input.errorCode,
      target_error_message: input.errorMessage,
    });
    if (error || !data) {
      throw new ResumeJDDifferenceRepositoryError(stableError(error));
    }
    return asRun(data as RunRow);
  }

  async function getOwned(userId: string, runId: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("resume_jd_difference_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("id", runId)
      .maybeSingle();
    if (error) throw new ResumeJDDifferenceRepositoryError(stableError(error));
    return data ? toRun(data as RunRow) : null;
  }

  async function getLatest(userId: string, applicationId: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("resume_jd_difference_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new ResumeJDDifferenceRepositoryError(stableError(error));
    return data ? toRun(data as RunRow) : null;
  }

  async function getLatestSucceeded(userId: string, applicationId: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("resume_jd_difference_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new ResumeJDDifferenceRepositoryError(stableError(error));
    return data ? toRun(data as RunRow) : null;
  }

  async function getByInputHash(userId: string, inputHash: string) {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from("resume_jd_difference_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("input_hash", inputHash)
      .maybeSingle();
    if (error) throw new ResumeJDDifferenceRepositoryError(stableError(error));
    return data ? toRun(data as RunRow) : null;
  }

  async function getView(
    userId: string,
    applicationId: string,
    expectedInputHash: string,
  ): Promise<ResumeJDDifferenceRunView> {
    const [latest, latestSucceeded] = await Promise.all([
      getLatest(userId, applicationId),
      getLatestSucceeded(userId, applicationId),
    ]);
    const current = latest?.inputHash === expectedInputHash ? latest : null;
    const previousSucceeded =
      latestSucceeded && latestSucceeded.id !== current?.id
        ? latestSucceeded
        : null;
    return {
      current,
      previousSucceeded,
      freshness: current ? "current" : previousSucceeded ? "stale" : "missing",
    };
  }

  return {
    createOrGet,
    claim,
    complete,
    fail,
    getOwned,
    getLatest,
    getLatestSucceeded,
    getByInputHash,
    getView,
  };
}

export const resumeJDDifferenceRepository =
  createResumeJDDifferenceRepository();

export function toResumeJDDifferenceAIUsage(input: {
  provider: string;
  model: string;
  requestId: string | null;
  usage: AIUsage;
  priceScheduleVersion: string | null;
}): ResumeJDDifferenceAIUsage {
  return aiUsageSchema.parse(input);
}
