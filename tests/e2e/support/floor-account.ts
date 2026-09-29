/**
 * The account every floor spec walks its routes as, in either language.
 *
 * Each floor used to pin `interface_locale` to zh-CN and drive the forms by
 * their Chinese labels, so contrast, touch size, line measure and placeholder
 * copy were only ever measured in Chinese. English is the default language,
 * and its strings run one and a half to three times as long: the interface
 * most readers meet first was the one nothing had measured.
 *
 * Labels come from the dictionary, so a wording change does not reach in here,
 * and the locale is a parameter, so a floor runs once per language.
 */
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { dictionaryFor } from "@/i18n/dictionary";
import { LOCALE_COOKIE, type AppLocale } from "@/i18n/locale";

export const FLOOR_LOCALES = ["en", "zh-CN"] as const satisfies readonly AppLocale[];

export const password = "CareerMint123!";

function requiredEnv(name: string, suite: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${suite}-e2e-${name.toLowerCase()}-missing`);
  return value;
}

export function clients(suite: string) {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL", suite);
  return {
    admin: createClient(supabaseUrl, requiredEnv("SUPABASE_SECRET_KEY", suite), {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    account: createClient(
      supabaseUrl,
      requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", suite),
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
  };
}

export async function createUser(admin: SupabaseClient, suite: string) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `${suite}-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Floor Check" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error(`${suite}-e2e-user-not-created`);
  }
  return { email, userId: created.data.user.id };
}

/**
 * Signs in and gets past onboarding, in `locale`.
 *
 * The language is set in both places that decide it. The profile outranks the
 * cookie and covers every page behind the sign-in; the cookie covers the ones
 * in front of it, where there is no profile to read yet. The profile is
 * written before the browser loads anything, so the first render is already
 * in the language being measured.
 */
export async function prepareAccount(
  page: Page,
  account: SupabaseClient,
  email: string,
  locale: AppLocale,
) {
  const { auth, onboarding } = dictionaryFor(locale);

  const signedIn = await account.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const localed = await account
    .from("profiles")
    .update({ interface_locale: locale })
    .eq("user_id", signedIn.data.user.id);
  if (localed.error) throw localed.error;

  await page.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, domain: "127.0.0.1", path: "/" },
  ]);
  await page.goto("/login");
  await page.getByLabel(auth.email, { exact: true }).fill(email);
  await page.getByLabel(auth.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: auth.signIn, exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding|\/app/u);

  // Signing in lands on /app, which redirects a new account to /onboarding.
  // Reading the URL straight after the click can catch the /app leg of that,
  // skip the steps below, and leave every later route silently measuring the
  // onboarding page. A goto resolves redirects before it returns.
  await page.goto("/app");
  if (/\/onboarding/u.test(page.url())) {
    await page.getByLabel(onboarding.displayName, { exact: true }).fill("Floor Check");
    await page.getByLabel(onboarding.targetRole, { exact: true }).fill("Product Manager");
    await page.getByRole("button", { name: onboarding.saveGoals, exact: true }).click();
    await page.getByRole("button", { name: onboarding.skipForNow, exact: true }).click();
    await page.getByRole("button", { name: onboarding.enterWorkspace, exact: true }).click();
    // Without this the next goto races the redirect and lands back on
    // /onboarding.
    await page.waitForURL(/\/app/u);
  }
}

/**
 * Saves an application with nothing optional filled in unless asked, and
 * returns its id. That is the case that renders a placeholder if anything
 * does.
 */
export async function createApplication(
  page: Page,
  locale: AppLocale,
  jdText: string,
  optional: { location?: string } = {},
) {
  const { draft } = dictionaryFor(locale).applications;

  await page.goto("/applications/new");
  await page.getByLabel(draft.company, { exact: true }).fill("Northstar GmbH");
  await page.getByLabel(draft.role, { exact: true }).fill("Product Analyst");
  if (optional.location) {
    await page.getByLabel(draft.location, { exact: true }).fill(optional.location);
  }
  await page.getByLabel(draft.jdText, { exact: true }).fill(jdText);
  await page.getByRole("button", { name: draft.create, exact: true }).click();
  // The server action navigates; starting another goto mid-redirect aborts it.
  await page.waitForURL(/\/applications\/[0-9a-f-]+\?tab=resume/u);
  const id = new URL(page.url()).pathname.split("/").pop();
  if (!id) throw new Error("floor-e2e-application-id-missing");
  return id;
}
