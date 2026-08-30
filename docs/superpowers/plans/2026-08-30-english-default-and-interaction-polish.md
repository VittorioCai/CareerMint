# English-default interface and interaction polish implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a complete English-default, Chinese-switchable CareerMint interface with locale-aware AI output, backward-compatible historical results, and restrained interaction polish.

**Architecture:** Add a small typed locale layer that resolves account preference, cookie, then English fallback without changing route paths. Version AI contracts and persist output locale so English and Chinese runs never share incompatible cache entries, while repository adapters preserve old Chinese results. Add motion with CSS and existing React/Next.js primitives, then verify in a Vercel preview before production.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase/PostgreSQL, Zod, Vitest, Testing Library, Playwright, Vercel.

---

## Execution order and boundaries

Tasks 1–5 form the interface-localization subsystem. Tasks 6–8 form the locale-aware AI subsystem and depend on the `AppLocale` contract from Task 1. Tasks 9–10 form the interaction-polish and release subsystem. Do not deploy a partial phase to production.

Before implementation, read these repository-version Next.js guides as required by `AGENTS.md`:

- `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`
- `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md`

## File map

### New locale files

- `src/i18n/locales.ts`: locale type, parser, labels, cookie name.
- `src/i18n/dictionary.ts`: typed dictionary contract and loader.
- `src/i18n/dictionaries/en.ts`: English source dictionary.
- `src/i18n/dictionaries/zh-CN.ts`: Chinese dictionary with exact key parity.
- `src/i18n/server.ts`: server-only locale resolution.
- `src/i18n/locale-action.ts`: authenticated/signed-out locale persistence.
- `src/components/locale-switcher.tsx`: language switch UI and pending feedback.
- `src/components/navigation-progress.tsx`: scoped route-pending indicator.
- `src/i18n/*.test.ts`: locale and dictionary tests.

### Database changes

- `supabase/migrations/202608300001_english_default_locale.sql`: new-profile default only.
- `supabase/migrations/202608300002_ai_output_locale.sql`: AI run locale metadata and RPC arguments.
- `supabase/tests/database/english_default_locale.test.sql`: existing/new profile behavior.
- `supabase/tests/database/ai_output_locale.test.sql`: locale ownership, validation, and idempotency.

### Existing feature groups

