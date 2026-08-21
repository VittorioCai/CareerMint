# Interview AI Question Generation Design

**Date:** 2026-08-21
**Status:** Approved implementation design
**Scope:** Application-scoped, explicit AI generation of interview-question candidates with user-controlled import

## Goal and product rules

An authenticated user may open an application's **面试准备** tab and explicitly request a small set of job-increment interview questions. The model produces at most six reviewable candidates; it never writes the question bank during generation. The user must select candidates and click **加入所选题库** before any question or application link is created. Every generated or newly linked job-increment question is presented as **可能会问**, never as an employer certainty.

Generation sends only the application's job-description text, the existing structured JD requirements, and the user's existing common-question prompts. Career facts, resume text, source files, and the complete question bank are excluded from the provider input. The feature is unavailable without the existing AI-processing consent.

The first release is intentionally synchronous from the user's perspective: a POST creates or reuses a durable run, claims it, calls the configured provider, validates the response, and stores candidates. There is no background worker, automatic page-load invocation, or AI call from the global `/interview` page.

## Architecture

The feature has five boundaries:

1. `AIProvider.generateInterviewQuestions` is the only provider-facing interface. The DeepSeek adapter uses JSON mode, disabled thinking, a fixed system prompt, and a maximum output budget of approximately 4096 tokens. A deterministic fake provider is used in CI and local E2E; real API calls are never needed for tests.
2. `interview_question_generation_runs` records owner/application identity, input hash, provider metadata, status, safe result metadata, and safe failure metadata. It never stores raw JD text. A unique owner/application/hash/provider/model key makes repeated clicks idempotent; changing unrelated job-specific question-bank rows does not change the hash.
3. `interview_question_candidates` stores validated, ordered candidates belonging to one run. A completed AI run writes candidates only; it does not create questions or application links.
4. Review RPCs are the only path from candidates to the question bank. A single owner-scoped transaction locks the run and selected candidates, handles canonical reuse/duplicate decisions, creates or reuses questions, creates application links with JD evidence, and updates candidate statuses atomically.
5. The application interview panel owns the explicit controls. It renders pending candidates with category, evidence excerpt, reason, and checkboxes; a separate accept action imports selected candidates. Existing preparation cards remain the source of truth after refresh.

## Data model and database contracts

Migration: `supabase/migrations/202608210001_interview_ai_question_generation.sql`.

### `application_interview_questions`

Add nullable `source_excerpt text` with a bounded check (1–240 characters when present). It is the exact or normalized JD excerpt supporting a generated application link. Existing manual/builtin links remain `NULL`. Existing `predicted` and `relevance_reason` fields remain the presentation contract; generated links set `predicted = true`.

### `interview_question_generation_runs`

```sql
id uuid primary key default gen_random_uuid()
user_id uuid not null references auth.users(id) on delete cascade
application_id uuid not null references public.applications(id) on delete cascade
input_hash text not null check (char_length(input_hash) = 64)
schema_version text not null
provider text not null
model text not null
status text not null check (status in ('queued', 'running', 'succeeded', 'failed'))
attempt_count integer not null default 0 check (attempt_count >= 0)
result jsonb
error_code text
error_message text
request_id text
input_cache_hit_tokens integer not null default 0
input_cache_miss_tokens integer not null default 0
output_tokens integer not null default 0
estimated_cost jsonb
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
completed_at timestamptz
unique (user_id, application_id, input_hash, provider, model)
```

`result` always contains `acceptedCandidateCount`, `rejectedCandidateCount`, `pendingCandidateCount`, safe AI metadata, and `estimatedCost` (nullable). `error_message` is a stable user-safe message. Neither field contains JD text, resume text, facts, or provider prompt content. The table has owner-only `SELECT` RLS. Authenticated users receive no direct insert/update/delete grants; security-definer RPCs perform writes after owner checks.

### `interview_question_candidates`

