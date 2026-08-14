# Application Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manual-first application workspace where an authenticated user can save a JD, browse owned applications, open a detail page, and update stages with an auditable timeline without requiring an AI API key.

**Architecture:** Add owner-scoped `applications` and immutable `application_stage_events` tables. All writes go through security-definer RPCs so ownership, validation, and stage-event creation stay atomic; reads continue through the authenticated Supabase client and RLS. Next.js server pages render lists and details, while small client forms handle local draft recovery and stage submission.

**Tech Stack:** Next.js 16 App Router, React 19 server actions, Supabase Postgres/RLS/RPC, Zod 4, Tailwind CSS 4, Vitest, Testing Library, pgTAP, Playwright.

**Approved scope:** This plan implements the manual foundation from the confirmed MVP design. JD AI parsing, requirement matching, drag-and-drop, resume generation, and statistics remain separate follow-up slices; saved JD text and application IDs are intentionally shaped for those additions.

---

### Task 1: Add the application data model and owner isolation

**Files:**
- Create: `supabase/migrations/202608140001_application_workspace.sql`
- Create: `supabase/tests/database/application_workspace_rls.test.sql`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing pgTAP coverage**

Create assertions for both tables, owner-only reads, denied direct writes, successful `create_application`, idempotent owner-safe reads, successful `change_application_stage`, one initial event, one transition event with the user-supplied occurrence time, and rejection when user B changes user A's application.

```sql
select has_table('public', 'applications', 'applications table exists');
select has_table('public', 'application_stage_events', 'stage events table exists');
select results_eq(
  $$select stage::text from public.create_application(
    'Acme', 'Product Manager', 'Berlin', 'hybrid', 'Company site',
    'https://example.com/jobs/1', 'A complete product manager job description.'
  )$$,
  array['preparing'::text],
  'owner creates a preparing application'
);
```

- [ ] **Step 2: Run the database test and verify RED**

Run: `pnpm exec supabase test db supabase/tests/database/application_workspace_rls.test.sql --local`

Expected: FAIL because `public.applications` and the RPCs do not exist.

- [ ] **Step 3: Implement the migration**

Create:

```sql
create type public.application_stage as enum (
  'preparing', 'applied', 'hr', 'interview', 'offer', 'rejected', 'withdrawn'
);

create type public.workplace_mode as enum (
  'unspecified', 'onsite', 'hybrid', 'remote'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null check (char_length(btrim(company_name)) between 1 and 160),
  role_title text not null check (char_length(btrim(role_title)) between 1 and 160),
  location text,
  workplace_mode public.workplace_mode not null default 'unspecified',
  source text,
  job_url text,
  jd_text text not null check (char_length(btrim(jd_text)) between 40 and 100000),
  stage public.application_stage not null default 'preparing',
  stage_changed_at timestamptz not null default now(),
  applied_at timestamptz,
  next_action text,
  next_action_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Add `application_stage_events`, indexes, `updated_at` trigger reuse, RLS select policies, revoked direct mutation grants, and two `security definer` RPCs with `set search_path = ''`. `create_application` inserts the initial `preparing` event. `change_application_stage` locks the owned row, rejects identical stages and future occurrence dates, updates `applied_at` when first entering a post-preparing stage, and inserts the immutable event in the same transaction.

- [ ] **Step 4: Regenerate or manually update database types**

Add `applications`, `application_stage_events`, the two enums, and the two RPC signatures to `src/lib/supabase/database.types.ts` using the exact SQL names.

- [ ] **Step 5: Run database tests and verify GREEN**

Run: `pnpm exec supabase test db supabase/tests/database --local`

Expected: all foundation and application pgTAP assertions pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202608140001_application_workspace.sql supabase/tests/database/application_workspace_rls.test.sql src/lib/supabase/database.types.ts
git commit -m "feat: add secure application workspace data model"
```

### Task 2: Define application domain schemas and labels

**Files:**
- Create: `src/features/applications/schemas.ts`
- Create: `src/features/applications/schemas.test.ts`

- [ ] **Step 1: Write failing schema tests**

Cover trimmed company/title values, optional empty fields becoming `null`, invalid/unsafe job URLs, JD length boundaries, valid stage transitions, same-stage rejection, and future event dates.

