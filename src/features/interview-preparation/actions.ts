"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";

import {
  interviewPreparationRepository,
  InterviewPreparationRepositoryError,
} from "./repository";
import {
  addInterviewQuestionSchema,
  addInterviewQuestionVariantSchema,
  updateInterviewQuestionSchema,
} from "./schemas";

export type InterviewActionState =
  | Record<string, never>
  | { ok: true; questionId: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

function actionError(error: unknown) {
  return error instanceof InterviewPreparationRepositoryError
    ? error.code
    : "interview-action-failed";
}

function values(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function revalidateInterview(applicationId: string | null) {
  revalidatePath("/interview");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function addInterviewQuestionAction(
  _previousState: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  await requireUser();
  const parsed = addInterviewQuestionSchema.safeParse(values(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const question = await interviewPreparationRepository.create(parsed.data);
    revalidateInterview(parsed.data.applicationId);
    return { ok: true, questionId: question.id };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function updateInterviewQuestionAction(
  _previousState: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  await requireUser();
  const parsed = updateInterviewQuestionSchema.safeParse({
    ...values(formData),
    factIds: formData.getAll("factIds"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    await interviewPreparationRepository.updatePreparation({
      questionId: parsed.data.questionId,
      preparationStatus: parsed.data.preparationStatus,
      answerOutline: parsed.data.answerOutline,
      notes: parsed.data.notes,
      factIds: parsed.data.factIds,
    });
    revalidateInterview(parsed.data.applicationId);
    return { ok: true, questionId: parsed.data.questionId };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function addInterviewQuestionVariantAction(
  _previousState: InterviewActionState,
  formData: FormData,
): Promise<InterviewActionState> {
  await requireUser();
  const parsed = addInterviewQuestionVariantSchema.safeParse(values(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    await interviewPreparationRepository.addVariant({
      questionId: parsed.data.questionId,
      wording: parsed.data.wording,
    });
    revalidateInterview(parsed.data.applicationId);
    return { ok: true, questionId: parsed.data.questionId };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}
