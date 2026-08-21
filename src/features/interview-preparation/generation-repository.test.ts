// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
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
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
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
