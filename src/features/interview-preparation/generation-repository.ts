import "server-only";

import { z } from "zod";

import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import {
  interviewQuestionGenerationCandidateSchema,
  interviewQuestionGenerationCategorySchema,
} from "./generation-schemas";
import type {
  CompleteInterviewQuestionGenerationInput,
  FailInterviewQuestionGenerationInput,
  InterviewQuestionGenerationCandidateRecord,
  InterviewQuestionGenerationRun,
  InterviewQuestionGenerationRunResult,
} from "./generation-service";

type RunRow =
  Database["public"]["Tables"]["interview_question_generation_runs"]["Row"];
type CandidateRow =
  Database["public"]["Tables"]["interview_question_candidates"]["Row"];

const runStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
const candidateStatusSchema = z.enum(["pending", "accepted", "rejected"]);
const acceptanceDispositionSchema = z.enum([
  "new",
  "reused",
  "duplicate-common",
]);
const acceptanceRowSchema = z
  .object({
    candidate_id: z.uuid(),
    disposition: acceptanceDispositionSchema,
    question_id: z.uuid().nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.disposition === "duplicate-common" && row.question_id !== null) {
      context.addIssue({ code: "custom", path: ["question_id"] });
    }
    if (row.disposition !== "duplicate-common" && row.question_id === null) {
      context.addIssue({ code: "custom", path: ["question_id"] });
    }
  });
const runResultSchema = z.object({
  acceptedCandidateCount: z.number().int().nonnegative(),
  rejectedCandidateCount: z.number().int().nonnegative(),
  pendingCandidateCount: z.number().int().nonnegative(),
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

export class InterviewQuestionGenerationRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "InterviewQuestionGenerationRepositoryError";
  }
}

export type InterviewQuestionCandidateAcceptance = {
  candidateId: string;
  disposition: "new" | "reused" | "duplicate-common";
  questionId: string | null;
};

function stableError(error: { code?: string } | null) {
  if (error?.code === "P0002" || error?.code === "PGRST116") {
    return "interview-question-generation-not-found";
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return "invalid-interview-question-generation";
  }
  if (error?.code === "23505") return "interview-question-generation-conflict";
  return "interview-question-generation-storage-error";
}

function toRun(row: RunRow): InterviewQuestionGenerationRun {
  const status = runStatusSchema.safeParse(row.status);
  const result = row.result ? runResultSchema.safeParse(row.result) : null;
  if (!status.success || (result && !result.success)) {
    throw new InterviewQuestionGenerationRepositoryError(
      "invalid-stored-interview-question-generation",
    );
  }
  return {
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    inputHash: row.input_hash,
    schemaVersion: row.schema_version,
    provider: row.provider,
    model: row.model,
    status: status.data,
    attemptCount: row.attempt_count,
    result: result ? (result.data as InterviewQuestionGenerationRunResult) : null,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    requestId: row.request_id,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function toCandidate(
  row: CandidateRow,
): InterviewQuestionGenerationCandidateRecord {
  const candidate = interviewQuestionGenerationCandidateSchema.safeParse({
    category: row.category,
    prompt: row.prompt,
    sourceExcerpt: row.source_excerpt,
    relevanceReason: row.relevance_reason,
  });
  const category = interviewQuestionGenerationCategorySchema.safeParse(row.category);
  const status = candidateStatusSchema.safeParse(row.status);
  if (!candidate.success || !category.success || !status.success) {
    throw new InterviewQuestionGenerationRepositoryError(
      "invalid-stored-interview-question-candidate",
    );
  }
  return {
    ...candidate.data,
    id: row.id,
    runId: row.run_id,
    applicationId: row.application_id,
    status: status.data,
    questionId: row.question_id,
    sortOrder: row.sort_order,
  };
}

async function createOrGet(input: {
  applicationId: string;
  inputHash: string;
  schemaVersion: string;
  provider: string;
  model: string;
}): Promise<InterviewQuestionGenerationRun> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_or_get_interview_question_generation",
    {
      target_application_id: input.applicationId,
      target_input_hash: input.inputHash,
      target_schema_version: input.schemaVersion,
      target_provider: input.provider,
      target_model: input.model,
    },
  );
  if (error || !data) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  return toRun(data);
}

