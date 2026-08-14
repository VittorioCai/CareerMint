"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";

import {
  completeOnboarding,
  saveAccountPreferences,
} from "./repository";
import { accountPreferencesSchema } from "./schemas";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveAccountPreferencesAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = accountPreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid-account-preferences" };

  try {
    await saveAccountPreferences(
      user.id,
      parsed.data,
      new Date().toISOString(),
    );
    revalidatePath("/app");
    revalidatePath("/onboarding");
    revalidatePath("/settings/account");
    return { ok: true };
  } catch {
    return { ok: false, error: "account-preferences-save-failed" };
  }
}

export async function completeOnboardingAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await completeOnboarding(user.id, new Date().toISOString());
    revalidatePath("/app");
    revalidatePath("/onboarding");
  } catch {
    return { ok: false, error: "onboarding-completion-failed" };
  }

  redirect("/app");
}
