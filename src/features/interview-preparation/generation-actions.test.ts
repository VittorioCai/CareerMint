import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  repository: {
    accept: vi.fn(),
    reject: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("./generation-repository", () => ({
  InterviewQuestionGenerationRepositoryError: class extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  interviewQuestionGenerationRepository: mocks.repository,
}));

import {
  acceptInterviewQuestionCandidatesAction,
  rejectInterviewQuestionCandidatesAction,
} from "./generation-actions";

const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";

describe("interview question generation review actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    mocks.repository.accept.mockResolvedValue([
      { candidateId, disposition: "new", questionId: "44444444-4444-4444-8444-444444444444" },
    ]);
    mocks.repository.reject.mockResolvedValue(1);
  });

  it("requires auth, validates UUIDs, accepts selected candidates, and revalidates the application", async () => {
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.append("candidateIds", candidateId);

    await expect(acceptInterviewQuestionCandidatesAction({}, formData)).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.repository.accept).toHaveBeenCalledExactlyOnceWith({
      applicationId,
      candidateIds: [candidateId],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/applications/${applicationId}`,
    );
  });

  it("rejects malformed ids before touching the repository", async () => {
    const formData = new FormData();
    formData.set("applicationId", "not-an-id");
    formData.append("candidateIds", "also-not-an-id");

    await expect(acceptInterviewQuestionCandidatesAction({}, formData)).resolves.toMatchObject({
      ok: false,
      error: "invalid-input",
    });
    expect(mocks.repository.accept).not.toHaveBeenCalled();
  });

  it("rejects selected candidates through the owner-scoped run RPC", async () => {
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("runId", runId);
    formData.append("candidateIds", candidateId);

    await expect(rejectInterviewQuestionCandidatesAction({}, formData)).resolves.toEqual(
      expect.objectContaining({ ok: true, rejectedCount: 1 }),
    );
    expect(mocks.repository.reject).toHaveBeenCalledExactlyOnceWith({
      runId,
      candidateIds: [candidateId],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/applications/${applicationId}`,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/interview");
  });
});
