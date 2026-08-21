# Interview AI Question Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add explicit, idempotent generation of up to six JD-grounded interview-question candidates with transactional user review before question-bank import.

**Architecture:** Extend the provider boundary with generateInterviewQuestions; persist owner-scoped generation runs and pending candidates separately from the question bank; use security-definer RPCs for completion and one-transaction accept/reject review. The application interview panel calls the API only after a user click and refreshes the existing question list after review.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Supabase/PostgreSQL security-definer RPCs, pgTAP, Vitest, Playwright, DeepSeek JSON mode, existing AI pricing and consent repositories.

---

## File map

Create the migration and database test listed in Task 1. Create the dedicated generation schemas, prompt, repository, service, HTTP helper, API route, actions, and review control listed below. Modify the existing provider, interview schemas/repository/components, application detail page, privacy export, and their tests. Keep generation code separate from JD analysis and resume generation; do not refactor unrelated feature files.

- supabase/migrations/202608210001_interview_ai_question_generation.sql: tables, source_excerpt column, RLS/grants, indexes, and owner-scoped generation/review RPCs.
- supabase/tests/database/interview_ai_question_generation_rls.test.sql: owner, cross-user, validation, idempotency, atomic completion/review, and duplicate/reuse pgTAP coverage.
- src/features/interview-preparation/generation-schemas.ts: provider input/output, candidate/run DTOs, grounding, canonical deduplication, and review form schemas.
- src/features/interview-preparation/generation-prompt.ts: fixed system instructions.
- src/features/interview-preparation/generation-repository.ts: typed Supabase calls for runs/candidates and review RPCs.
- src/features/interview-preparation/generation-service.ts: claim/provider/sanitize/cost/complete/fail orchestration.
- src/features/interview-preparation/generation-http.ts: stable input hash and POST dependency boundary.
- src/app/api/applications/[id]/interview/questions/generate/route.ts: authenticated production/fake provider wiring.
- src/features/interview-preparation/generation-actions.ts: explicit accept/reject server actions.
- src/features/interview-preparation/generation-control.tsx: explicit client-side generation and candidate review UI.
- src/features/interview-preparation/generation-schemas.test.ts, generation-service.test.ts, generation-http.test.ts, generation-control.test.tsx, generation-actions.test.ts: focused contracts.
- src/features/extraction/provider.ts and src/features/extraction/deepseek-extractor.ts plus tests: provider method, JSON mode, retry, and metadata.
- src/features/interview-preparation/schemas.ts, repository.ts, components.tsx plus tests: source-excerpt hydration and generated-question presentation.
- src/app/(app)/applications/[id]/page.tsx: load the latest run/candidates and mount the control.
- src/features/privacy/export.ts, src/app/api/account/export/route.ts, and src/features/privacy/export.test.ts: owner-filtered generation export.
- tests/e2e/application-workspace.spec.ts: fake-provider authenticated generation/review/reload flow.

## Task 1: Add the database contract and pgTAP safety net

Files:
- Create: supabase/migrations/202608210001_interview_ai_question_generation.sql
- Test: supabase/tests/database/interview_ai_question_generation_rls.test.sql

- [ ] Step 1: Write failing pgTAP assertions for the complete contract

Create two authenticated fixtures with owned applications, one seeded common question, and one existing non-common question. Assert before implementing that the migration provides nullable application_interview_questions.source_excerpt; owner-select-only generation tables; no direct authenticated table writes; idempotent create_or_get; completion that stores six pending candidates without inserting a question; run result fields acceptedCandidateCount, rejectedCandidateCount, pendingCandidateCount, safe AI metadata, and estimatedCost; atomic rejection of a seventh candidate; cross-user read/review denial; common duplicate rejection without a link; non-common canonical reuse with a variant when wording differs; a new source=ai question and predicted source-backed link; explicit reject; rollback for a forged source excerpt; rollback when completion receives a forged canonicalKey; and confirmation that the target JSON contract contains no canonicalKey. Use fixed UUIDs and request JWT role fixtures. Expected pre-migration failure is a missing relation or function error.

- [ ] Step 2: Run the focused test to verify red

    pnpm exec supabase db reset
    pnpm exec supabase test db supabase/tests/database/interview_ai_question_generation_rls.test.sql

Expected: FAIL because the generation tables and RPCs are absent. Do not apply anything to a cloud project.

