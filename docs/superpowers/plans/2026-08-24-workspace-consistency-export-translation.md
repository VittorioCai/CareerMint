# Workspace Consistency, Export, and Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the application setup resume-first, remove exact duplicate resume choices, add private previews and unresolved-gap Markdown export, translate and prioritize JD requirements, support safe application deletion, and tailor career-fact forms without changing the existing fact storage model.

**Architecture:** Keep the existing Next.js App Router and Supabase boundaries. Put ownership-sensitive operations in server routes/actions backed by repository functions, enforce exact resume deduplication in both application code and PostgreSQL, extend the single JD-analysis provider response with translations, and share pure presentation/transform helpers across add/edit UIs. Preserve legacy rows and old analysis runs while canonicalizing only active resume references and hiding duplicates from normal lists.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Supabase/PostgreSQL/RLS, Vitest and Testing Library, Playwright, DeepSeek through the existing `AIProvider` abstraction.

---

## Task 1: Add database invariants for canonical resumes and translated requirements

**Files:**
- Create: `supabase/migrations/202608240002_workspace_consistency.sql`
- Modify: `supabase/tests/database/foundation_rls.test.sql`
- Modify: `supabase/tests/database/jd_analysis_rls.test.sql`
- Modify: `supabase/tests/database/resume_gap_redesign_rls.test.sql`
- Modify: `src/lib/supabase/database.types.ts`

- [x] **Step 1: Write failing database assertions for exact duplicate canonicalization**

  Extend the resume-gap database test with two same-user `source_assets` rows sharing a SHA-256 and different statuses/timestamps. Assert that migration behavior leaves the preferred row canonical, sets the other row's `duplicate_of_id`, changes an active `applications.resume_source_asset_id` to the canonical ID, and rejects insertion of a second canonical row for the same `(user_id, sha256)`. Add a second user with the same hash to prove the uniqueness scope is per user.

- [x] **Step 2: Write failing database assertions for translations and deletion safety**

  Update the JD completion test so the RPC payload contains top-level `jdTranslationZh` and per-requirement `translationZh`, then assert those values are persisted in the run result and `application_requirements.translation_zh`. Add a deletion test that removes an owned application and verifies application-scoped analysis/gap/version rows disappear while its global source asset and career facts remain.

- [x] **Step 3: Run the focused database tests and confirm they fail**

  Run: `pnpm test:db`

  Expected: failure because `duplicate_of_id`, `translation_zh`, the partial unique index, and the updated completion contract do not exist yet.

- [x] **Step 4: Implement the migration**

  In `202608240002_workspace_consistency.sql`:

  - add nullable `source_assets.duplicate_of_id` as a self-reference with `on delete restrict`;
  - rank duplicate groups by ready/extracting/uploaded/failed, earliest `created_at`, then ID;
  - set non-winners to the canonical ID and update active application resume references;
  - add a partial unique index on `(user_id, sha256)` where `duplicate_of_id is null`;
  - add nullable bounded `application_requirements.translation_zh`;
  - replace `complete_application_analysis` with the same ownership/locking behavior and the expanded JSON contract;
  - preserve its grants and security-definer/search-path protections;
  - if the deletion test exposes restrictive FKs, add a security-definer `delete_owned_application(p_application_id uuid)` RPC that verifies `auth.uid()`, deletes dependent application-scoped rows in the required order, and never deletes source assets or career facts.

- [x] **Step 5: Reset the local database, regenerate types, and rerun tests**

  Run: `pnpm db:reset && pnpm db:types && pnpm test:db`

  Expected: all database tests pass and generated types include `duplicate_of_id` and `translation_zh`.

- [x] **Step 6: Commit**

  ```bash
  git add supabase/migrations/202608240002_workspace_consistency.sql supabase/tests/database src/lib/supabase/database.types.ts
  git commit -m "feat: enforce canonical resumes and translated requirements"
  ```

## Task 2: Prevent duplicate uploads and add authenticated resume preview

