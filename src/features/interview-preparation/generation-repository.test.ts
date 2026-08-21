// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { interviewQuestionGenerationRepository } from "./generation-repository";

const applicationId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
const questionId = "33333333-3333-4333-8333-333333333333";

describe("interview question generation review repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
  });

  it("lists owner-scoped generation runs and candidates with portable metadata", async () => {
    const runRow = {
      id: "55555555-5555-4555-8555-555555555555",
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      application_id: applicationId,
      input_hash: "a".repeat(64),
      schema_version: "interview-question-generation-v1",
      provider: "deepseek",
      model: "deepseek-chat",
      status: "succeeded",
      attempt_count: 1,
      result: null,
      error_code: null,
      error_message: null,
      request_id: "req-1",
      input_cache_hit_tokens: 0,
      input_cache_miss_tokens: 0,
      output_tokens: 0,
      estimated_cost: null,
      created_at: "2026-08-21T00:00:00.000Z",
      updated_at: "2026-08-21T00:01:00.000Z",
      completed_at: null,
    };
    const candidateRow = {
      id: candidateId,
      run_id: runRow.id,
      application_id: applicationId,
      user_id: runRow.user_id,
      sort_order: 1,
      category: "function",
      prompt: "Explain your approach",
      canonical_key: "explain your approach",
      source_excerpt: "approach",
      relevance_reason: "The role needs this skill.",
      status: "pending",
      question_id: null,
      created_at: "2026-08-21T00:00:00.000Z",
      updated_at: "2026-08-21T00:00:00.000Z",
    };
    const runQuery = Object.assign(
      Promise.resolve({ data: [runRow], error: null }),
      {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
      },
    );
    runQuery.select.mockReturnValue(runQuery);
    runQuery.eq.mockReturnValue(runQuery);
    runQuery.order.mockReturnValue(runQuery);
    const candidateQuery = Object.assign(
      Promise.resolve({ data: [candidateRow], error: null }),
      {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
      },
    );
    candidateQuery.select.mockReturnValue(candidateQuery);
    candidateQuery.eq.mockReturnValue(candidateQuery);
    candidateQuery.order.mockReturnValue(candidateQuery);
    mocks.from
      .mockReturnValueOnce(runQuery)
      .mockReturnValueOnce(candidateQuery);

    await expect(
      interviewQuestionGenerationRepository.listRuns(runRow.user_id),
    ).resolves.toMatchObject([{ id: runRow.id, applicationId }]);
    await expect(
      interviewQuestionGenerationRepository.listAllCandidates(runRow.user_id),
    ).resolves.toMatchObject([
      {
        id: candidateId,
        runId: runRow.id,
        userId: runRow.user_id,
        canonicalKey: candidateRow.canonical_key,
        createdAt: candidateRow.created_at,
        updatedAt: candidateRow.updated_at,
      },
    ]);
    expect(runQuery.eq).toHaveBeenCalledWith("user_id", runRow.user_id);
    expect(candidateQuery.eq).toHaveBeenCalledWith("user_id", runRow.user_id);
  });

  it("treats a null claim response as stable storage failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(
      interviewQuestionGenerationRepository.claim(candidateId, 0, "queued"),
    ).rejects.toMatchObject({ code: "interview-question-generation-storage-error" });
  });

  it("strictly maps accept dispositions and nullable question ids", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { candidate_id: candidateId, disposition: "new", question_id: questionId },
        { candidate_id: "44444444-4444-4444-8444-444444444444", disposition: "duplicate-common", question_id: null },
      ],
      error: null,
    });

    await expect(
      interviewQuestionGenerationRepository.accept({
        applicationId,
        candidateIds: [candidateId],
      }),
    ).resolves.toEqual([
      { candidateId, disposition: "new", questionId },
      {
        candidateId: "44444444-4444-4444-8444-444444444444",
        disposition: "duplicate-common",
        questionId: null,
      },
    ]);
  });

  it("treats a null or invalid accept response as stable storage failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(
      interviewQuestionGenerationRepository.accept({
        applicationId,
        candidateIds: [candidateId],
      }),
    ).rejects.toMatchObject({ code: "interview-question-generation-storage-error" });

    mocks.rpc.mockResolvedValue({
      data: [{ candidate_id: candidateId, disposition: "duplicate-common", question_id: questionId }],
      error: null,
    });
    await expect(
      interviewQuestionGenerationRepository.accept({
        applicationId,
        candidateIds: [candidateId],
      }),
    ).rejects.toMatchObject({ code: "interview-question-generation-storage-error" });
  });

  it("requires a nonnegative integer reject count", async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    await expect(
      interviewQuestionGenerationRepository.reject({
        runId: candidateId,
        candidateIds: [candidateId],
      }),
    ).resolves.toBe(0);

    for (const value of [null, -1, 1.5]) {
      mocks.rpc.mockResolvedValue({ data: value, error: null });
      await expect(
        interviewQuestionGenerationRepository.reject({
          runId: candidateId,
          candidateIds: [candidateId],
        }),
      ).rejects.toMatchObject({ code: "interview-question-generation-storage-error" });
    }
  });
});