- [ ] Step 3: Write the forward-only migration

Create interview_question_generation_runs with owner/application IDs, 64-character input hash, schema/provider/model, queued/running/succeeded/failed status, attempt count, safe result/error/request/token/cost metadata, timestamps, and a unique owner/application/hash/provider/model key. Create interview_question_candidates with run/application/user IDs, order 1–6, the three non-common categories, 8–500 prompt, canonical key, 1–240 source excerpt, 1–700 reason, pending/accepted/rejected status, nullable question ID, timestamps, and run/order uniqueness. Add source_excerpt to application links.

Enable RLS with owner-only SELECT, revoke direct authenticated table writes, and grant only required selects. Add these security-definer contracts with set search_path = '' and auth.uid ownership checks:

    create_or_get_interview_question_generation(uuid, text, text, text, text)
      returns public.interview_question_generation_runs;
    claim_interview_question_generation(uuid, integer, text) returns boolean;
    complete_interview_question_generation(uuid, integer, jsonb, integer, jsonb, jsonb, text)
      returns public.interview_question_generation_runs;
    fail_interview_question_generation(uuid, integer, text, text, text)
      returns public.interview_question_generation_runs;
    accept_interview_question_candidates(uuid, uuid[])
      returns table(candidate_id uuid, disposition text, question_id uuid);
    reject_interview_question_candidates(uuid, uuid[]) returns integer;

Completion takes target_run_id, expected_attempt_count, target_candidates, target_rejected_candidate_count, target_ai_usage, target_estimated_cost, and target_request_id. The expected attempt token must still be running; stale workers receive P0002 and cannot write after a later attempt claims the run. It reads the owner application.jd_text under the run lock, applies the same NFKC/lower-case/Unicode-whitespace fold used by TypeScript, and requires every target sourceExcerpt to be contained in that folded JD. Target candidate objects contain exactly category, prompt, sourceExcerpt, and relevanceReason; PostgreSQL computes canonical_key with normalize_interview_question_prompt(prompt), and a client-supplied canonicalKey is rejected because no such input field exists. It inserts candidates only and records acceptedCandidateCount=0, rejectedCandidateCount=target_rejected_candidate_count, pendingCandidateCount=valid candidate count, safe AI metadata, and estimatedCost. Accept/reject RPCs update those three result counts atomically after status changes. Acceptance locks owner run rows, candidate rows in UUID order, then existing questions by canonical key; common duplicates become rejected without copying/linking, non-common canonical matches are reused and may receive a variant, and new candidates create an AI question plus predicted=true link and source_excerpt in one transaction. Revoke authenticated direct writes to these functions except the new contracts.

- [ ] Step 4: Apply locally and make pgTAP green

    pnpm exec supabase db reset
    pnpm exec supabase test db supabase/tests/database/interview_ai_question_generation_rls.test.sql

Expected: all focused assertions PASS, including completion-without-bank-writes, duplicate/reuse rules, source excerpt, ownership, and atomic rollback.

- [ ] Step 5: Commit the database slice

    git add -- supabase/migrations/202608210001_interview_ai_question_generation.sql supabase/tests/database/interview_ai_question_generation_rls.test.sql
    git commit -m "feat: add interview question generation review storage"

## Task 2: Add schemas and the DeepSeek provider method

Files:
- Create: src/features/interview-preparation/generation-schemas.ts
- Create: src/features/interview-preparation/generation-prompt.ts
- Test: src/features/interview-preparation/generation-schemas.test.ts
- Modify: src/features/extraction/provider.ts
- Modify: src/features/extraction/deepseek-extractor.ts
- Test: src/features/extraction/deepseek-extractor.test.ts

- [ ] Step 1: Write failing schema and adapter tests

Cover valid output, unknown category, field bounds, verbatim excerpt, NFKC/Unicode-whitespace excerpt match, invented excerpt rejection, duplicate canonical keys, common canonical duplicate, six-candidate cap, and no-valid-candidate failure. The output envelope and each target object must contain only category, prompt, sourceExcerpt, and relevanceReason; canonicalKey is never emitted. Mock DeepSeek and assert JSON mode, disabled thinking, max_tokens 4096, fixed system prompt, JD/requirements/common prompts only, and no facts/resume. Assert malformed JSON and provider-output Zod schema invalidity retry exactly once; sanitizer zero-valid behavior is tested in the service and must not retry. Expected red result: AIProvider has no generation member and the modules are missing.