```sql
id uuid primary key default gen_random_uuid()
run_id uuid not null references public.interview_question_generation_runs(id) on delete cascade
application_id uuid not null references public.applications(id) on delete cascade
user_id uuid not null references auth.users(id) on delete cascade
sort_order integer not null check (sort_order between 1 and 6)
category text not null check (category in ('function', 'industry', 'job_specific'))
prompt text not null check (char_length(btrim(prompt)) between 8 and 500)
canonical_key text not null check (char_length(btrim(canonical_key)) between 1 and 500)
source_excerpt text not null check (char_length(btrim(source_excerpt)) between 1 and 240)
relevance_reason text not null check (char_length(btrim(relevance_reason)) between 1 and 700)
status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected'))
question_id uuid references public.interview_questions(id) on delete set null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique (run_id, sort_order)
```

Candidates have owner-only `SELECT` RLS and no direct authenticated write grants. A candidate's `source_excerpt` is allowed because it is the review evidence the user requested; the run itself still has no raw JD. The completion RPC accepts no more than six candidates and stores them with `pending` status; it computes `canonical_key` in PostgreSQL from `prompt`, so the client cannot forge that field. A candidate can move only from `pending` to `accepted` or `rejected` through review RPCs.

### RPC contracts

All RPCs below are `SECURITY DEFINER`, use `set search_path = ''`, begin by deriving `auth.uid()`, and raise `42501` for anonymous calls, `P0002` for an unowned resource, and `22023` for invalid input. They are granted to `authenticated` only; table writes remain unavailable to the role.

- `create_or_get_interview_question_generation(target_application_id uuid, target_input_hash text, target_schema_version text, target_provider text, target_model text) returns interview_question_generation_runs`: validates application ownership and returns the unique run. A succeeded run is reused immediately; queued, failed, and running runs are passed to the database-authoritative claim contract. A fresh running run claims false and is reused without a provider call; a stale running run may be reclaimed by the database lease and then call the provider. A new run starts queued.
- `claim_interview_question_generation(target_run_id uuid, expected_attempt_count integer, expected_status text) returns boolean`: claims only when both the status and attempt token still match. Queued/failed runs claim directly; a running run is reclaimable only when the database `updated_at` is older than two minutes. It increments `attempt_count` and clears prior result/error data in the same transaction.
- `complete_interview_question_generation(target_run_id uuid, expected_attempt_count integer, target_candidates jsonb, target_rejected_candidate_count integer, target_ai_usage jsonb, target_estimated_cost jsonb, target_request_id text) returns interview_question_generation_runs`: locks a running owner run with the expected attempt token, validates a maximum of six candidate objects, reads the owner application's `jd_text`, and for every candidate checks that `sourceExcerpt` is contained in the NFKC/lower-case/Unicode-whitespace-folded JD. The target objects contain only `category`, `prompt`, `sourceExcerpt`, and `relevanceReason`; the RPC does not accept a client `canonicalKey`. It computes `canonical_key` with `normalize_interview_question_prompt(prompt)`, inserts candidates only, stores `acceptedCandidateCount = 0`, `rejectedCandidateCount = target_rejected_candidate_count`, `pendingCandidateCount = valid candidate count`, safe AI metadata, and `estimatedCost`, then marks the run succeeded. A stale worker with an old attempt gets P0002 and performs no write. Accept/reject RPCs update these three counts atomically after candidate status changes. Any excerpt or shape failure rolls back the complete call. It never inserts into `interview_questions` or `application_interview_questions`.
- `fail_interview_question_generation(target_run_id uuid, expected_attempt_count integer, target_error_code text, target_error_message text, target_request_id text) returns interview_question_generation_runs`: locks a running owner run with the expected attempt token, stores allowlisted error metadata, and marks it failed without changing the question bank or candidates from another run. Service recovery reads after ambiguous writes; terminal/newer attempts are returned as reused, while the same attempt gets one safe retry.
- `accept_interview_question_candidates(target_application_id uuid, target_candidate_ids uuid[]) returns table(candidate_id uuid, disposition text, question_id uuid)`: locks the owner run(s), then selected candidates in ascending ID order. It accepts only pending candidates from the target application. For each canonical key: an existing non-common question is reused and linked; a wording difference is stored as a variant; a new candidate creates `source = 'ai'` and a predicted application link; an existing common question is marked rejected/duplicate and is not linked or copied. The transaction writes candidate statuses, question/variant rows, application links, and `source_excerpt` together.
- `reject_interview_question_candidates(target_run_id uuid, target_candidate_ids uuid[]) returns integer`: owner-locks pending candidates from the run and marks them rejected without question-bank writes.