**Files:**
- Modify: `src/features/source-assets/repository.ts`
- Modify: `src/features/source-assets/repository.test.ts`
- Modify: `src/features/source-assets/http.ts`
- Modify: `src/app/api/source-assets/route.ts`
- Modify: `src/app/api/source-assets/route.test.ts`
- Create: `src/features/source-assets/preview-http.ts`
- Create: `src/features/source-assets/preview-http.test.ts`
- Create: `src/app/api/source-assets/[id]/preview/route.ts`
- Create: `src/app/api/source-assets/[id]/preview/route.test.ts`
- Modify: `src/features/source-assets/parsers/docx.ts`

- [ ] **Step 1: Write failing repository tests**

  Assert that `listAssets(userId)` adds `duplicate_of_id is null`, that `findCanonicalByHash(userId, sha256)` is owner-scoped, and that returned `SourceAsset` objects expose `duplicateOfId`. Add an insert-conflict test that can identify the canonical winner after PostgreSQL reports the partial-unique violation.

- [ ] **Step 2: Write failing upload-route tests**

  Cover:

  - an existing canonical hash returns HTTP 200 with `{ reused: true }` and does not call upload/create;
  - a new hash returns HTTP 201 with `{ reused: false }`;
  - a concurrent unique violation removes the just-uploaded object, fetches the canonical winner, and returns it;
  - no test or error output contains file bytes, extracted text, or SHA-256.

- [ ] **Step 3: Run focused tests and confirm red**

  Run: `pnpm vitest run src/features/source-assets/repository.test.ts src/app/api/source-assets/route.test.ts`

  Expected: failures for missing canonical lookup/filter and the old unconditional upload response.

- [ ] **Step 4: Implement canonical upload reuse**

  Add `duplicateOfId` mapping, canonical-list filtering, and `findCanonicalByHash` to the repository. Change the HTTP dependency contract so validation/hash calculation happens before object upload, reuse returns the existing owned asset, and the race path cleans up only its newly created storage object before returning the winner.

- [ ] **Step 5: Write failing preview tests**

  Test authenticated ownership, 404 for another user's asset, PDF inline byte streaming, DOCX-to-sanitized-text rendering, unsupported types, private/no-store headers, `nosniff`, safe filename handling, and absence of OCR/AI dependencies.