```ts
expect(newApplicationSchema.parse({
  companyName: " Acme ",
  roleTitle: " Product Manager ",
  workplaceMode: "hybrid",
  jobUrl: "",
  jdText: "x".repeat(40),
})).toMatchObject({ companyName: "Acme", roleTitle: "Product Manager", jobUrl: null });
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `pnpm vitest run src/features/applications/schemas.test.ts`

Expected: FAIL because the schema module does not exist.

- [ ] **Step 3: Implement schemas and display metadata**

Export `applicationStageSchema`, `workplaceModeSchema`, `newApplicationSchema`, `stageChangeSchema`, `applicationFilterSchema`, `APPLICATION_STAGES`, `APPLICATION_STAGE_LABELS`, and `WORKPLACE_MODE_LABELS`. URLs must be `http` or `https`; notes and optional fields must have explicit maximum lengths.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run src/features/applications/schemas.test.ts`

```bash
git add src/features/applications/schemas.ts src/features/applications/schemas.test.ts
git commit -m "feat: define application workspace domain rules"
```

### Task 3: Add repository and authenticated server actions

**Files:**
- Create: `src/features/applications/repository.ts`
- Create: `src/features/applications/actions.ts`
- Create: `src/features/applications/actions.test.ts`

- [ ] **Step 1: Write failing action tests**

Mock only `requireUser`, repository calls, `revalidatePath`, and `redirect`. Verify invalid input never reaches storage, the authenticated user is never accepted from form input, a successful create returns the new owned ID, and a stage change revalidates both list and detail paths.

```ts
await expect(createApplicationAction(initialState, validFormData)).resolves.toEqual({
  ok: true,
  applicationId: "11111111-1111-4111-8111-111111111111",
});
expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Acme" }));
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/features/applications/actions.test.ts`

Expected: FAIL because actions and repository do not exist.

- [ ] **Step 3: Implement the repository**

Expose focused methods:

```ts
export type ApplicationRepository = {
  create(input: NewApplicationInput): Promise<Application>;
  list(userId: string): Promise<Application[]>;
  get(userId: string, applicationId: string): Promise<Application | null>;
  listEvents(userId: string, applicationId: string): Promise<ApplicationStageEvent[]>;
  changeStage(input: StageChangeInput): Promise<Application>;
};
```

Create/change use RPCs; list/get/events use owner-filtered selects. Convert every database row through Zod-backed enum parsing and expose stable errors such as `application-not-found`, `application-stage-unchanged`, and `application-storage-error`.

- [ ] **Step 4: Implement server actions**

Use `requireUser()` before parsing mutations. Parse `FormData` into schemas, return Chinese field errors without echoing the JD, and call `revalidatePath` after mutations. The action return shape is a serializable discriminated union.

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm vitest run src/features/applications/actions.test.ts src/features/applications/schemas.test.ts`

```bash
git add src/features/applications/repository.ts src/features/applications/actions.ts src/features/applications/actions.test.ts
git commit -m "feat: add application workspace server operations"
```

### Task 4: Build the recoverable new-application form

**Files:**
- Create: `src/features/applications/application-draft-form.tsx`
- Create: `src/features/applications/application-draft-form.test.tsx`
- Modify: `src/app/(app)/applications/new/page.tsx`

- [ ] **Step 1: Write failing component tests**

Verify required labels, restore from `localStorage`, save on input without a network request, show a “saved in this browser” status, display server errors, clear the local draft only after successful creation, and navigate to `/applications/{id}`.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/features/applications/application-draft-form.test.tsx`

Expected: FAIL because the form does not exist.

- [ ] **Step 3: Implement the form and page**

Use a single-column mobile layout and a two-column desktop form. Fields: company, role, location, workplace mode, source, URL, and JD. `localStorage` is a recovery aid only; the database becomes authoritative after the user clicks `建立申请工作区`. Do not call AI from keystrokes or submit.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run src/features/applications/application-draft-form.test.tsx`

```bash
git add 'src/app/(app)/applications/new/page.tsx' src/features/applications/application-draft-form.tsx src/features/applications/application-draft-form.test.tsx
git commit -m "feat: create recoverable JD application drafts"
```

### Task 5: Replace the applications placeholder with board and table views

**Files:**
- Create: `src/features/applications/application-list.tsx`
- Create: `src/features/applications/application-list.test.tsx`
- Modify: `src/app/(app)/applications/page.tsx`

- [ ] **Step 1: Write failing view tests**

Cover empty state, company/title search, stage filter, board grouping, table headings, visible text labels in every stage, and detail links. Verify the view never relies on color alone.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/features/applications/application-list.test.tsx`

- [ ] **Step 3: Implement list UI**

