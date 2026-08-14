# JD Analysis and Confirmed-Fact Matching Implementation Plan

**Goal:** Let an authenticated user explicitly analyze one saved JD, reuse the same analysis input, and review structured requirements against confirmed career facts without allowing AI output to invent or confirm facts.

**Architecture:** Add an owner-isolated analysis run plus normalized requirement/evidence tables behind security-definer RPCs. A server-only service sends the JD and a minimal list of confirmed facts through the existing provider abstraction, validates exact JD evidence and returned fact IDs, then atomically persists the sanitized result and metadata. The JD tab exposes an explicit analysis control and renders text-labelled match states with traceable evidence.

**Tech Stack:** Next.js App Router and Server Actions/Route Handlers, React, TypeScript, Zod, Supabase Postgres/RLS/RPC, DeepSeek JSON mode, Vitest, React Testing Library, Playwright, pgTAP.

---

## Task 1: Define the analysis contract

**Files:**
- Create: `src/features/jd-analysis/schemas.ts`
- Create: `src/features/jd-analysis/schemas.test.ts`
- Modify: `src/features/extraction/provider.ts`

1. Write failing tests for the supported requirement categories, priorities, match states, maximum output lengths, exact UUID-shaped evidence IDs, and duplicate requirement removal.
2. Define the provider input DTO containing only JD text plus confirmed-fact DTOs.
3. Define the provider output schema and a sanitizer that:
   - keeps only requirements whose source excerpt exists in the JD;
   - keeps only matched IDs from the confirmed-fact allowlist;
   - downgrades evidence/partial results with no valid fact IDs;
   - removes duplicate requirements while preserving order.
4. Extend `AIProvider` with a JD analysis method while preserving the resume extraction boundary.
5. Run the targeted schema tests and typecheck.

## Task 2: Add secure, idempotent persistence

**Files:**
- Create: `supabase/migrations/202608140002_jd_analysis.sql`
- Create: `supabase/tests/database/jd_analysis_rls.test.sql`
- Modify: `src/lib/supabase/database.types.ts`

1. Write failing pgTAP coverage for owner-only reads, no direct writes, cross-user isolation, confirmed-fact-only evidence, atomic completion, retryable failures, and identical-key reuse.
2. Add `application_analysis_runs`, `application_requirements`, and `application_requirement_evidence`.
3. Grant authenticated users select only and enable owner RLS on all three tables.
4. Add security-definer RPCs to create/reuse, claim, complete, and fail a run. Every RPC derives the owner from `auth.uid()` and rechecks application/fact ownership.
5. Complete a run and replace the current requirement set atomically; reject evidence that points at pending or foreign facts.
6. Update generated-equivalent database types.
7. Reset the local database, run all pgTAP tests, and lint the local schema.

## Task 3: Implement provider and safety service

**Files:**
- Create: `src/features/jd-analysis/prompt.ts`
- Create: `src/features/jd-analysis/service.ts`
- Create: `src/features/jd-analysis/service.test.ts`
- Modify: `src/features/extraction/deepseek-extractor.ts`
- Modify: `src/features/extraction/deepseek-extractor.test.ts`

1. Write failing service tests for claim-once behavior, cache reuse, exact-JD evidence rejection, confirmed-fact ID filtering, safe metadata/cost storage, and sanitized failures.
2. Add a fixed system prompt that treats the JD and facts as untrusted data and requires JSON only.
3. Add the DeepSeek JD method using the same endpoint, timeout, usage mapping, metadata-only logging, and one invalid-output retry.
4. Implement the service sanitizer before persistence. Never write raw JD or complete fact content to job results or logs.
5. Reuse the configurable price schedule when provider/model/effective dates match.
6. Run targeted tests and typecheck.

## Task 4: Add repository and HTTP orchestration

**Files:**
- Create: `src/features/jd-analysis/repository.ts`
- Create: `src/features/jd-analysis/http.ts`
- Create: `src/features/jd-analysis/http.test.ts`
- Create: `src/app/api/applications/[id]/analyze/route.ts`

1. Write failing handler tests for authentication, UUID validation, ownership, AI consent, idempotent succeeded/running reuse, and stable failures.
2. Implement server-only reads and RPC-backed writes.
3. Build an input hash from the JD, confirmed fact IDs/content, schema version, provider, and model so unchanged inputs reuse a completed run.
4. Instantiate the real provider only inside the claimed service run so missing credentials become a persisted safe failure.
5. Permit the deterministic fake provider only outside production with `E2E_FAKE_EXTRACTOR=1`.
6. Return only job ID/status/error code to the browser.

## Task 5: Build the JD analysis UI

**Files:**
- Create: `src/features/jd-analysis/analysis-control.tsx`
- Create: `src/features/jd-analysis/analysis-control.test.tsx`
- Create: `src/features/jd-analysis/requirements-panel.tsx`
- Create: `src/features/jd-analysis/requirements-panel.test.tsx`
- Modify: `src/app/(app)/applications/[id]/page.tsx`

1. Write failing component tests for explicit invocation, pending/failed/consent feedback, retry, text-labelled states, source excerpts, and evidence links.
2. Add a clear disclosure that the JD plus confirmed facts are sent only after the user clicks analyze.
3. Render the categories: core responsibilities, hard requirements, preferred qualifications, skills, language/work authorization, location/workplace, and compensation.
4. Render `有证据`, `部分匹配`, `没有证据`, and `需要用户判断` as text, never by color alone.
5. For evidence matches, show fact title/description and source excerpt; never expose internal model prompts or raw metadata.
6. Keep a recoverable retry state when AI is unavailable and preserve the JD.

## Task 6: Verify the private workflow

**Files:**
- Modify: `tests/e2e/application-workspace.spec.ts`
- Modify: `README.md`

1. Extend the local E2E flow to confirm AI analysis is never automatic.
2. Grant AI consent for the disposable test user, click analyze with the fake provider, and verify structured requirements and confirmed-fact-only matches.
3. Verify a repeated click reuses the result rather than creating duplicate requirements.
4. Check mobile width and delete the test account in `finally`.
5. Update the current feature and privacy documentation.

## Task 7: Release

1. Run lint, typecheck, all Vitest tests, production build, all pgTAP tests, local database lint, and full Playwright E2E.
2. Commit coherent slices and push `codex/jd-analysis-matching`.
3. Create a draft PR, wait for app/database CI, mark ready, and merge after both pass.
4. Dry-run and apply only `202608140002_jd_analysis.sql` to linked Supabase, then verify the remote migration list.
5. Deploy production and run a disposable-account smoke test without invoking a real model when no production key is configured.
