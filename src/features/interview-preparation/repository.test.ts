import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  listConfirmedFactsForAnalysis: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/features/jd-analysis/repository", () => ({
  listConfirmedFactsForAnalysis: mocks.listConfirmedFactsForAnalysis,
}));

import { interviewPreparationRepository } from "./repository";

const questionId = "22222222-2222-4222-8222-222222222222";
const factId = "33333333-3333-4333-8333-333333333333";

describe("interview preparation repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
  });

  it("saves preparation state and facts through one RPC", async () => {
    await interviewPreparationRepository.updatePreparation({
      questionId,
      preparationStatus: "outlined",
      answerOutline: "Situation → Action → Result",
      notes: "Practice aloud.",
      factIds: [factId],
    });

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "save_interview_question_preparation",
      {
        target_question_id: questionId,
        target_preparation_status: "outlined",
        target_answer_outline: "Situation → Action → Result",
        target_notes: "Practice aloud.",
        target_fact_ids: [factId],
      },
    );
  });

  it("maps atomic RPC validation failures without attempting a second write", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "22023" },
    });

    await expect(
      interviewPreparationRepository.updatePreparation({
        questionId,
        preparationStatus: "ready",
        answerOutline: null,
        notes: null,
        factIds: [factId],
      }),
    ).rejects.toMatchObject({ code: "invalid-interview-operation" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
