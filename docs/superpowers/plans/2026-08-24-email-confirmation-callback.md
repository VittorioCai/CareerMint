# Email Confirmation Callback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make signup email confirmation establish a session reliably and report callback failures accurately.

**Architecture:** Add `token_hash` verification to the existing server Route Handler while preserving code-exchange compatibility. The production-default Supabase Free flow uses the built-in `ConfirmationURL` template and the code exchange; the repository template/config remain optional local/custom-SMTP support for `token_hash`. Keep callback-status presentation in the login route boundary.

**Tech Stack:** Next.js 16 Route Handlers, Supabase SSR/Auth, React 19, Vitest, TypeScript.

---

### Task 1: Callback behavior

**Files:**
- Create: `src/app/auth/callback/route.test.ts`
- Modify: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Write failing route tests**

Mock `createClient` and assert that `token_hash=signup-token&type=email&next=/onboarding` invokes `verifyOtp({ token_hash: "signup-token", type: "email" })` and redirects to onboarding. Add cases for a successful legacy `code`, invalid OTP, failed legacy exchange, missing credentials, and a non-allow-listed `next` value.

- [ ] **Step 2: Run the focused test and verify RED**

Run `pnpm test src/app/auth/callback/route.test.ts`. Expected: failure because the route does not call `verifyOtp` or distinguish callback failures.

- [ ] **Step 3: Implement the minimal callback branch**

Parse `token_hash`, `type`, `code`, and `next`. Accept only `type=email` for the signup OTP branch, call `verifyOtp`, preserve `exchangeCodeForSession` for `code`, and redirect using status values `invalid-link` and `session-not-created`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `pnpm test src/app/auth/callback/route.test.ts`. Expected: all callback cases pass.

### Task 2: Accurate login feedback

**Files:**
- Create: `src/app/(auth)/login/auth-form.test.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/login/auth-form.tsx`

- [ ] **Step 1: Write failing feedback tests**

Render `AuthForm` with each callback status. Assert `invalid-link` shows “验证链接无效或已过期，请重新申请”, while `session-not-created` shows “邮箱可能已完成验证，请使用邮箱和密码登录”.

- [ ] **Step 2: Run the focused test and verify RED**

Run `pnpm test 'src/app/(auth)/login/auth-form.test.tsx'`. Expected: failure because the component accepts only a boolean and uses one generic message.

- [ ] **Step 3: Implement status-specific feedback**

Pass the allow-listed error status from the login page to the form. Render only the two stable Chinese messages and ignore unknown query values.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `pnpm test 'src/app/(auth)/login/auth-form.test.tsx'`. Expected: both messages pass.

### Task 3: Version the confirmation template

**Files:**
- Create: `supabase/templates/confirmation.html`
- Modify: `supabase/config.toml`
- Modify: `src/app/(auth)/login/actions.ts`
- Modify: `src/app/(auth)/login/actions.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Add a static contract test**

Extend the callback route test or add a focused configuration assertion that reads the optional template and checks for `{{ .RedirectTo }}`, `token_hash={{ .TokenHash }}`, and `type=email`. Add an action test asserting signup passes `${siteUrl}/auth/callback?next=/onboarding` as `emailRedirectTo` so the built-in ConfirmationURL flow opens onboarding.

- [ ] **Step 2: Run the focused test and verify RED**

Run the focused test. Expected: failure because the template does not exist.

- [ ] **Step 3: Add template and configuration**

Add an accessible optional confirmation email with `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`, configure `[auth.email.template.confirmation]` for local/custom-SMTP use, set signup to pass `${siteUrl}/auth/callback?next=/onboarding`, and document that new Supabase Free projects can use the built-in default template in production without configuring SMTP now. Custom template synchronization is only a later option after custom SMTP or an upgrade.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the callback and feedback tests. Expected: all pass.

### Task 4: Full verification

**Files:**
- Verify only

- [ ] **Step 1: Run project verification**

Run `pnpm verify`. Expected: ESLint, TypeScript, and all Vitest tests exit 0.

- [ ] **Step 2: Run the production build**

Run `pnpm build`. Expected: Next.js production build exits 0 and includes `/auth/callback`.

- [ ] **Step 3: Review the diff**

Run `git diff --check` and inspect `git diff --stat`. Expected: no whitespace errors and only auth callback, feedback, template, tests, and documentation changes.