- [ ] **Step 6: Implement the private preview route**

  Reuse `getOwnedAsset` and `downloadSource`. Return owned PDFs with `application/pdf` and inline disposition. Parse owned DOCX through the existing Mammoth-based parser and return escaped/sanitized UTF-8 plain text. Add `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and a restrictive CSP. Do not create signed public URLs and do not call extraction, OCR, or AI.

- [ ] **Step 7: Run focused tests and commit**

  Run: `pnpm vitest run src/features/source-assets src/app/api/source-assets`

  Expected: all source-asset and preview tests pass.

  ```bash
  git add src/features/source-assets src/app/api/source-assets
  git commit -m "feat: reuse and privately preview resume assets"
  ```

## Task 3: Put resume selection and preview before JD analysis

**Files:**
- Modify: `src/app/(app)/applications/[id]/page.tsx`
- Modify: `src/features/resume-gaps/baseline-selector.tsx`
- Modify: `src/features/resume-gaps/baseline-selector.test.tsx`
- Modify: `src/features/resume-gaps/resume-workspace.tsx`
- Create: `src/features/applications/setup-progress.tsx`
- Create: `src/features/applications/setup-progress.test.tsx`
- Modify: `src/features/applications/application-draft-form.tsx`
- Modify: `src/features/applications/application-draft-form.test.tsx`
- Create: `src/app/(app)/applications/[id]/page.test.tsx`
- Modify: `tests/e2e/application-workspace.spec.ts`

- [ ] **Step 1: Write failing UI tests for order, preview, and navigation**

  Assert tabs render in `概览、简历、JD、面试准备、时间线` order. In the baseline selector, test `预览` for PDF and DOCX via the protected route, expand/collapse keyboard behavior, preview failure recovery, and focus return. Assert select/upload/skip from setup mode redirects to `?tab=jd&setup=1`, while changing a baseline from an established workspace stays on the Resume tab.

- [ ] **Step 2: Write failing new-application flow tests**

  Assert saving company/role/JD creates the application without starting analysis and redirects to `?tab=resume&setup=1`. Assert the progress indicator reads `JD 已保存 → 选择并预览简历 → 分析 JD → 查看差距` and the JD tab's setup copy links back to the selected resume and forward to gap review after success.

- [ ] **Step 3: Run focused tests and confirm red**

  Run: `pnpm vitest run src/features/resume-gaps/baseline-selector.test.tsx src/features/applications/setup-progress.test.tsx src/features/applications/application-draft-form.test.tsx src/app/\(app\)/applications/\[id\]/page.test.tsx`

  Expected: failures because tab order, setup redirects, preview controls, and progress UI are not implemented.

- [ ] **Step 4: Implement the resume-first interface**

  Reorder tabs, add setup-mode detection from search params, add the four-step progress component, and render preview as a semantic disclosure/region using the private preview endpoint. Preserve the existing ability to upload, select, replace, or skip. Keep a concise explanation that resume selection precedes analysis but JD text was already saved.

- [ ] **Step 5: Update the E2E journey**

  Change the happy path to: create/save application → Resume tab → preview/select/skip → JD tab → explicitly analyze → Resume tab → analyze gaps. Mock DeepSeek only at the explicit analysis steps.

- [ ] **Step 6: Run tests and commit**

  Run: `pnpm vitest run src/features/resume-gaps src/features/applications src/app/\(app\)/applications/\[id\]`

  Expected: focused component/page tests pass.

  ```bash
  git add src/app/\(app\)/applications/\[id\] src/features/resume-gaps src/features/applications tests/e2e/application-workspace.spec.ts
  git commit -m "feat: make resume selection precede JD analysis"
  ```

## Task 4: Generate, persist, sort, and progressively disclose Chinese JD translations

**Files:**
- Modify: `src/features/jd-analysis/schemas.ts`
- Modify: `src/features/jd-analysis/schemas.test.ts`
- Modify: `src/features/jd-analysis/prompt.ts`
- Modify: `src/features/jd-analysis/prompt.test.ts`
- Modify: `src/features/extraction/provider.ts`
- Modify: `src/features/extraction/deepseek-extractor.ts`
- Modify: `src/features/extraction/deepseek-extractor.test.ts`
- Modify: `src/features/jd-analysis/service.ts`
- Modify: `src/features/jd-analysis/service.test.ts`
- Modify: `src/features/jd-analysis/http.ts`
- Modify: `src/features/jd-analysis/http.test.ts`
- Modify: `src/features/jd-analysis/repository.ts`
- Modify: `src/features/jd-analysis/repository.test.ts`
- Modify: `src/features/jd-analysis/requirements-panel.tsx`
- Modify: `src/features/jd-analysis/requirements-panel.test.tsx`
- Create: `src/features/jd-analysis/requirement-order.ts`
- Create: `src/features/jd-analysis/requirement-order.test.ts`
- Modify: `src/features/resume-gaps/schemas.ts`
- Modify: `src/features/resume-gaps/repository.ts`
- Modify: `src/features/resume-gaps/gap-panel.tsx`
- Modify: `src/features/resume-gaps/gap-panel.test.tsx`

- [ ] **Step 1: Write failing schema/provider tests**

  Require bounded, trimmed `jdTranslationZh` and `translationZh` in new provider output. Assert the prompt requests one JSON object containing structure, matches, and translations without a second provider call. Add invalid/missing translation cases and update the fake provider fixture.

- [ ] **Step 2: Write failing cache/repository compatibility tests**

  Assert the analysis schema version changes from `jd-analysis-v1` to `jd-analysis-v2`, identical v2 inputs reuse results, and v1 rows do not. New rows must persist translations. Legacy rows without translations must still parse as readable historical results and expose a `translationAvailable`-style state rather than crashing.

- [ ] **Step 3: Write failing presentation tests**

  Build mixed requirements and assert shared ordering is `none → needs_user → partial → evidence`, then core before supporting, then original stable order. Verify collapsed category summaries, expanded content order (Chinese, reason, evidence, source excerpt), old-run fallback copy, and the two independently collapsed source disclosures `JD 中文翻译` and `JD 原文`.

- [ ] **Step 4: Run focused tests and confirm red**

  Run: `pnpm vitest run src/features/jd-analysis src/features/extraction/deepseek-extractor.test.ts src/features/resume-gaps/gap-panel.test.tsx`

  Expected: failures for absent translation fields, v1 cache version, and old evidence-first ordering.

- [ ] **Step 5: Implement the expanded single-call contract**

  Update Zod/types, prompt, provider parsing, service sanitation, repository/RPC payload, and fake output. Store full translation in the run result and requirement translations on rows. Keep legacy read schemas permissive only for stored old runs; current provider output remains strict. Never replace original source text with translation.

- [ ] **Step 6: Implement one shared comparator and progressive disclosure**

  Add a pure stable comparator and use it in the priority view, all category expansions, and resume-gap groups. Render source text and translations in readable wrapped blocks with existing product colors, thin separators in dense lists, semantic disclosure controls, and status text in addition to color.

- [ ] **Step 7: Run focused tests and commit**

  Run: `pnpm vitest run src/features/jd-analysis src/features/extraction src/features/resume-gaps`

  Expected: all JD/extraction/gap tests pass, including legacy fallback cases.

  ```bash
  git add src/features/jd-analysis src/features/extraction src/features/resume-gaps
  git commit -m "feat: translate and prioritize JD requirements"
  ```

## Task 5: Export the current unresolved resume gap as Markdown

**Files:**
- Create: `src/features/resume-gaps/markdown.ts`
- Create: `src/features/resume-gaps/markdown.test.ts`
- Create: `src/features/resume-gaps/export-http.ts`
- Create: `src/features/resume-gaps/export-http.test.ts`
- Create: `src/app/api/applications/[id]/resume/gaps/export/route.ts`
- Create: `src/app/api/applications/[id]/resume/gaps/export/route.test.ts`
- Modify: `src/features/resume-gaps/repository.ts`
- Modify: `src/features/resume-gaps/gap-panel.tsx`
- Modify: `src/features/resume-gaps/gap-panel.test.tsx`

- [ ] **Step 1: Write failing pure Markdown tests**

  Given mixed gap items, assert UTF-8 output includes company, role, export date, baseline filename, and only missing/profile-only/partial groups in priority order. Each item must include original requirement, Chinese translation, priority, exact resume excerpt when present, and confirmed profile evidence when present. Assert covered items and phrases such as “建议改写” are absent. Test Markdown escaping and safe filenames.

- [ ] **Step 2: Write failing owner/current-run endpoint tests**

  Cover 401, wrong owner/404, no selected resume, no succeeded analysis, no succeeded gap, stale gap bound to an older resume or analysis run (409), success headers, and UTF-8 body. The repository query must select the latest succeeded JD run and a succeeded gap run bound to both that run and the current `resume_source_asset_id`.

- [ ] **Step 3: Run focused tests and confirm red**

  Run: `pnpm vitest run src/features/resume-gaps/markdown.test.ts src/features/resume-gaps/export-http.test.ts src/app/api/applications/\[id\]/resume/gaps/export/route.test.ts`

  Expected: module-not-found or missing-export failures.

- [ ] **Step 4: Implement export generation and route**

  Keep Markdown rendering pure and deterministic. Return `text/markdown; charset=utf-8` and `Content-Disposition: attachment` with a sanitized filename. Do not invoke AI, OCR, storage upload, or create a new analysis. Return stable Chinese error messages and leave existing UI state intact.

- [ ] **Step 5: Add the export control to the gap panel**

  Show `导出 Markdown` only for a current succeeded gap report. Use a normal authenticated download link/button with visible completion/failure feedback and keyboard access.

- [ ] **Step 6: Run tests and commit**

  Run: `pnpm vitest run src/features/resume-gaps src/app/api/applications/\[id\]/resume/gaps/export`

  Expected: export and gap-panel tests pass.

  ```bash
  git add src/features/resume-gaps src/app/api/applications/\[id\]/resume/gaps/export
  git commit -m "feat: export unresolved resume gaps as markdown"
  ```

## Task 6: Add explicit owner-only application deletion

**Files:**
- Modify: `src/features/applications/schemas.ts`
- Modify: `src/features/applications/repository.ts`
- Modify: `src/features/applications/repository.test.ts`
- Modify: `src/features/applications/actions.ts`
- Modify: `src/features/applications/actions.test.ts`
- Create: `src/features/applications/application-delete-control.tsx`
- Create: `src/features/applications/application-delete-control.test.tsx`
- Modify: `src/features/applications/application-list.tsx`
- Modify: `src/features/applications/application-list.test.tsx`
- Modify: `src/app/(app)/applications/[id]/page.tsx`

- [ ] **Step 1: Write failing repository/action tests**

  Assert removal filters by both application ID and authenticated user ID (or calls the owner-only RPC), returns not-found for cross-user IDs, and preserves source assets/career facts. The server action must reject missing/false confirmation, return a stable field/global error, revalidate `/applications` and `/app`, and redirect detail deletion only after success.

- [ ] **Step 2: Write failing component/list tests**

  Assert both board/table and overview expose `删除记录`; first activation expands an inline warning naming company and role; cancel collapses it; second activation submits explicit confirmation; pending/error/success states remain screen-reader readable. Refactor card markup so nested interactive controls are not placed inside a link.

- [ ] **Step 3: Run focused tests and confirm red**

  Run: `pnpm vitest run src/features/applications/repository.test.ts src/features/applications/actions.test.ts src/features/applications/application-delete-control.test.tsx src/features/applications/application-list.test.tsx`

  Expected: failures for missing delete schema/action/control.

- [ ] **Step 4: Implement deletion**

  Add a strict confirmation schema, repository owner check/RPC call, server action, and inline two-step component. On list pages, refresh after success; on the detail page, redirect to `/applications`. Do not delete the selected source asset.

- [ ] **Step 5: Run tests and commit**

  Run: `pnpm vitest run src/features/applications src/app/\(app\)/applications/\[id\]`

  Expected: all application tests pass.

  ```bash
  git add src/features/applications src/app/\(app\)/applications/\[id\]
  git commit -m "feat: add safe application deletion"
  ```

## Task 7: Replace the generic career-fact form with category-specific fields

**Files:**
- Create: `src/features/career-profile/fact-fields.tsx`
- Create: `src/features/career-profile/fact-form-mapping.ts`
- Create: `src/features/career-profile/fact-form-mapping.test.ts`
- Modify: `src/features/career-profile/manual-fact-form.tsx`
- Create: `src/features/career-profile/manual-fact-form.test.tsx`
- Modify: `src/features/career-profile/fact-editor.tsx`
- Modify: `src/features/career-profile/fact-editor.test.tsx`
- Modify: `src/features/career-profile/schemas.ts`
- Modify: `src/features/career-profile/schemas.test.ts`

- [ ] **Step 1: Write failing mapping tests for all nine categories**

  For summary, work, education, project, skill, certification, language, quantified achievement, and STAR story, assert visible field values transform into the existing `CareerFactInput` shape. Hidden irrelevant data must be omitted. Specifically, language maps language/proficiency/certificate without company, employment dates, or skill-list fields; STAR combines situation/task/action/result without losing section labels.

- [ ] **Step 2: Write failing add/edit UI tests**

  Assert switching categories changes labels and required fields, clears irrelevant hidden values, preserves relevant values, shows validation next to the correct field, and both add and edit use the same type-aware component. Assert manual saves remain pending rather than confirmed.

- [ ] **Step 3: Run focused tests and confirm red**

  Run: `pnpm vitest run src/features/career-profile/fact-form-mapping.test.ts src/features/career-profile/manual-fact-form.test.tsx src/features/career-profile/fact-editor.test.tsx src/features/career-profile/schemas.test.ts`

  Expected: missing modules and failures caused by the current generic form.

- [ ] **Step 4: Implement shared type-aware fields and mapping**

  Keep the database shape unchanged. Use semantic labels and existing form styling, not a new visual system. Add/edit submit through one pure mapping layer so category-specific presentation cannot leak irrelevant fields. Preserve source, confirmation, and usage-history behavior.

- [ ] **Step 5: Run tests and commit**

  Run: `pnpm vitest run src/features/career-profile`

  Expected: every category's mapping and add/edit rendering tests pass.

  ```bash
  git add src/features/career-profile
  git commit -m "feat: tailor career fact forms by category"
  ```

## Task 8: Fix dashboard copy and complete cross-feature verification

**Files:**
- Modify: `src/app/(app)/app/page.tsx`
- Create: `src/features/applications/dashboard-copy.ts`
- Create: `src/features/applications/dashboard-copy.test.ts`
- Modify: `src/app/api/applications/[id]/analyze/route.ts`
- Modify: `tests/e2e/application-workspace.spec.ts`
- Create: `tests/e2e/application-delete.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-24-workspace-consistency-export-translation.md`

- [ ] **Step 1: Write the failing dashboard copy test**

  Mock zero applications and assert `添加第一份 JD`; mock one or more applications and assert `添加 JD` while `添加第一份 JD` is absent, independent of profile-completion state.

- [ ] **Step 2: Run the focused test and confirm red**

  Run: `pnpm vitest run src/features/applications/dashboard-copy.test.ts`

  Expected: the nonzero case fails because copy is currently hard-coded.

- [ ] **Step 3: Implement the count-based copy rule**

  Derive the label from the already-loaded `applications.length` and keep the existing destination and styling.

- [ ] **Step 4: Complete E2E coverage**

  Cover exact duplicate upload reuse, private preview, resume-first setup, explicit translated JD analysis, no-evidence-first ordering, current-gap Markdown download, category-specific language entry, and two-step application deletion. Update the fake AI fixture to provide all required translation fields. Do not call real DeepSeek or OCR.

- [ ] **Step 5: Run staged verification**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm test:db
  pnpm build
  pnpm test:e2e
  git diff --check
  ```

  Expected: every command exits 0. Record any environment-only E2E limitation explicitly; do not replace a failing check with a success claim.

