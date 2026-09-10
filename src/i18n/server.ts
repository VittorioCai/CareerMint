import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getOwnedProfile } from "@/features/account/repository";
import { getCurrentUser } from "@/lib/auth/require-user";

import type { Dictionary } from "./dictionaries/en";
import { dictionaryFor } from "./dictionary";
import { LOCALE_COOKIE, resolveLocale, type AppLocale } from "./locale";

/**
 * The language for this request.
 *
 * Wrapped in React's `cache` so the profile read happens once however many
 * server components ask. Without it, a page whose layout, header and three
 * panels each want a label would issue five identical queries.
 *
 * A signed-out visitor never touches the database: there is no profile to
 * read, and the cookie is the whole answer.
 */
export const getLocale = cache(async (): Promise<AppLocale> => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;

  const user = await getCurrentUser();
  if (!user) return resolveLocale({ cookieLocale });

  // A profile read must never be the reason a page fails to render. If the
  // row cannot be read, the cookie — and then English — still gives the
  // reader an interface.
  let profileLocale: string | null = null;
  try {
    profileLocale = (await getOwnedProfile(user.id))?.interfaceLocale ?? null;
  } catch {
    profileLocale = null;
  }

  return resolveLocale({ profileLocale, cookieLocale });
});

/** The whole dictionary for this request's language. */
export const getDictionary = cache(async (): Promise<Dictionary> => {
  return dictionaryFor(await getLocale());
});
