import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
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
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { confirmFactAction, createFactAction } from "./actions";
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
});