- Public/auth/shell: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/(auth)/**`, `src/app/auth/callback/**`, `src/components/app-*.tsx`, `src/components/auth-*.tsx`.
- Onboarding/account/privacy: `src/app/onboarding/**`, `src/features/onboarding/**`, `src/features/account/**`, `src/features/privacy/**`, `src/app/(app)/settings/**`.
- Applications/profile/interview: `src/app/(app)/**`, `src/features/applications/**`, `src/features/career-profile/**`, `src/features/interview-preparation/**`, `src/features/source-assets/**`.
- Resume/JD workflows: `src/features/jd-analysis/**`, `src/features/resume-gaps/**`, `src/features/resume-customization/**`, `src/features/resume-jd-difference/**`.
- Motion: `src/app/globals.css` and the existing controls above.

---

### Task 1: Typed locale and dictionary foundation

**Files:**
- Create: `src/i18n/locales.ts`
- Create: `src/i18n/dictionary.ts`
- Create: `src/i18n/dictionaries/en.ts`
- Create: `src/i18n/dictionaries/zh-CN.ts`
- Create: `src/i18n/locales.test.ts`
- Create: `src/i18n/dictionary.test.ts`

- [ ] **Step 1: Write failing locale tests**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, parseLocale } from "./locales";

describe("application locales", () => {
  it("defaults to English and accepts only released locales", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("zh-CN")).toBe("zh-CN");
    expect(parseLocale("de")).toBeNull();
    expect(parseLocale(undefined)).toBeNull();
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { dictionaries } from "./dictionary";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("localized dictionaries", () => {
  it("keeps English and Chinese keys identical", () => {
    expect(leafPaths(dictionaries["zh-CN"]).sort()).toEqual(
      leafPaths(dictionaries.en).sort(),
    );
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/i18n/locales.test.ts src/i18n/dictionary.test.ts`  
Expected: FAIL because the locale modules do not exist.

- [ ] **Step 3: Implement the locale contract**

```ts
export const APP_LOCALES = ["en", "zh-CN"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE = "careermint_locale";

export function parseLocale(value: unknown): AppLocale | null {
  return value === "en" || value === "zh-CN" ? value : null;
}

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  "zh-CN": "简体中文",
};
```

Define `en.ts` as the source object using `as const`, and define `zh-CN.ts` with `satisfies DictionaryShape`. Begin with complete namespaces `common`, `auth`, `shell`, `home`, `applications`, `careerProfile`, `differenceAnalysis`, `improvements`, `interview`, `settings`, `errors`, and `emails`; do not use placeholder values.

```ts
import { en } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";
import type { AppLocale } from "./locales";

export type DictionaryShape = {
  [K in keyof typeof en]: {
    [P in keyof (typeof en)[K]]: string;
  };
};

export const dictionaries: Record<AppLocale, DictionaryShape> = {
  en,
  "zh-CN": zhCN,
};

export function dictionaryFor(locale: AppLocale): DictionaryShape {
  return dictionaries[locale];
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm vitest run src/i18n/locales.test.ts src/i18n/dictionary.test.ts && pnpm typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n
git commit -m "feat: add typed English and Chinese dictionaries"
```

---

### Task 2: Locale resolution and English default for new users

**Files:**
- Create: `src/i18n/server.ts`
- Create: `src/i18n/server.test.ts`
- Create: `supabase/migrations/202608300001_english_default_locale.sql`
- Create: `supabase/tests/database/english_default_locale.test.sql`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/features/account/repository.ts`

- [ ] **Step 1: Write failing resolver tests around a pure precedence function**

```ts
import { describe, expect, it } from "vitest";
import { chooseLocale } from "./server";

describe("chooseLocale", () => {
  it("prefers an authenticated profile over a cookie", () => {
    expect(chooseLocale("zh-CN", "en")).toBe("zh-CN");
  });

  it("uses a valid cookie for signed-out visitors", () => {
    expect(chooseLocale(null, "zh-CN")).toBe("zh-CN");
  });

  it("falls back to English", () => {
    expect(chooseLocale(null, "de")).toBe("en");
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm vitest run src/i18n/server.test.ts`  
Expected: FAIL because `chooseLocale` is not implemented.

- [ ] **Step 3: Implement server resolution**

```ts
import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale, type AppLocale } from "./locales";

export function chooseLocale(profileValue: unknown, cookieValue: unknown): AppLocale {
  return parseLocale(profileValue) ?? parseLocale(cookieValue) ?? DEFAULT_LOCALE;
}

export async function signedOutLocale(): Promise<AppLocale> {
  const store = await cookies();
  return chooseLocale(null, store.get(LOCALE_COOKIE)?.value);
}
```

Authenticated layout code must fetch the owned profile once and pass `locale` plus the matching dictionary to `AppShell`. Do not perform a second profile read inside child controls.

- [ ] **Step 4: Add the non-destructive database default migration**

```sql
alter table public.profiles
  alter column interface_locale set default 'en';

do $$
begin
  if exists (
    select 1 from public.profiles
    where interface_locale not in ('en', 'zh-CN')
  ) then
    raise exception 'invalid existing interface locale';
  end if;
end
$$;
```

The pgTAP test must insert a new profile without specifying `interface_locale`, assert `en`, and assert that an explicitly inserted `zh-CN` row remains `zh-CN`.

- [ ] **Step 5: Make root metadata and document language locale-aware**

Use `generateMetadata` with the signed-out locale for public pages. Render `<html lang={locale}>`; do not add locale route segments.

- [ ] **Step 6: Run database and application tests**

Run: `pnpm vitest run src/i18n/server.test.ts src/features/account/schemas.test.ts && pnpm typecheck`  
Expected: PASS.

If local Supabase is available, run: `pnpm db:reset && pnpm test:db`  
Expected: all pgTAP suites PASS, including `english_default_locale.test.sql`.

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx src/app/'(app)'/layout.tsx src/features/account/repository.ts src/i18n/server.ts src/i18n/server.test.ts supabase/migrations/202608300001_english_default_locale.sql supabase/tests/database/english_default_locale.test.sql
git commit -m "feat: default new accounts to English"
```

---

### Task 3: Language switch that preserves route and avoids AI calls

**Files:**
- Create: `src/i18n/locale-action.ts`
- Create: `src/i18n/locale-action.test.ts`
- Create: `src/components/locale-switcher.tsx`
- Create: `src/components/locale-switcher.test.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/auth-shell.tsx`
- Modify: `src/features/account/preferences-form.tsx`

- [ ] **Step 1: Write failing component behavior tests**

```tsx
it("saves the selected locale and refreshes without navigation", async () => {
  const saveLocale = vi.fn().mockResolvedValue({ ok: true });
  const refresh = vi.fn();
  render(<LocaleSwitcher locale="en" saveLocale={saveLocale} refresh={refresh} />);
  await userEvent.click(screen.getByRole("button", { name: "简体中文" }));
  expect(saveLocale).toHaveBeenCalledWith("zh-CN");
  expect(refresh).toHaveBeenCalledOnce();
});

it("shows an error and does not claim success when persistence fails", async () => {
  const saveLocale = vi.fn().mockResolvedValue({ ok: false, error: "locale-save-failed" });
  render(<LocaleSwitcher locale="en" saveLocale={saveLocale} refresh={() => undefined} />);
  await userEvent.click(screen.getByRole("button", { name: "简体中文" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Could not change language");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/components/locale-switcher.test.tsx`  
Expected: FAIL because the switcher does not exist.

- [ ] **Step 3: Implement the persistence action**

The server action validates `AppLocale` and returns a stable error code. For an authenticated user it updates `profiles.interface_locale` first and writes a one-year `SameSite=Lax` cookie only after the profile update succeeds. For a signed-out visitor it writes the cookie directly. It must not call any analysis or generation service.

```ts
export type SaveLocaleResult =
  | { ok: true }
  | { ok: false; error: "invalid-locale" | "locale-save-failed" };
```

- [ ] **Step 4: Implement the switcher**

Use `useTransition`, call the supplied action, and call `router.refresh()` only on success. The button labels come from the dictionary, have a 44 px mobile target, expose `aria-current`, and restore focus after refresh.

- [ ] **Step 5: Integrate the control**

Add the switcher to the desktop account area, mobile navigation/account area, public auth shell, and account preferences form. Saving account preferences must keep the language cookie synchronized with the saved profile locale.

- [ ] **Step 6: Run focused tests**

Run: `pnpm vitest run src/i18n/locale-action.test.ts src/components/locale-switcher.test.tsx src/components/app-shell.test.tsx src/features/account/schemas.test.ts`  
Expected: PASS and no analyze/generate mock is called.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/locale-action.ts src/i18n/locale-action.test.ts src/components/locale-switcher.tsx src/components/locale-switcher.test.tsx src/components/app-shell.tsx src/components/auth-shell.tsx src/features/account/preferences-form.tsx
git commit -m "feat: add persistent language switching"
```

---

### Task 4: Localize public, authentication, onboarding, and shared shell surfaces

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/login/auth-form.tsx`
- Modify: `src/app/(auth)/login/auth-form.test.tsx`
- Modify: `src/app/(auth)/forgot-password/page.tsx`
- Modify: `src/app/(auth)/forgot-password/reset-request-form.tsx`
- Modify: `src/app/(auth)/reset-password/page.tsx`
- Modify: `src/app/(auth)/reset-password/update-password-form.tsx`
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/app/auth/callback/route.test.ts`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/features/onboarding/onboarding-form.tsx`
- Modify: `src/features/onboarding/onboarding-form.test.tsx`
- Modify: `src/components/app-navigation.ts`
- Modify: `src/components/app-navigation.test.ts`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/app-shell.test.tsx`
- Modify: `src/components/auth-feedback.tsx`
- Modify: `src/components/coming-soon-page.tsx`

- [ ] **Step 1: Add failing representative English/Chinese tests**

For every surface group, assert one English heading/action and one Chinese heading/action by passing the locale or dictionary explicitly.

```tsx
render(<AuthForm mode="login" locale="en" dictionary={dictionaries.en.auth} />);
expect(screen.getByRole("heading", { name: "Welcome back" })).toBeVisible();
expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
```

```tsx
render(<AuthForm mode="login" locale="zh-CN" dictionary={dictionaries["zh-CN"].auth} />);
expect(screen.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
expect(screen.getByRole("button", { name: "登录" })).toBeVisible();
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm vitest run src/app/page.test.tsx src/app/'(auth)'/login/auth-form.test.tsx src/features/onboarding/onboarding-form.test.tsx src/components/app-navigation.test.ts src/components/app-shell.test.tsx src/app/auth/callback/route.test.ts`  
Expected: FAIL because the components still own Chinese strings.

- [ ] **Step 3: Move public/auth/onboarding strings into dictionaries**

Replace product-owned literals with dictionary values. Keep email addresses, filenames, user names, target roles, and uploaded text untouched. Map stable auth error codes to localized copy at render time; do not localize internal error codes.

- [ ] **Step 4: Preserve locale through auth callbacks**

The callback accepts only a validated locale from cookie/state, redirects to the existing safe path, and uses localized success/failure feedback. Invalid locale input falls back to English and must not permit an open redirect.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run src/app/page.test.tsx src/app/'(auth)'/login/auth-form.test.tsx src/features/onboarding/onboarding-form.test.tsx src/components/app-navigation.test.ts src/components/app-shell.test.tsx src/app/auth/callback/route.test.ts && pnpm typecheck`  
Expected: PASS.

```bash
git add src/app src/components src/features/onboarding src/i18n/dictionaries
git commit -m "feat: localize public auth and onboarding surfaces"
```

---

### Task 5: Localize all authenticated feature surfaces

**Files:**
- Modify: `src/app/(app)/app/page.tsx`
- Modify: `src/app/(app)/applications/page.tsx`
- Modify: `src/app/(app)/applications/new/page.tsx`
- Modify: `src/app/(app)/applications/[id]/page.tsx`
- Modify: `src/app/(app)/applications/[id]/resume/[resourceId]/page.tsx`
- Modify: `src/app/(app)/profile/page.tsx`
- Modify: `src/app/(app)/interview/page.tsx`
- Modify: `src/app/(app)/settings/account/page.tsx`
- Modify: `src/app/(app)/settings/privacy/page.tsx`
- Modify: all user-facing `.tsx` files under `src/features/applications`, `career-profile`, `interview-preparation`, `source-assets`, `jd-analysis`, `resume-gaps`, `resume-customization`, `resume-jd-difference`, `account`, and `privacy`
- Modify: corresponding component tests

- [ ] **Step 1: Add a user-visible-literal audit test**

Create `src/i18n/user-visible-copy.test.ts` that scans the listed `.tsx` directories and fails on newly introduced product-owned Han-script literals outside the Chinese dictionary. Maintain a small explicit allowlist for fixture data and intentional source excerpts; do not allow whole files.

```ts
expect(violations).toEqual([]);
```

- [ ] **Step 2: Run the audit and confirm failure**

Run: `pnpm vitest run src/i18n/user-visible-copy.test.ts`  
Expected: FAIL and list current product-owned Chinese literals.

- [ ] **Step 3: Localize pages by feature boundary**

Use server-resolved feature dictionaries for pages and explicit dictionary props for client components. Preserve enum and storage values; translate only display labels. Specifically cover application stages, fact types, requirement types, authenticity states, priority labels, resume sections, interview statuses, upload/OCR states, errors, empty states, and exported product-owned headings.

- [ ] **Step 4: Add representative bilingual component assertions**

Update each existing component suite to render English and Chinese for at least its primary heading, action, empty state, and error state. Keep existing behavioral assertions unchanged.

- [ ] **Step 5: Run feature tests in groups**

Run:

```bash
pnpm vitest run src/features/applications src/features/career-profile src/features/source-assets
pnpm vitest run src/features/jd-analysis src/features/resume-gaps src/features/resume-customization src/features/resume-jd-difference
pnpm vitest run src/features/interview-preparation src/features/account src/features/privacy src/i18n/user-visible-copy.test.ts
pnpm typecheck
```

Expected: all PASS; the literal audit reports no unapproved product-owned Chinese UI strings.

- [ ] **Step 6: Commit**

```bash
git add src/app/'(app)' src/features src/i18n
git commit -m "feat: localize authenticated product surfaces"
```

---

### Task 6: Persist AI output locale without rewriting historical data

**Files:**
- Create: `supabase/migrations/202608300002_ai_output_locale.sql`
- Create: `supabase/tests/database/ai_output_locale.test.sql`
- Modify: `src/lib/supabase/database.types.ts` via `pnpm db:types`
- Modify: AI run repository tests under `src/features/extraction`, `jd-analysis`, `resume-gaps`, `resume-customization`, `resume-jd-difference`, and `interview-preparation`

- [ ] **Step 1: Write failing pgTAP coverage**

Assert that released historical rows backfill to `zh-CN`, new create-or-get RPCs reject invalid locales, and identical inputs in different locales create distinct run identities.

- [ ] **Step 2: Run database tests and confirm failure**

Run: `pnpm db:reset && pnpm test:db`  
Expected: the new locale tests FAIL because columns and RPC parameters do not exist.

- [ ] **Step 3: Add locale metadata**

Add `output_locale text not null default 'en' check (output_locale in ('en','zh-CN'))` to:

- `application_analysis_runs`
- `interview_question_generation_runs`
- `jd_structure_runs`
- `jd_gap_v3_runs`
- `resume_gap_runs`
- `resume_generation_runs`
- `resume_jd_difference_runs`

Backfill rows created before this migration to `zh-CN` before applying the new default. Update create-or-get RPCs so `target_output_locale` participates in reuse comparisons. Do not change ownership or RLS policies.

- [ ] **Step 4: Regenerate types and run database tests**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db`  
Expected: PASS.

- [ ] **Step 5: Update repository mappings and tests**

Every run view exposes `outputLocale: AppLocale`; repository parsers reject invalid stored values. Known released rows without locale in test fixtures are explicitly marked `zh-CN` rather than silently defaulted.

- [ ] **Step 6: Run repository tests and commit**

Run: `pnpm vitest run src/features/extraction src/features/jd-analysis src/features/resume-gaps src/features/resume-customization src/features/resume-jd-difference src/features/interview-preparation`  
Expected: PASS.

```bash
git add supabase/migrations/202608300002_ai_output_locale.sql supabase/tests/database/ai_output_locale.test.sql src/lib/supabase/database.types.ts src/features
git commit -m "feat: persist AI output locale"
```

---

### Task 7: Locale-aware AI contracts, prompts, and fingerprints

**Files:**
- Modify: `src/features/extraction/provider.ts`
- Modify: `src/features/extraction/deepseek-extractor.ts`
- Modify: prompt/schema/service/http/hash files in `jd-analysis`, `resume-gaps`, `resume-customization`, `resume-jd-difference`, and `interview-preparation`
- Create: locale-neutral schema adapters beside each versioned AI schema
- Modify: related tests and fake providers

- [ ] **Step 1: Add failing provider and fingerprint tests**

```ts
expect(provider.analyzeDifference).toHaveBeenCalledWith(
  expect.objectContaining({ outputLocale: "en" }),
);
expect(englishFingerprints.inputHash).not.toBe(chineseFingerprints.inputHash);
```

For each workflow, also assert that switching interface locale alone does not invoke the provider; only an explicit POST/action does.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm vitest run src/features/extraction/provider.test.ts src/features/resume-jd-difference/hashes.test.ts src/features/interview-preparation/generation-service.test.ts`  
Expected: FAIL because provider options and hashes do not include locale.

- [ ] **Step 3: Add `outputLocale` to provider and service boundaries**

```ts
export type LocalizedAIRequest = {
  outputLocale: AppLocale;
};
```

All explicit analyze/generate routes resolve the authenticated profile locale and pass it through HTTP validation, service input, provider input, run creation, and completion. Tests and CI fake providers return deterministic output in the requested language.

- [ ] **Step 4: Introduce locale-neutral schema versions**

Do not store English content in `*Zh` fields. Add new schema versions with neutral field names such as `summary`, `translation`, `problem`, `reason`, and `direction`. Keep legacy schemas and adapt both versions into the same internal view model at repository boundaries.

```ts
type LocalizedTextResult = {
  outputLocale: AppLocale;
  summary: string;
};
```

- [ ] **Step 5: Make prompts language explicit**

Use a shared instruction function:

```ts
export function outputLanguageInstruction(locale: AppLocale): string {
  return locale === "en"
    ? "Write all explanations and guidance in English. Preserve source excerpts verbatim."
    : "所有解释和方向使用简体中文；资料原文必须保持原样。";
}
```

Append it before variant-specific instructions so fixed prompt prefixes remain cache-friendly. Increment prompt and schema versions. Locale must participate in input hashes and create-or-get reuse checks.

- [ ] **Step 6: Run contract, provider, and service tests**

Run:

```bash
pnpm vitest run src/features/extraction
pnpm vitest run src/features/jd-analysis src/features/resume-gaps
pnpm vitest run src/features/resume-customization src/features/resume-jd-difference
pnpm vitest run src/features/interview-preparation
pnpm typecheck
```

Expected: PASS, including legacy Chinese fixtures and new English fixtures.

- [ ] **Step 7: Commit**

```bash
git add src/features src/i18n
git commit -m "feat: generate and cache AI output by locale"
```

---

### Task 8: Historical-result language labels and localized exports

**Files:**
- Modify: `src/features/jd-analysis/requirements-panel.tsx`
- Modify: `src/features/resume-gaps/gap-panel.tsx`
- Modify: `src/features/resume-customization/resume-editor.tsx`
- Modify: `src/features/resume-jd-difference/difference-panel.tsx`
- Modify: `src/features/resume-jd-difference/improvement-panel.tsx`
- Modify: `src/features/interview-preparation/components.tsx`
- Modify: Markdown/export builders and route tests

- [ ] **Step 1: Add failing historical compatibility tests**

```tsx
render(<ResumeJDDifferencePanel locale="en" run={legacyChineseRun} applicationId="app-1" />);
expect(screen.getByText("Generated in Chinese")).toBeVisible();
expect(screen.getByText(legacyChineseRun.result.overallDifference.summaryZh)).toBeVisible();
expect(analyzeAgain).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/features/resume-jd-difference/difference-panel.test.tsx src/features/resume-jd-difference/improvement-panel.test.tsx`  
Expected: FAIL because result language is not displayed.

- [ ] **Step 3: Render output-locale chips and compatibility views**

Show the run language near result identity/freshness. A different interface locale does not hide the result. Offer an explicit localized re-analyze action only where that action already exists; never trigger it from the switcher.

- [ ] **Step 4: Localize product-owned export structure**

Export headings and filenames use the run output locale, while source excerpts remain verbatim. Keep stable API errors and current ownership checks.

- [ ] **Step 5: Run panel and export tests, then commit**

Run: `pnpm vitest run src/features/resume-jd-difference src/features/resume-gaps src/features/resume-customization src/features/interview-preparation src/app/api`  
Expected: PASS.

```bash
git add src/features src/app/api
git commit -m "feat: preserve and label historical result languages"
```

---

### Task 9: Interaction polish, progress feedback, and reduced motion

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/navigation-progress.tsx`
- Create: `src/components/navigation-progress.test.tsx`
- Modify: `src/components/nav-link.tsx`
- Modify: application-detail tab navigation
- Modify: analysis/generation controls in `jd-analysis`, `resume-gaps`, `resume-customization`, `resume-jd-difference`, and `interview-preparation`
- Modify: relevant component tests

- [ ] **Step 1: Write failing pending and duplicate-submit tests**

```tsx
await userEvent.click(screen.getByRole("button", { name: "Start difference analysis" }));
expect(screen.getByRole("button")).toBeDisabled();
expect(screen.getByRole("status")).toHaveTextContent("Comparing requirements");
await userEvent.click(screen.getByRole("button"));
expect(startAnalysis).toHaveBeenCalledTimes(1);
```

Add a reduced-motion assertion that the root motion class is omitted or duration variables resolve to zero under the injected preference.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/components/navigation-progress.test.tsx src/features/resume-jd-difference/analysis-control.test.tsx src/features/interview-preparation/generation-control.test.tsx`  
Expected: FAIL on staged progress or pending behavior.

- [ ] **Step 3: Add global motion tokens**

```css
:root {
  --motion-fast: 140ms;
  --motion-normal: 200ms;
  --motion-ease-out: cubic-bezier(.2,.8,.2,1);
}

@media (prefers-reduced-motion: reduce) {
  :root { --motion-fast: 0ms; --motion-normal: 0ms; }
  *, *::before, *::after { scroll-behavior: auto !important; }
}

.surface-enter {
  animation: surface-enter var(--motion-normal) var(--motion-ease-out) both;
}

@keyframes surface-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 4: Add scoped navigation feedback**

Follow the repository Next.js `use-link-status` guide. Show pending feedback on the selected link/tab without replacing the stable application header or using a full-screen spinner. Preserve application ID, query string, and active tab.

- [ ] **Step 5: Add staged analysis feedback**

Each existing control exposes localized stage copy, prevents duplicate submission, retains the prior successful result while rerunning, and renders retry next to the trigger on failure. Do not create fake percentage progress.

- [ ] **Step 6: Polish disclosure, contrast, and responsive behavior**

Use native `details` semantics, rotate indicators with the motion tokens, keep matched content collapsed, ensure 44 px mobile primary targets, replace white text on coral with ink, stop using `--ink-soft` for small text, and collapse dense two-column content before it overflows.

- [ ] **Step 7: Run component tests and visual-width checks**

Run: `pnpm vitest run src/components src/features/resume-jd-difference src/features/interview-preparation src/features/jd-analysis src/features/resume-customization && pnpm typecheck`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/components src/features src/app/'(app)'/applications
git commit -m "feat: polish navigation and analysis feedback"
```

---

### Task 10: Full verification and Vercel preview handoff

**Files:**
- Modify: Playwright specs under `tests/e2e` or the repository's current Playwright directory
- Modify: `README.md` or deployment notes only if the locale behavior needs operator documentation

- [ ] **Step 1: Add end-to-end coverage**

Cover these exact scenarios:

1. signed-out visitor starts in English;
2. existing Chinese account remains Chinese;
3. new account starts in English;
4. switching language preserves `/applications/<id>?tab=difference`;
5. switching language sends no analyze/generate request;
6. English and Chinese AI requests do not reuse one another;
7. an old Chinese result remains visible in the English interface with a language label;
8. mobile tabs, filters, and primary controls avoid page-level horizontal overflow;
9. reduced-motion mode keeps the workflow usable.

- [ ] **Step 2: Run the complete local verification gate**

Run:

```bash
pnpm verify
pnpm build
pnpm test:e2e
```

Expected: all commands exit 0. Do not claim success if real-OCR tests, database tests, or environment-dependent suites were skipped; report them explicitly.

- [ ] **Step 3: Run database verification**

Run: `pnpm db:reset && pnpm test:db`  
Expected: all pgTAP suites PASS.

- [ ] **Step 4: Inspect the production build at representative widths**

Verify public landing, login, onboarding, home, applications, difference analysis, improvement guidance, interview preparation, profile, and settings at approximately 390 px, 1024 px, and 1440 px in both locales. Check long English/German source excerpts without modifying them.

- [ ] **Step 5: Commit verification specs**

```bash
git add tests README.md
git commit -m "test: cover bilingual release workflows"
```

Only include `README.md` if it changed.

- [ ] **Step 6: Deploy Vercel Preview**

Push the implementation branch and create or update the Vercel Preview. Record the preview URL and deployed commit. Do not deploy production yet.

- [ ] **Step 7: User preview gate**

Ask the user to review English default behavior, Chinese preservation, language switching on a live application route, historical AI results, mobile layout, and motion. Fix approved issues and rerun the affected verification commands.

- [ ] **Step 8: Production deployment gate**

Deploy production only after explicit user approval of the preview and after confirming that the production migration order is database first, compatible code second. Verify the production homepage, login, language switch, and one authenticated application without triggering a paid AI call.

---

## Final completion evidence

Completion requires all of the following evidence in the handoff:

- implementation commit(s) and deployed preview commit;
- `pnpm verify`, `pnpm build`, `pnpm test:e2e`, and database test outcomes;
- explicit list of any skipped environment-dependent checks;
- proof that existing Chinese profile rows were not changed by the default-locale migration;
- proof that language switching makes no AI request;
- proof that different AI output locales have distinct reuse identities;
- user approval of the preview before production deployment;
- production URL and post-deploy smoke-test result.
