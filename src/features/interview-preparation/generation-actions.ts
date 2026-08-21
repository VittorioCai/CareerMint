"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";

import {
  InterviewQuestionGenerationRepositoryError,
  interviewQuestionGenerationRepository,
} from "./generation-repository";
import {
  acceptInterviewQuestionCandidatesSchema,
  rejectInterviewQuestionCandidatesSchema,
} from "./schemas";

export type InterviewGenerationActionState =
  | Record<string, never>
  | {
      ok: true;
      accepted: Array<{
        candidateId: string;
        disposition: "new" | "reused" | "duplicate-common";
        questionId: string | null;
      }>;
    }
  | { ok: true; rejectedCount: number }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

function actionError(error: unknown) {
  return error instanceof InterviewQuestionGenerationRepositoryError
    ? error.code
    : "interview-question-generation-action-failed";
}

function values(formData: FormData) {
  return {
    applicationId: formData.get("applicationId"),
    runId: formData.get("runId"),
    candidateIds: formData.getAll("candidateIds"),
  };
}

export async function acceptInterviewQuestionCandidatesAction(
  _previousState: InterviewGenerationActionState,
  formData: FormData,
): Promise<InterviewGenerationActionState> {
  await requireUser();
  const parsed = acceptInterviewQuestionCandidatesSchema.safeParse(values(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const accepted = await interviewQuestionGenerationRepository.accept(parsed.data);
    revalidatePath(`/applications/${parsed.data.applicationId}`);
    revalidatePath("/interview");
    return { ok: true, accepted };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function rejectInterviewQuestionCandidatesAction(
  _previousState: InterviewGenerationActionState,
  formData: FormData,
): Promise<InterviewGenerationActionState> {
  await requireUser();
  const parsed = rejectInterviewQuestionCandidatesSchema.safeParse(values(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const rejectedCount = await interviewQuestionGenerationRepository.reject({
      runId: parsed.data.runId,
      candidateIds: parsed.data.candidateIds,
    });
    revalidatePath(`/applications/${parsed.data.applicationId}`);
    return { ok: true, rejectedCount };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}