- [ ] **Step 6: Inspect the final production UI locally**

  Start the app with test/mocked AI configuration and verify at desktop width and a phone viewport:

  - setup progress and tab order;
  - preview open/close and long translated requirement wrapping;
  - category-specific language form;
  - export and delete actions;
  - keyboard focus, visible status text, and no horizontal overflow.

- [ ] **Step 7: Commit the final UI/copy/E2E changes**

  ```bash
  git add src/app/\(app\)/app/page.tsx src/features/applications/dashboard-copy.ts src/features/applications/dashboard-copy.test.ts src/app/api/applications/\[id\]/analyze/route.ts tests/e2e docs/superpowers/plans/2026-08-24-workspace-consistency-export-translation.md
  git commit -m "test: verify workspace consistency workflow"
  ```

## Task 9: Apply production migration and deploy the verified build

**Files:**
- Verify only: `supabase/migrations/202608240002_workspace_consistency.sql`
- Verify only: `.env.example`
- Verify only: `vercel.json`

- [ ] **Step 1: Review production-impacting changes**

  Confirm the target Supabase project, inspect the migration diff, verify no destructive deletion of duplicate assets/facts, and confirm Vercel environment variables already contain Supabase and DeepSeek configuration without printing secret values.

- [ ] **Step 2: Apply the production migration**

  Use the existing linked Supabase project and run the repository's non-interactive migration command. Expected: only `202608240002_workspace_consistency.sql` is newly applied. Query migration history and canonical duplicate counts without exposing user data.

- [ ] **Step 3: Push the branch and deploy production**

  Push the verified commits to the configured GitHub remote and deploy through the already-authorized Vercel project. Do not invoke paid AI/OCR during deployment.

- [ ] **Step 4: Run read-only production smoke checks**

  Verify login page availability, protected-route redirects, application page rendering, and static asset/health responses. If an authenticated smoke session is available, verify one preview and one existing translated-workspace view without starting a new AI analysis.

- [ ] **Step 5: Report deployment evidence**

  Report the production URL, migration version, tested commands, commit SHA, and any deferred limitation. Never report completion until the deployed commit and production alias match.
