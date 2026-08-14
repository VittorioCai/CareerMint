"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";

import {
  applicationRepository,
  ApplicationRepositoryError,
} from "./repository";
import { newApplicationSchema, stageChangeSchema } from "./schemas";

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