The accept function uses one lock order: run rows by UUID, candidate rows by UUID, then existing question rows by canonical key. New question insertion relies on the `(user_id, canonical_key)` unique key. This prevents a selected candidate from being reintroduced after a concurrent canonical decision and avoids cross-user locks.

## Input, output, and validation

The provider input type is deliberately narrow:

```ts
type InterviewQuestionGenerationInput = {
  jdText: string;
  requirements: Array<{
    id: string;
    category: string;
    text: string;
    sourceExcerpt: string | null;
    priority: string;
  }>;
  commonPrompts: string[];
};
```

The JSON output is an array under `{ "questions": [...] }`; each object has `category`, `prompt`, `sourceExcerpt`, and `relevanceReason`. `category` is exactly `function`, `industry`, or `job_specific`. The fixed prompt instructs the model to propose possibilities grounded in the JD, never invent employer certainty, never include common questions, and return only the declared JSON shape.

Program validation runs after provider parsing and before the completion RPC:

- Normalize prompt with the existing NFKC, trim, lower-case, trailing-punctuation removal, and whitespace-folding helper; reject duplicate canonical keys within the output and exact canonical matches of common prompts.
- Require prompt length 8–500, reason length 1–700, and excerpt length 1–240.
- Accept an excerpt when it appears verbatim in the JD or when both values match after NFKC normalization, Unicode-whitespace folding, and case-insensitive comparison. The stored excerpt remains the model-returned bounded text.
- Reject unknown categories, blank fields, invented excerpts, and malformed objects. Keep the first six valid, canonical-unique candidates in provider order. The provider adapter retries only malformed JSON or provider-output Zod schema invalidity once. If provider output is schema-valid but grounding, common-duplicate, or canonical-dedup validation leaves zero valid candidates, the service fails with `interview-question-generation-invalid-output` without a second provider call; a partial valid response is completed with a rejected count.

The generation input hash uses SHA-256 over a stable object containing `schemaVersion`, provider, model, full JD text, requirements sorted by stable ID with their structured fields, and common prompts sorted by normalized prompt. It does not include career facts, resume data, or non-common question-bank rows. Thus editing existing job-specific questions cannot create a new billable generation input.

## End-to-end data flow

```text
user clicks Generate
  -> POST /api/applications/:id/interview/questions/generate
  -> auth + owned application + AI consent
  -> list structured requirements + common prompts
  -> stable input hash
  -> create_or_get run
      -> succeeded: return reused state, no provider call
      -> queued/failed/fresh running: database claim; a false claim returns reused state without a provider call
      -> stale running: database lease reclaim, then provider call only after the incremented attempt is verified
  -> provider.generateInterviewQuestions (JD + requirements + common prompts only)
  -> schema/grounding/dedup/max-six validation
  -> complete RPC (run metadata + pending candidates only)
  -> UI renders review cards
  -> user checks candidates and clicks Add selected
  -> accept RPC (single transaction: lock, dedup/reuse/create, link, status update)
  -> refresh application interview panel and show accepted/reused questions
```

A provider or storage failure updates only the run's safe failed state. Existing question-bank records and prior candidate runs remain unchanged. A repeated click while a run is running or succeeded returns the durable run and does not call the provider again. The UI may offer a retry only as an explicit action for a failed run; it never retries silently on page load.

## Application and UI behavior

The application detail server page loads the latest generation run and its candidates only when `tab=interview`. The panel contains a client control with:

