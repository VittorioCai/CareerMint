import "server-only";

import { createClient } from "@/lib/supabase/server";

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
