"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";

import {
  careerFactRepository,
  CareerFactRepositoryError,
} from "./repository";
import {
  careerFactInputSchema,
  transitionFactStatus,
} from "./schemas";

type ActionResult = { ok: true } | { ok: false; error: string };

const factIdSchema = z.uuid();
const updateFactSchema = careerFactInputSchema.extend({ factId: factIdSchema });
const factReferenceSchema = z.object({ factId: factIdSchema });
const confirmFactSchema = factReferenceSchema.extend({
  explicitConfirmation: z.boolean(),
});

function actionError(error: unknown) {
  return error instanceof CareerFactRepositoryError
    ? error.code
    : "career-fact-action-failed";
}

export async function createFactAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = careerFactInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-input" };

  try {
    await careerFactRepository.create(user.id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function updateFactAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateFactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-input" };

  const { factId, ...factInput } = parsed.data;
  try {
    await careerFactRepository.update(user.id, factId, factInput);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function confirmFactAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = confirmFactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-input" };

  const transition = transitionFactStatus(
    "pending",
    "confirmed",
    parsed.data.explicitConfirmation,
  );
  if (!transition.ok) return { ok: false, error: transition.reason };

  try {
    await careerFactRepository.setStatus(user.id, parsed.data.factId, "confirmed");
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function markNeedsDetailAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = factReferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-input" };

  try {
    await careerFactRepository.setStatus(
      user.id,
      parsed.data.factId,
      "needs_detail",
    );
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function deleteFactAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = factReferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-input" };

  try {
    await careerFactRepository.remove(user.id, parsed.data.factId);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}
