import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import type { ResumeExtractionJobResult } from "@/features/extraction/service";
import type { ExtractedFact } from "@/features/extraction/schemas";

export type ProcessingJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type ProcessingJob = {
  id: string;
  userId: string;
  entityId: string;
  status: ProcessingJobStatus;
  attemptCount: number;
  result: ResumeExtractionJobResult | null;
  errorCode: string | null;
};

export type SucceedJobInput = {
  jobId: string;
  assetId: string;
  acceptedFacts: ExtractedFact[];
  acceptedCount: number;
  rejectedCount: number;
  aiUsage: ResumeExtractionJobResult["ai"];
  estimatedCost: ResumeExtractionJobResult["estimatedCost"];
};

export type FailJobInput = {
  jobId: string;
  assetId: string;
  errorCode: string;
  errorMessage: string;
};

type JobRow = {
  id: string;
  user_id: string;
  entity_id: string;
  status: ProcessingJobStatus;
  attempt_count: number;
  result: Json | null;
  error_code: string | null;
};

export class ProcessingJobRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ProcessingJobRepositoryError";
  }
}

function toProcessingJob(row: JobRow): ProcessingJob {
  return {
    id: row.id,
    userId: row.user_id,
    entityId: row.entity_id,
    status: row.status,
    attemptCount: row.attempt_count,
    result: row.result as ResumeExtractionJobResult | null,
    errorCode: row.error_code,
  };
}

function repositoryError(code?: string) {
  if (code === "P0002") return "processing-job-not-found";
  if (code === "23505") return "processing-job-conflict";
  return "processing-job-storage-error";
}

export async function createOrGetJob(
  assetId: string,
  idempotencyKey: string,
): Promise<ProcessingJob> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_or_get_resume_job", {
    target_asset_id: assetId,
    target_key: idempotencyKey,
  });

  if (error || !data) {
    throw new ProcessingJobRepositoryError(repositoryError(error?.code));
  }
  return toProcessingJob(data);
}

export async function claimJob(jobId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_processing_job", {
    target_job_id: jobId,
  });

  if (error) {
    throw new ProcessingJobRepositoryError(repositoryError(error.code));
  }
  return data;
}

export async function getOwnedJob(
  userId: string,
  jobId: string,
): Promise<ProcessingJob | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new ProcessingJobRepositoryError(repositoryError(error.code));
  }
  return data ? toProcessingJob(data) : null;
}

export async function succeedJob(
  input: SucceedJobInput,
): Promise<ProcessingJob> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_resume_extraction", {
    target_job_id: input.jobId,
    target_asset_id: input.assetId,
    accepted_facts: input.acceptedFacts as Json,
    accepted_count: input.acceptedCount,
    rejected_count: input.rejectedCount,
    ai_usage: input.aiUsage as Json,
    estimated_cost: input.estimatedCost as Json,
  });

  if (error || !data) {
    throw new ProcessingJobRepositoryError(repositoryError(error?.code));
  }
  return toProcessingJob(data);
}

export async function failJob(input: FailJobInput): Promise<ProcessingJob> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fail_resume_extraction", {
    target_job_id: input.jobId,
    target_asset_id: input.assetId,
    target_error_code: input.errorCode,
    target_error_message: input.errorMessage,
  });

  if (error || !data) {
    throw new ProcessingJobRepositoryError(repositoryError(error?.code));
  }
  return toProcessingJob(data);
}
