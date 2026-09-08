import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  // The real class, mocked: `actionError` narrows with `instanceof`, so a
  // repository mock without it turns every error path into a TypeError.
  CareerFactRepositoryError: class MockCareerFactRepositoryError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  repository: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("./repository", () => ({
  careerFactRepository: mocks.repository,
  CareerFactRepositoryError: mocks.CareerFactRepositoryError,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  confirmFactAction,
  createFactAction,
  deleteFactAction,
  markNeedsDetailAction,
  updateFactAction,
} from "./actions";
import { buildCareerFactUpdate } from "./schemas";

describe("career fact actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "user-a@example.com",
    });
    mocks.repository.setStatus.mockResolvedValue({ id: "fact-1" });
  });

  it("requires explicit confirmation before confirming a fact", async () => {
    await expect(
      confirmFactAction({ factId: "11111111-1111-4111-8111-111111111111", explicitConfirmation: false }),
    ).resolves.toEqual({ ok: false, error: "explicit-confirmation-required" });
    expect(mocks.repository.setStatus).not.toHaveBeenCalled();

    await expect(
      confirmFactAction({ factId: "11111111-1111-4111-8111-111111111111", explicitConfirmation: true }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.repository.setStatus).toHaveBeenCalledExactlyOnceWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "11111111-1111-4111-8111-111111111111",
      "confirmed",
    );
  });

  it("resets edited fact data to pending confirmation", () => {
    expect(
      buildCareerFactUpdate({
        factType: "work_experience",
        data: {
          title: "Senior Product Analyst",
          organization: "Example Ltd",
          startDate: "2024-01",
          endDate: null,
          description: "Built weekly product reports.",
          skills: ["SQL"],
        },
      }),
    ).toMatchObject({
      confirmation_status: "pending",
      confirmed_at: null,
    });
  });

  it("accepts the normalized language fact from the category form", async () => {
    mocks.repository.create.mockResolvedValue({ id: "fact-language" });
    const input = {
      factType: "language" as const,
      data: {
        title: "德语",
        organization: null,
        startDate: null,
        endDate: null,
        description: "熟练程度：B2\n证书或证明：Goethe B2",
        skills: [],
      },
    };

    await expect(createFactAction(input)).resolves.toEqual({ ok: true });
    expect(mocks.repository.create).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      input,
    );
  });

  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const factId = "11111111-1111-4111-8111-111111111111";
  const factInput = {
    factType: "work_experience" as const,
    data: {
      title: "Product Analyst",
      organization: "Northstar GmbH",
      startDate: null,
      endDate: null,
      description: "Built funnel reports for the sales team.",
      skills: ["SQL"],
    },
  };

  it("updates a fact with the id stripped back out of the payload", async () => {
    mocks.repository.update.mockResolvedValue({ id: factId });

    await expect(updateFactAction({ factId, ...factInput })).resolves.toEqual({
      ok: true,
    });
    // The id addresses the row; it is not part of the fact's content, and
    // resetting confirmation is the repository's job, not the action's.
    expect(mocks.repository.update).toHaveBeenCalledExactlyOnceWith(
      userId,
      factId,
      factInput,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/profile");
  });

  it("rejects an update whose payload is not a valid fact", async () => {
    await expect(
      updateFactAction({ factId, factType: "work_experience", data: {} }),
    ).resolves.toEqual({ ok: false, error: "invalid-input" });
    expect(mocks.repository.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an update addressed by something that is not a fact id", async () => {
    await expect(
      updateFactAction({ factId: "not-a-uuid", ...factInput }),
    ).resolves.toEqual({ ok: false, error: "invalid-input" });
    expect(mocks.repository.update).not.toHaveBeenCalled();
  });

  it("passes a repository failure code through when an update fails", async () => {
    mocks.repository.update.mockRejectedValue(
      new mocks.CareerFactRepositoryError("fact-not-found"),
    );

    await expect(updateFactAction({ factId, ...factInput })).resolves.toEqual({
      ok: false,
      error: "fact-not-found",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("hides an unrecognized update failure behind a stable code", async () => {
    mocks.repository.update.mockRejectedValue(new Error("connection reset"));

    await expect(updateFactAction({ factId, ...factInput })).resolves.toEqual({
      ok: false,
      error: "career-fact-action-failed",
    });
  });

  it("refuses to update anything for a caller who is not signed in", async () => {
    mocks.requireUser.mockRejectedValue(new Error("redirect"));

    // Deliberately invalid: a signed-out caller must be turned away before the
    // payload is inspected, not handed a validation verdict to probe with.
    await expect(updateFactAction({ factId: "nope" })).rejects.toThrow();
    await expect(updateFactAction({ factId, ...factInput })).rejects.toThrow();
    expect(mocks.repository.update).not.toHaveBeenCalled();
  });

  it("marks a fact as needing detail", async () => {
    await expect(markNeedsDetailAction({ factId })).resolves.toEqual({ ok: true });
    expect(mocks.repository.setStatus).toHaveBeenCalledExactlyOnceWith(
      userId,
      factId,
      "needs_detail",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/profile");
  });

  it("rejects a needs-detail request without a valid fact id", async () => {
    await expect(markNeedsDetailAction({ factId: "nope" })).resolves.toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(mocks.repository.setStatus).not.toHaveBeenCalled();
  });

  it("passes a repository failure code through when marking needs-detail", async () => {
    mocks.repository.setStatus.mockRejectedValue(
      new mocks.CareerFactRepositoryError("fact-not-found"),
    );

    await expect(markNeedsDetailAction({ factId })).resolves.toEqual({
      ok: false,
      error: "fact-not-found",
    });
  });

  it("refuses to mark anything for a caller who is not signed in", async () => {
    mocks.requireUser.mockRejectedValue(new Error("redirect"));

    await expect(markNeedsDetailAction({ factId: "nope" })).rejects.toThrow();
    await expect(markNeedsDetailAction({ factId })).rejects.toThrow();
    expect(mocks.repository.setStatus).not.toHaveBeenCalled();
  });

  it("deletes a fact", async () => {
    mocks.repository.remove.mockResolvedValue(undefined);

    await expect(deleteFactAction({ factId })).resolves.toEqual({ ok: true });
    expect(mocks.repository.remove).toHaveBeenCalledExactlyOnceWith(userId, factId);
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/profile");
  });

  it("rejects a delete without a valid fact id rather than guessing", async () => {
    await expect(deleteFactAction({})).resolves.toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(mocks.repository.remove).not.toHaveBeenCalled();
  });

  it("passes a repository failure code through when a delete fails", async () => {
    mocks.repository.remove.mockRejectedValue(
      new mocks.CareerFactRepositoryError("career-fact-storage-error"),
    );

    await expect(deleteFactAction({ factId })).resolves.toEqual({
      ok: false,
      error: "career-fact-storage-error",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses to delete anything for a caller who is not signed in", async () => {
    mocks.requireUser.mockRejectedValue(new Error("redirect"));

    await expect(deleteFactAction({})).rejects.toThrow();
    await expect(deleteFactAction({ factId })).rejects.toThrow();
    expect(mocks.repository.remove).not.toHaveBeenCalled();
  });

});
