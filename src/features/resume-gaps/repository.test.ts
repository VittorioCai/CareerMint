// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createResumeGapRepository } from "./repository";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const appId = "11111111-1111-4111-8111-111111111111";
const analysisId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-08-24T00:00:00.000Z";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    application_id: appId,
    user_id: userId,
    analysis_run_id: analysisId,
    source_asset_id: assetId,
    source_filename: "resume.pdf",
    source_sha256: "a".repeat(64),
    input_hash: "b".repeat(64),
    provider: "deepseek",
    model: "deepseek-chat",
    status: "succeeded",
    attempt_count: 1,
    result: {
      acceptedItemCount: 1,
      coveredItemCount: 1,
      partialItemCount: 0,
      missingItemCount: 0,
      ai: {
        provider: "deepseek",
        model: "deepseek-chat",
        requestId: null,
        usage: { inputCacheHitTokens: 1, inputCacheMissTokens: 2, outputTokens: 3 },
        priceScheduleVersion: null,
      },
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

function client(overrides: Record<string, unknown> = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: row(), error: null });
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row(), error: null }),
  });
  return { rpc, from, ...overrides };
}

describe("resume gap repository", () => {
  it("maps run rows and calls the owner-safe create RPC with every binding", async () => {
    const supabase = client();
    const repository = createResumeGapRepository(async () => supabase as never);

    const run = await repository.createOrGet({
      applicationId: appId,
      analysisRunId: analysisId,
      sourceAssetId: assetId,
      inputHash: "b".repeat(64),
      provider: "deepseek",
      model: "deepseek-chat",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("create_or_get_resume_gap", {
      target_application_id: appId,
      target_analysis_run_id: analysisId,
      target_source_asset_id: assetId,
      target_input_hash: "b".repeat(64),
      target_provider: "deepseek",
      target_model: "deepseek-chat",
    });
    expect(run).toMatchObject({ id: runId, applicationId: appId, sourceAssetId: assetId });
  });

  it("passes the attempt token to claim, complete, and fail RPCs", async () => {
    const supabase = client();
    const repository = createResumeGapRepository(async () => supabase as never);

    await repository.claim(runId);
    await repository.complete({
      runId,
      expectedAttemptCount: 2,
      items: [{ requirementId: "55555555-5555-4555-8555-555555555555", resumeCoverage: "missing", resumeExcerpt: null }],
      aiUsage: {
        provider: "deepseek",
        model: "deepseek-chat",
        requestId: null,
        usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 0, outputTokens: 0 },
        priceScheduleVersion: null,
      },
      estimatedCost: null,
    });
    await repository.fail({
      runId,
      expectedAttemptCount: 2,
      errorCode: "resume-gap-failed",
      errorMessage: "safe",
    });

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, "claim_resume_gap", {
      target_run_id: runId,
      target_lease_seconds: 120,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, "complete_resume_gap", expect.objectContaining({
      target_run_id: runId,
      target_attempt_count: 2,
    }));
    expect(supabase.rpc).toHaveBeenNthCalledWith(3, "fail_resume_gap", {
      target_run_id: runId,
      target_attempt_count: 2,
      target_error_code: "resume-gap-failed",
      target_error_message: "safe",
    });
  });
});
