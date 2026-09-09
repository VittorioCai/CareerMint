"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import {
  isAppLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
} from "./locale";

/**
 * Change the interface language.
 *
 * The cookie is always written, including for a signed-in user: it is what
 * makes the choice survive signing out, and what a signed-out visitor has
 * instead of a profile.
 *
 * The profile write is best-effort and reported. A failure there must not
 * take the page down or silently pretend the preference was saved — the
 * reader would see the language change now and change back on their next
 * device. The caller decides what to say about it.
 *
 * What this does not do: call an AI provider. Changing language never
 * re-runs an analysis, so it never costs anything. A result generated in one
 * language stays in that language until the user explicitly asks for another
 * run.
 */
export async function setInterfaceLocaleAction(
  locale: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAppLocale(locale)) return { ok: false, error: "invalid-locale" };

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });

  const user = await getCurrentUser();
  if (user) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ interface_locale: locale })
      .eq("user_id", user.id);
    if (error) return { ok: false, error: "locale-not-saved" };
  }

  // Every route renders text, so every route is stale.
  revalidatePath("/", "layout");
  return { ok: true };
}
