import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  repository: {
    getSuggestion: vi.fn(),
    review: vi.fn(),
    createVersion: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: mocks.requireUser,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("./repository", () => ({
  resumeCustomizationRepository: mocks.repository,
}));

import {
  createResumeVersionAction,
  reviewResumeSuggestionAction,
} from "./actions";

const applicationId = "11111111-1111-4111-8111-111111111111";
const suggestionId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";

describe("resume customization actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    mocks.repository.review.mockResolvedValue(undefined);
    mocks.repository.getSuggestion.mockResolvedValue({
      id: suggestionId,
      applicationId,
      facts: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          factType: "achievement",
          title: "Checkout conversion improvement",
          organization: "Acme GmbH",
          description: "Improved checkout conversion by 18%.",
          skills: ["SQL"],
          sourceExcerpt: "Improved checkout conversion by 18%.",
        },
      ],
    });
    mocks.repository.createVersion.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      versionNumber: 1,
    });
  });

  it("validates, trims, and saves an edited accepted suggestion", async () => {
    await expect(
      reviewResumeSuggestionAction({
        applicationId,
        suggestionId,
        decision: "accepted",
        reviewedContent:
          "  Improved checkout conversion by 18% using SQL funnel analysis.  ",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.repository.review).toHaveBeenCalledExactlyOnceWith({
      suggestionId,
      decision: "accepted",
      reviewedContent:
        "Improved checkout conversion by 18% using SQL funnel analysis.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/applications/${applicationId}`,
    );
  });

  it("rejects malformed ids and reviewed text on rejected suggestions", async () => {
    await expect(
      reviewResumeSuggestionAction({
        applicationId: "not-an-id",
        suggestionId,
        decision: "accepted",
        reviewedContent: "Valid text",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid-input" });
    await expect(
      reviewResumeSuggestionAction({
        applicationId,
        suggestionId,
        decision: "rejected",
        reviewedContent: "This must not be saved",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid-input" });
    expect(mocks.repository.review).not.toHaveBeenCalled();
  });

  it("blocks edited numbers that are absent from the linked confirmed facts", async () => {
    await expect(
      reviewResumeSuggestionAction({
        applicationId,
        suggestionId,
        decision: "accepted",
        reviewedContent: "Improved checkout conversion by 40% using SQL.",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "unsupported-resume-claim",
    });
    expect(mocks.repository.review).not.toHaveBeenCalled();
  });

  it("creates an immutable version only from validated owned identifiers", async () => {
    await expect(
      createResumeVersionAction({
        applicationId,
        runId,
        template: "modern",
      }),
    ).resolves.toEqual({
      ok: true,
      versionId: "44444444-4444-4444-8444-444444444444",
      versionNumber: 1,
    });

    expect(mocks.repository.createVersion).toHaveBeenCalledExactlyOnceWith({
      applicationId,
      runId,
      template: "modern",
    });
  });
});
