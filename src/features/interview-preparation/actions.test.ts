import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  repository: {
    create: vi.fn(),
    updatePreparation: vi.fn(),
    addVariant: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("./repository", () => ({
  interviewPreparationRepository: mocks.repository,
}));

import {
  addInterviewQuestionAction,
  addInterviewQuestionVariantAction,
  updateInterviewQuestionAction,
} from "./actions";

const applicationId = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";
const factId = "33333333-3333-4333-8333-333333333333";

describe("interview preparation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    mocks.repository.create.mockResolvedValue({ id: questionId });
    mocks.repository.updatePreparation.mockResolvedValue(undefined);
    mocks.repository.addVariant.mockResolvedValue(undefined);
  });

  it("adds a validated question without accepting a forged user id", async () => {
    const formData = new FormData();
    formData.set("prompt", "How would you prioritize this roadmap?");
    formData.set("category", "job_specific");
    formData.set("applicationId", applicationId);
    formData.set("userId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

    await expect(addInterviewQuestionAction({}, formData)).resolves.toEqual({
      ok: true,
      questionId,
    });
    expect(mocks.repository.create).toHaveBeenCalledExactlyOnceWith({
      prompt: "How would you prioritize this roadmap?",
      category: "job_specific",
      applicationId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/interview");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/applications/${applicationId}`,
    );
  });

  it("rejects a job-specific question without an application", async () => {
    const formData = new FormData();
    formData.set("prompt", "How would you prioritize this roadmap?");
    formData.set("category", "job_specific");
    formData.set("applicationId", "");

    await expect(addInterviewQuestionAction({}, formData)).resolves.toMatchObject(
      { ok: false, error: "invalid-input" },
    );
    expect(mocks.repository.create).not.toHaveBeenCalled();
  });

  it("saves preparation state and only validated fact ids", async () => {
    const formData = new FormData();
    formData.set("questionId", questionId);
    formData.set("applicationId", applicationId);
    formData.set("preparationStatus", "outlined");
    formData.set("answerOutline", "  Situation → Action → Result  ");
    formData.set("notes", "  Practice aloud.  ");
    formData.append("factIds", factId);
    formData.append("factIds", factId);

    await expect(updateInterviewQuestionAction({}, formData)).resolves.toEqual({
      ok: true,
      questionId,
    });
    expect(
      mocks.repository.updatePreparation,
    ).toHaveBeenCalledExactlyOnceWith({
      questionId,
      preparationStatus: "outlined",
      answerOutline: "Situation → Action → Result",
      notes: "Practice aloud.",
      factIds: [factId],
    });
  });

  it("adds an alternate wording to one canonical question", async () => {
    const formData = new FormData();
    formData.set("questionId", questionId);
    formData.set("applicationId", "");
    formData.set("wording", "  Walk me through how you set priorities.  ");

    await expect(
      addInterviewQuestionVariantAction({}, formData),
    ).resolves.toEqual({ ok: true, questionId });
    expect(mocks.repository.addVariant).toHaveBeenCalledExactlyOnceWith({
      questionId,
      wording: "Walk me through how you set priorities.",
    });
  });
});