async function claim(
  runId: string,
  expectedAttemptCount: number,
  expectedStatus: "queued" | "running" | "failed",
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "claim_interview_question_generation",
    {
      target_run_id: runId,
      expected_attempt_count: expectedAttemptCount,
      expected_status: expectedStatus,
    },
  );
  if (error || data == null) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  return data;
}

async function getOwned(
  userId: string,
  runId: string,
): Promise<InterviewQuestionGenerationRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interview_question_generation_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  return data ? toRun(data) : null;
}

async function getLatestRun(
  userId: string,
  applicationId: string,
): Promise<InterviewQuestionGenerationRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interview_question_generation_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  return data ? toRun(data) : null;
}

async function listCandidates(
  userId: string,
  runId: string,
): Promise<InterviewQuestionGenerationCandidateRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interview_question_candidates")
    .select("*")
    .eq("user_id", userId)
    .eq("run_id", runId)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  return (data ?? []).map(toCandidate);
}

async function complete(
  input: CompleteInterviewQuestionGenerationInput,
): Promise<InterviewQuestionGenerationRun> {
  const supabase = await createClient();
  // The SQL contract intentionally accepts only the nested usage object. The
  // provider/model are derived from the locked run inside the RPC.
  const targetAiUsage = { usage: input.aiUsage.usage } as Json;
  const { data, error } = await supabase.rpc(
    "complete_interview_question_generation",
    {
      target_run_id: input.runId,
      expected_attempt_count: input.expectedAttemptCount,
      target_candidates: input.candidates as unknown as Json,
      target_rejected_candidate_count: input.rejectedCandidateCount,
      target_ai_usage: targetAiUsage,
      target_estimated_cost: input.estimatedCost as unknown as Json,
      target_request_id: input.requestId as unknown as string,
    },
  );
  if (error || !data) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  return toRun(data);
}

async function fail(
  input: FailInterviewQuestionGenerationInput,
): Promise<InterviewQuestionGenerationRun> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fail_interview_question_generation",
    {
      target_run_id: input.runId,
      expected_attempt_count: input.expectedAttemptCount,
      target_error_code: input.errorCode,
      target_error_message: input.errorMessage,
      target_request_id: input.requestId as unknown as string,
    },
  );
  if (error || !data) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  return toRun(data);
}

async function accept(input: {
  applicationId: string;
  candidateIds: string[];
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "accept_interview_question_candidates",
    {
      target_application_id: input.applicationId,
      target_candidate_ids: input.candidateIds,
    },
  );
  if (error || data == null) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  const parsed = z.array(acceptanceRowSchema).safeParse(data);
  if (!parsed.success) {
    throw new InterviewQuestionGenerationRepositoryError(
      "interview-question-generation-storage-error",
    );
  }
  return parsed.data.map((row): InterviewQuestionCandidateAcceptance => ({
    candidateId: row.candidate_id,
    disposition: row.disposition,
    questionId: row.question_id,
  }));
}

async function reject(input: { runId: string; candidateIds: string[] }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "reject_interview_question_candidates",
    {
      target_run_id: input.runId,
      target_candidate_ids: input.candidateIds,
    },
  );
  if (error || data == null || !Number.isInteger(data) || data < 0) {
    throw new InterviewQuestionGenerationRepositoryError(stableError(error));
  }
  return data;
}

export const interviewQuestionGenerationRepository = {
  createOrGet,
  claim,
  getOwned,
  getLatestRun,
  listCandidates,
  complete,
  fail,
  accept,
  reject,
};