- [ ] Step 2: Run the focused tests

    pnpm exec vitest run src/features/interview-preparation/generation-schemas.test.ts src/features/extraction/deepseek-extractor.test.ts

Expected: FAIL on the missing contract and behavior.

- [ ] Step 3: Implement the narrow provider types and sanitizer

Use an input with jdText, requirements containing id/category/text/sourceExcerpt/priority, and commonPrompts. Use an output envelope with questions containing only category function|industry|job_specific, prompt, sourceExcerpt, and relevanceReason. Implement Zod parsing and sanitization with the existing NFKC canonical helper, case/Unicode-whitespace excerpt matching, length checks, category checks, common exclusion, output deduplication, and first-six retention. Raise interview-question-generation-invalid-output only when no valid candidate remains; partial valid output returns accepted/rejected counts for the service. The adapter retries only malformed JSON or provider-output Zod schema invalidity; the service does not call the provider again when schema-valid grounding/common/dedup validation leaves zero candidates.

Extend AIProvider, add the fixed “possible questions grounded in this JD” system prompt, and call the existing DeepSeek JSON request path with thinking disabled and 4096 output tokens. Preserve provider/model/request ID/token usage in AIResult. The adapter’s one retry is limited to malformed JSON or provider-output schema invalidity; sanitizer failures are returned to the service without another provider call.

- [ ] Step 4: Run focused tests green and commit

    pnpm exec vitest run src/features/interview-preparation/generation-schemas.test.ts src/features/extraction/deepseek-extractor.test.ts
    git add -- src/features/interview-preparation/generation-schemas.ts src/features/interview-preparation/generation-prompt.ts src/features/interview-preparation/generation-schemas.test.ts src/features/extraction/provider.ts src/features/extraction/deepseek-extractor.ts src/features/extraction/deepseek-extractor.test.ts
    git commit -m "feat: add interview question generation provider contract"

Expected: all new sanitizer/adapter assertions and existing extraction tests PASS.

## Task 3: Implement repository, service, HTTP contract, and route

Files:
- Create: src/features/interview-preparation/generation-repository.ts
- Create: src/features/interview-preparation/generation-service.ts
- Create: src/features/interview-preparation/generation-http.ts
- Create: src/app/api/applications/[id]/interview/questions/generate/route.ts
- Test: src/features/interview-preparation/generation-service.test.ts
- Test: src/features/interview-preparation/generation-http.test.ts
- Modify: src/lib/supabase/database.types.ts (local generation)

- [ ] Step 1: Write failing service/HTTP tests

Use fake run/provider dependencies. Assert claim-before-provider, no provider call when claim is false, validator output passed to complete, exact rejectedCandidateCount input and acceptedCandidateCount=0/pendingCandidateCount=valid count result metadata, matching price schedule metadata, safe fail text without JD content, and idempotent running/succeeded reuse. Assert schema-valid sanitizer zero candidates calls fail once and never calls the provider a second time; partial valid output calls complete with rejectedCandidateCount. Assert the SHA-256 hash includes schema version/provider/model/JD/sorted requirements/common prompts and is unaffected by non-common bank changes. Assert the POST boundary rejects unauthenticated, invalid/unowned, and no-consent requests before run creation. Expected red result: generation service and POST handler are undefined.

- [ ] Step 2: Run the red tests

    pnpm exec vitest run src/features/interview-preparation/generation-service.test.ts src/features/interview-preparation/generation-http.test.ts

- [ ] Step 3: Implement repository and service contracts

Expose createOrGet, claim, getOwned, listCandidates, complete, fail, accept, and reject methods. Claim/complete/fail carry the expected attempt token; queued and failed runs claim directly, while running runs can be reclaimed only when their database updated_at is older than two minutes. A claim is verified by reading back the incremented attempt before constructing the provider. Complete/fail storage responses are recovered by reading the run; terminal or newer attempts are reused, and only the same running attempt receives one retry, preventing an old worker from failing a new worker. The complete input is { runId, expectedAttemptCount, candidates: Array<{ category, prompt, sourceExcerpt, relevanceReason }>, rejectedCandidateCount, aiUsage, estimatedCost, requestId }; it has no canonicalKey and maps to complete_interview_question_generation(uuid, integer, jsonb, integer, jsonb, jsonb, text). Each method maps stable Supabase errors and never interpolates source text into errors. The service follows the existing JD-analysis shape: claim, providerFactory, sanitize, cost estimate, complete; its result is { run, reused } and contains acceptedCandidateCount=0 at completion, rejectedCandidateCount, pendingCandidateCount, safe AI metadata, and estimatedCost, with accept/reject updating the counts. On schema-valid zero-candidate sanitization or any other failure, call fail with allowlisted unavailable/invalid-output/provider codes and “岗位面试题生成失败，请稍后重试。” without a second provider call. Keep previous question-bank rows untouched.

