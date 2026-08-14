import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { AccountPreferences } from "./schemas";

export type AccountProfile = {
  userId: string;
  displayName: string | null;
  interfaceLocale: string;
  timezone: string;
  targetRole: string | null;
  targetCountries: string[];
  jobSearchLanguage: string;
  aiProcessingConsentAt: string | null;
  onboardingCompletedAt: string | null;
};

export async function getOwnedProfile(
  userId: string,
): Promise<AccountProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("profile-storage-error");
  if (!data) return null;
  return {
    userId: data.user_id,
    displayName: data.display_name,
    interfaceLocale: data.interface_locale,
    timezone: data.timezone,
    targetRole: data.target_role,
    targetCountries: data.target_countries,
    jobSearchLanguage: data.job_search_language,
    aiProcessingConsentAt: data.ai_processing_consent_at,
    onboardingCompletedAt: data.onboarding_completed_at,
  };
}

export async function saveAccountPreferences(
  userId: string,
  preferences: AccountPreferences,
  changedAt: string,
): Promise<void> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("profiles")
    .update(
      {
        display_name: preferences.displayName,
        interface_locale: preferences.interfaceLocale,
        timezone: preferences.timezone,
        target_role: preferences.targetRole,
        target_countries: preferences.targetCountries,
        job_search_language: preferences.jobSearchLanguage,
        ai_processing_consent_at: preferences.aiProcessingAllowed
          ? changedAt
          : null,
        updated_at: changedAt,
      },
      { count: "exact" },
    )
    .eq("user_id", userId);

  if (error) throw new Error("profile-storage-error");
  if (count === 0) throw new Error("profile-not-found");
}

export async function completeOnboarding(
  userId: string,
  completedAt: string,
): Promise<void> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("profiles")
    .update(
      {
        onboarding_completed_at: completedAt,
        updated_at: completedAt,
      },
      { count: "exact" },
    )
    .eq("user_id", userId);

  if (error) throw new Error("profile-storage-error");
  if (count === 0) throw new Error("profile-not-found");
}

export async function getAIProcessingConsentAt(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("ai_processing_consent_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("profile-storage-error");
  return data?.ai_processing_consent_at ?? null;
}
