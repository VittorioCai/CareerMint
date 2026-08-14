"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";

import {
  ResumeCustomizationRepositoryError,
  resumeCustomizationRepository,
} from "./repository";
import {
  resumeContentUsesOnlySupportedProtectedClaims,
  resumeSuggestionDecisionSchema,
} from "./schemas";

type ActionResult =
  | { ok: true }
  | { ok: true; versionId: string; versionNumber: number }
  | { ok: false; error: string };

const reviewInputSchema = z
  .object({
    applicationId: z.uuid(),
    suggestionId: z.uuid(),
    decision: resumeSuggestionDecisionSchema,
    reviewedContent: z.string().trim().min(1).max(700).nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.decision !== "accepted" && input.reviewedContent) {
      context.addIssue({
        code: "custom",
        path: ["reviewedContent"],
        message: "Only accepted suggestions may contain edited text.",
      });
    }
  });

const createVersionInputSchema = z.object({
  applicationId: z.uuid(),
  runId: z.uuid(),
  template: z.enum(["simple", "modern"]),
});

function actionError(error: unknown) {
  return error instanceof ResumeCustomizationRepositoryError
    ? error.code
    : "resume-action-failed";
}

export async function reviewResumeSuggestionAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-input" };

  try {
    if (
      parsed.data.decision === "accepted" &&
      parsed.data.reviewedContent
    ) {
      const suggestion = await resumeCustomizationRepository.getSuggestion(
        user.id,
        parsed.data.suggestionId,
      );
      if (
        !suggestion ||
        suggestion.applicationId !== parsed.data.applicationId ||
        suggestion.facts.length === 0 ||
        !resumeContentUsesOnlySupportedProtectedClaims(
          parsed.data.reviewedContent,
          suggestion.facts,
        )
      ) {
        return { ok: false, error: "unsupported-resume-claim" };
      }
    }
    await resumeCustomizationRepository.review({
      suggestionId: parsed.data.suggestionId,
      decision: parsed.data.decision,
      reviewedContent: parsed.data.reviewedContent ?? null,
    });
    revalidatePath(`/applications/${parsed.data.applicationId}`);
    revalidatePath(
      `/applications/${parsed.data.applicationId}/resume`,
      "layout",
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function createResumeVersionAction(
  input: unknown,
): Promise<ActionResult> {
  await requireUser();
  const parsed = createVersionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-input" };

  try {
    const version = await resumeCustomizationRepository.createVersion(
      parsed.data,
    );
    revalidatePath(`/applications/${parsed.data.applicationId}`);
    revalidatePath(
      `/applications/${parsed.data.applicationId}/resume`,
      "layout",
    );
    return {
      ok: true,
      versionId: version.id,
      versionNumber: version.versionNumber,
    };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}