- [ ] Step 4: Implement stable hash and API wiring

buildInterviewQuestionGenerationInputHash hashes a stable object containing schema version, provider/model, full JD, requirements sorted by ID with structured fields, and normalized-sorted common prompts. The route uses Node runtime and existing consent/env/price helpers. E2E_FAKE_EXTRACTOR=1 outside production selects a deterministic fake provider whose excerpt comes from the supplied JD; production selects DeepSeek. A running/succeeded run returns reused=true without provider invocation.

- [ ] Step 5: Regenerate types and verify

    pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts
    pnpm exec vitest run src/features/interview-preparation/generation-service.test.ts src/features/interview-preparation/generation-http.test.ts
    pnpm exec tsc --noEmit
    git diff --check

Expected: focused tests, typecheck, and whitespace checks PASS.

- [ ] Step 6: Commit the API slice

    git add -- src/features/interview-preparation/generation-repository.ts src/features/interview-preparation/generation-service.ts src/features/interview-preparation/generation-http.ts src/app/api/applications/[id]/interview/questions/generate/route.ts src/features/interview-preparation/generation-service.test.ts src/features/interview-preparation/generation-http.test.ts src/lib/supabase/database.types.ts
    git commit -m "feat: add interview question generation API"

## Task 4: Add explicit review actions and application UI

Files:
- Create: src/features/interview-preparation/generation-actions.ts
- Create: src/features/interview-preparation/generation-control.tsx
- Test: src/features/interview-preparation/generation-actions.test.ts
- Test: src/features/interview-preparation/generation-control.test.tsx
- Modify: src/features/interview-preparation/schemas.ts
- Modify: src/features/interview-preparation/repository.ts
- Modify: src/features/interview-preparation/components.tsx
- Modify: src/app/(app)/applications/[id]/page.tsx

- [ ] Step 1: Write failing action/component tests

Assert actions require requireUser, validate application/run/candidate UUIDs, call the intended repository method, and revalidate the application path. Render a Generate button with no automatic fetch; a mocked POST must show pending cards containing category, 可能会问, source excerpt, reason, and checkboxes. No selection disables accept. Review tests cover accepted, reused, duplicate-common, failed, consent, and cost states. Expected red result: action/control modules and source-excerpt hydration are absent.

- [ ] Step 2: Run the red tests

    pnpm exec vitest run src/features/interview-preparation/generation-actions.test.ts src/features/interview-preparation/generation-control.test.tsx

- [ ] Step 3: Add review actions and source-excerpt hydration

Add acceptInterviewQuestionCandidatesAction and rejectInterviewQuestionCandidatesAction as server actions parsing applicationId, runId, and candidate UUIDs, calling the corresponding repository RPC, and revalidating the application path plus /interview when appropriate. Extend InterviewQuestion.applicationLinks with sourceExcerpt: string | null; select/map source_excerpt and display it in the current application's preparation card.

- [ ] Step 4: Implement explicit client control and page wiring

generation-control.tsx keeps idle/loading/ready/failed state and selected IDs. Only a click handler may call POST /api/applications/{id}/interview/questions/generate; only review handlers may call server actions. There is no generation useEffect. The application detail page loads latest run/candidates only for tab=interview, mounts the control above the existing list, and leaves global /interview unchanged. Refresh after review so AI source/predicted label and source excerpt survive reload.

- [ ] Step 5: Run focused UI tests, typecheck, and commit

    pnpm exec vitest run src/features/interview-preparation/generation-actions.test.ts src/features/interview-preparation/generation-control.test.tsx src/features/interview-preparation/components.test.tsx src/features/interview-preparation/repository.test.ts
    pnpm exec tsc --noEmit
    git add -- src/features/interview-preparation/generation-actions.ts src/features/interview-preparation/generation-control.tsx src/features/interview-preparation/generation-actions.test.ts src/features/interview-preparation/generation-control.test.tsx src/features/interview-preparation/schemas.ts src/features/interview-preparation/repository.ts src/features/interview-preparation/components.tsx src/app/(app)/applications/[id]/page.tsx
    git commit -m "feat: add interview question generation review UI"