The server page loads only owned rows, parses `view`, `q`, and `stage` search parameters, and passes the filtered rows to the view. Board is the default desktop view; table remains horizontally scrollable on small screens. Empty state links directly to `/applications/new`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run src/features/applications/application-list.test.tsx`

```bash
git add 'src/app/(app)/applications/page.tsx' src/features/applications/application-list.tsx src/features/applications/application-list.test.tsx
git commit -m "feat: add application board and table views"
```

### Task 6: Add application details, stage updates, and timeline

**Files:**
- Create: `src/app/(app)/applications/[id]/page.tsx`
- Create: `src/features/applications/stage-update-form.tsx`
- Create: `src/features/applications/stage-update-form.test.tsx`

- [ ] **Step 1: Write failing form tests**

Verify explicit stage, occurrence date, optional note, disabled submission while pending, same-stage feedback, and success feedback. Ensure a status control always includes its text label.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/features/applications/stage-update-form.test.tsx`

- [ ] **Step 3: Implement the detail page**

Return `notFound()` when the owned application is absent. Render company, role, stage, location, source, and next action at the top. Use `?tab=overview|jd|resume|interview|timeline`; overview, JD, and timeline are live, while resume/interview explain the next slice without dead links.

- [ ] **Step 4: Implement accessible stage updates**

The form defaults the event date to today, excludes the current stage from choices, calls the server action, and never updates optimistically. The timeline renders newest first with from/to labels, occurrence time, and note.

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm vitest run src/features/applications/stage-update-form.test.tsx src/features/applications/actions.test.ts`

```bash
git add 'src/app/(app)/applications/[id]/page.tsx' src/features/applications/stage-update-form.tsx src/features/applications/stage-update-form.test.tsx
git commit -m "feat: add application details and stage timeline"
```

### Task 7: Surface real application activity on the dashboard

**Files:**
- Create: `src/features/applications/summary.ts`
- Create: `src/features/applications/summary.test.ts`
- Modify: `src/app/(app)/app/page.tsx`

- [ ] **Step 1: Write failing summary tests**

Given application rows, verify totals for active applications, applied-or-later, interviews, offers, and the five most recently updated rows. Rejected and withdrawn rows stay in total history but not active count.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/features/applications/summary.test.ts`

- [ ] **Step 3: Implement summary and dashboard cards**

Load applications beside the existing profile data, keep the current onboarding priority card, then render real metrics and recent applications below it. Zero-data content must link to `新建申请` rather than show sample records.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run src/features/applications/summary.test.ts src/app/page.test.tsx`

```bash
git add 'src/app/(app)/app/page.tsx' src/features/applications/summary.ts src/features/applications/summary.test.ts
git commit -m "feat: show application progress on dashboard"
```

### Task 8: Verify end to end, publish, migrate cloud, and redeploy

**Files:**
- Create: `tests/e2e/application-workspace.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing E2E flow**

Create and later delete an isolated test account. Complete onboarding, create an application from a JD, verify it appears in board and table views, open details, change `preparing` to `applied` with a date/note, verify the timeline, reload, and verify 390px pages do not overflow.

- [ ] **Step 2: Run E2E and verify RED before the slice is complete**

Run: `E2E_FAKE_EXTRACTOR=1 pnpm exec playwright test tests/e2e/application-workspace.spec.ts --project=chromium`

- [ ] **Step 3: Update setup documentation**

Document the new migration, manual-first behavior, status-event rule, and that JD text is stored privately and never written to ordinary logs.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec supabase test db supabase/tests/database --local
E2E_FAKE_EXTRACTOR=1 pnpm exec playwright test --project=chromium
```

Expected: zero lint/type errors, all Vitest and pgTAP assertions pass, production build exits 0, and all Chromium E2E scenarios pass.

- [ ] **Step 5: Push, open a draft PR, and wait for CI**

```bash
git push -u origin feat/application-workspace
gh pr create --draft --base main --head feat/application-workspace --title "Build the CareerMint application workspace" --body-file <prepared-body>
```

- [ ] **Step 6: Apply the migration to linked Supabase and verify remote lint**

Run:

```bash
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
pnpm exec supabase migration list --linked
pnpm exec supabase db lint --linked
```

- [ ] **Step 7: Deploy production and run a disposable cloud smoke test**

Run `pnpm dlx vercel@latest --prod --yes`, then create a temporary confirmed account through the Supabase admin API, exercise create/list/stage/detail in Chromium, and delete the account in `finally`. Confirm no DeepSeek request is made.

