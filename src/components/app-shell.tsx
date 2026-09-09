import type { ReactNode } from "react";

import { getDictionary, getLocale } from "@/i18n/server";

import { AppShellView } from "./app-shell-view";

/**
 * Resolves the request's language and hands the markup everything it needs.
 *
 * The split is not ceremony: `@/i18n/server` is server-only, and importing it
 * anywhere in the same module makes the whole shell — every label, every
 * landmark, the account menu — unrenderable in a component test.
 */
export async function AppShell({
  children,
  email,
}: {
  children: ReactNode;
  email?: string;
}) {
  const [locale, dictionary] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <AppShellView locale={locale} dictionary={dictionary} email={email}>
      {children}
    </AppShellView>
  );
}