Expected: action/component/repository tests and typecheck PASS.

## Task 5: Extend privacy export

Files:
- Modify: src/features/privacy/export.ts
- Modify: src/app/api/account/export/route.ts
- Modify: src/features/privacy/export.test.ts

- [ ] Step 1: Write failing export assertions

Add fake generation runs/candidates for two users and assert the archive includes only the requested user's records and candidates whose application is owned by that user. Assert run metadata, candidate evidence, and review status are present; a raw JD placed in a non-exported fake run field is not emitted.

- [ ] Step 2: Run red and add export dependencies

    pnpm exec vitest run src/features/privacy/export.test.ts

Expected red result: no generation records in interview-preparation.json. Extend AccountExportDependencies with listInterviewGenerationRuns and listInterviewGenerationCandidates, fetch/filter by owner and owned application IDs, serialize them as generationRuns and generationCandidates, and wire repository methods in the account export route.

- [ ] Step 3: Verify and commit

    pnpm exec vitest run src/features/privacy/export.test.ts
    git add -- src/features/privacy/export.ts src/app/api/account/export/route.ts src/features/privacy/export.test.ts
    git commit -m "feat: export interview generation records"

Expected: export tests PASS with no unowned generation data.

## Task 6: Add fake-provider authenticated E2E coverage

Files:
- Modify: tests/e2e/application-workspace.spec.ts

- [ ] Step 1: Write the failing scenario

With E2E_FAKE_EXTRACTOR=1, open an owned application’s 面试准备 tab and click 生成岗位增量题. Assert cards show category, 可能会问, JD excerpt, and reason; assert the candidate is not in the question list before review. Select one and click 加入所选题库; assert the accepted question, source excerpt, and possibility label appear, survive reload, and do not increase the common count. Reject another candidate with 暂不加入. Click generation again and assert reused response/no second fake-provider request.

- [ ] Step 2: Run red, then green

    E2E_FAKE_EXTRACTOR=1 pnpm exec playwright test tests/e2e/application-workspace.spec.ts --grep "interview question generation"

Expected before implementation: FAIL at missing control/API. Expected after Tasks 1–5: PASS with no real provider request and no bank mutation before explicit acceptance.

- [ ] Step 3: Commit the E2E slice

    git add -- tests/e2e/application-workspace.spec.ts
    git commit -m "test: cover reviewed interview question generation"

## Task 7: Full verification and release handoff

Files:
- Verify all files from Tasks 1–6; make no unrelated edits.

- [ ] Step 1: Reset locally and run all pgTAP tests from /private/tmp

    pnpm exec supabase db reset
    TMP_DB_TEST_DIR="$(mktemp -d /private/tmp/interview-ai-pgtap.XXXXXX)"
    cp -R supabase/tests/database "$TMP_DB_TEST_DIR/database"
    pnpm exec supabase test db "$TMP_DB_TEST_DIR/database"

Expected: all database suites pass locally, including generation RLS/atomic tests; no cloud project is contacted.

- [ ] Step 2: Run schema lint, verify, typecheck, lint, and whitespace checks

    pnpm exec supabase db lint --local --schema public --level error --fail-on error
    pnpm verify
    pnpm exec tsc --noEmit
    pnpm lint
    git diff --check

Expected: all commands PASS and generated database types have no EOF blank line.

- [ ] Step 3: Build and run complete local E2E

    pnpm build
    E2E_FAKE_EXTRACTOR=1 pnpm test:e2e

Expected: Next production build and complete local E2E PASS using the fake provider only.

- [ ] Step 4: Review safety invariants

Inspect the final diff for no raw JD in run result/error/logging, no facts/resume in provider input, no automatic client invocation, no direct authenticated table writes, owner/cross-user RPC checks, explicit acceptance before bank mutation, common deduplication, source excerpt only on application links, and possibility wording on every generated link/question.

- [ ] Step 5: Release handoff without cloud mutation

Record exact migration, pgTAP, schema-lint, unit, typecheck, build, and E2E outcomes. Do not run supabase db push, production deployment, or any cloud migration.