- an explicit **生成岗位增量题** button and consent-required explanation when no consent exists;
- candidate cards showing category, **可能会问**, prompt, JD 依据 excerpt, relevance reason, pending/accepted/rejected state, and a checkbox;
- **加入所选题库** disabled with no selection, plus **暂不加入** to reject selected pending candidates;
- success states for new, reused, duplicate-common, and accepted counts; failure state with a safe message; and cost only when the configured price schedule supplies it;
- no call in `useEffect`, no call while rendering, and no generation control on `/interview` global common bank.

`InterviewQuestion.applicationLinks` gains nullable `sourceExcerpt`; the existing preparation card displays the excerpt for the current application. Generated questions use the existing `source = 'ai'` and `predicted = true` signals so the label remains consistent after a full reload.

## Privacy, observability, and cost

Account export adds `generationRuns` and `generationCandidates` to `interview-preparation.json`, filtered by the authenticated owner and owned application IDs. Export contains only stored run metadata and candidate review content; it does not reconstruct or duplicate the complete JD in a run record.

Provider logs retain provider, model, request ID, HTTP status, latency, token counts, and safe error code only. No raw JD, full resume, facts, provider prompt, or model response is logged. Run metadata stores input/output token counts, request ID, and a configured estimated cost object when a matching price schedule exists. The cost is an estimate, not an employer or billing guarantee.

## Error and safety policy

- Authentication, application ownership, and consent checks occur before run creation.
- Provider invalid JSON or invalid output is retried once by the adapter; all other provider failures become an allowlisted stable error.
- Grounding validation prevents unsupported JD excerpts from reaching candidates.
- Common canonical duplicates are safely rejected during review, never copied or linked as job-specific questions.
- Acceptance is explicit and transactional; no candidate is accepted because generation completed.
- RLS, owner checks, and UUID-scoped RPCs prevent cross-user reads or writes.
- UI copy says “可能会问” and “基于 JD 的准备建议”; it does not claim an employer will ask any question.

## Alternatives considered

### Direct auto-insert after generation — rejected

It violates the preview-and-review rule, makes an invalid or poorly grounded model response mutate the user's reusable bank, and makes duplicate/common handling difficult to explain. Candidates must remain pending until a click-driven accept transaction.

### Piggyback on JD analysis — rejected

JD analysis has a different output contract, lifecycle, privacy input, and review purpose. Coupling question generation to that run would make opening or rerunning analysis implicitly generate questions and would couple pricing/retries to unrelated behavior. The independent run keeps consent, idempotency, and failure isolation explicit.

### Store raw prompts or full JD in generation runs — rejected

It duplicates sensitive source text and expands export/logging exposure. The application already owns the JD; the run stores only a hash and safe metadata, while candidates retain only the bounded evidence needed for review.

## Testing strategy

- pgTAP proves table checks, RLS, grants, owner/cross-user access, hash idempotency, completion-without-bank-writes, six-candidate limit, accept/reject ownership, common duplicate handling, non-common reuse/variant behavior, source excerpt persistence, and atomic rollback.
- Schema tests prove category/length/grounding/dedup behavior and reject unsupported excerpts or common duplicates.
- Provider adapter tests prove JSON mode, thinking disabled, 4096-token cap, fixed prompt/input exclusion, metadata mapping, and one retry only for malformed JSON/provider-output schema invalidity. Service tests prove schema-valid zero-candidate sanitizer failure makes no second provider call, while partial valid output completes with rejected count.
- Service/repository/HTTP tests prove claim idempotency, safe failure, cost metadata, consent/ownership ordering, and no provider call for reused runs.
- Component/action tests prove explicit selection and review actions, duplicate/reused/failure messages, and no automatic fetch.
- Authenticated Playwright E2E uses the fake provider, generates candidates only after clicking, verifies candidates are not in the bank before acceptance, accepts selected questions, confirms the **可能会问** label and source excerpt after reload, and confirms repeated generation reuses the run without another provider request.

## Out of scope

This release does not generate questions on page load, alter the global common bank, send career facts/resume text, perform semantic similarity beyond the existing canonical normalization, add a background queue, expose a provider other than the configured DeepSeek/fake adapters, or make employer-certainty claims. It does not add JD analysis, resume generation, or any unrelated AI workflow.
