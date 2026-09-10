import { getDictionary, getLocale } from "@/i18n/server";

import { AuthShellView, type AuthShellProps } from "./auth-shell-view";

/**
 * Resolves the request's language for the signed-out pages. Split from the
 * markup for the same reason the app shell is: `@/i18n/server` is server-only,
 * and a module that imports it cannot be rendered by a component test.
 */
export async function AuthShell(props: AuthShellProps) {
  const [locale, dictionary] = await Promise.all([getLocale(), getDictionary()]);
  return <AuthShellView {...props} locale={locale} dictionary={dictionary} />;
}
