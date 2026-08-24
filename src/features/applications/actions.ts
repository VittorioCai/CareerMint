"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";

import {
  applicationRepository,
  ApplicationRepositoryError,
} from "./repository";
import {
  applicationResumeSourceSchema,
  applicationDeleteSchema,
  newApplicationSchema,
  stageChangeSchema,
} from "./schemas";

export type ApplicationActionState =
  | Record<string, never>
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | { ok: true; applicationId: string };

function actionError(error: unknown) {
  return error instanceof ApplicationRepositoryError
    ? error.code
    : "application-action-failed";
}

function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createApplicationAction(
  _previousState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  await requireUser();
  const parsed = newApplicationSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const application = await applicationRepository.create(parsed.data);
    revalidatePath("/applications");
    revalidatePath("/app");
    return { ok: true, applicationId: application.id };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function changeApplicationStageAction(
  _previousState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  await requireUser();
  const parsed = stageChangeSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const application = await applicationRepository.changeStage(parsed.data);
    revalidatePath("/applications");
    revalidatePath(`/applications/${application.id}`);
    revalidatePath("/app");
    return { ok: true, applicationId: application.id };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function setApplicationResumeSourceAction(
  _previousState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  await requireUser();
  const parsed = applicationResumeSourceSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const application = await applicationRepository.setResumeSource(parsed.data);
    revalidatePath(`/applications/${application.id}`);
    revalidatePath("/applications");
    revalidatePath("/app");
    return { ok: true, applicationId: application.id };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function deleteApplicationAction(
  _previousState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  await requireUser();
  const parsed = applicationDeleteSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    const confirmationMissing = parsed.error.issues.some(
      (issue) => issue.path[0] === "confirmed",
    );
    return {
      ok: false,
      error: confirmationMissing
        ? "deletion-confirmation-required"
        : "invalid-input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await applicationRepository.remove(parsed.data.applicationId);
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }

  revalidatePath("/applications");
  revalidatePath("/app");
  if (parsed.data.redirectAfterDelete) redirect("/applications");
  return { ok: true, applicationId: parsed.data.applicationId };
}
