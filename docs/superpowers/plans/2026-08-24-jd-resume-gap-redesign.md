# JD Progressive Disclosure and Resume Gap Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense JD and three-column resume-rewrite screens with a progressive JD summary and an optional, application-specific baseline-resume gap analysis supplemented only by confirmed career-profile facts.

**Architecture:** Keep application detail pages as Server Components and isolate interactive upload, analysis, and disclosure controls in narrow Client Components. Store a nullable owned source-asset selection on each application, persist immutable owner-scoped gap runs/items through security-definer RPCs, extend the vendor-neutral `AIProvider` with a coverage-only method, verify every returned excerpt programmatically, and derive all user-facing gap categories locally. Preserve existing resume-generation tables, version pages, and export routes for backward compatibility while removing generation controls from the primary Resume tab.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Zod, Supabase/PostgreSQL with RLS and pgTAP, Vitest/Testing Library, Playwright, DeepSeek JSON mode, existing private source storage, PDF/DOCX parsers, and browser-local PaddleOCR fallback.

---

## File map

Create the database, domain, API, and UI files below. Modify only the listed integration points; do not delete or rewrite the existing resume-generation/version/export implementation.

- `supabase/migrations/202608240001_resume_gap_redesign.sql`: per-application baseline FK, owner-safe assignment RPC, gap-run/item storage, RLS, grants, and create/claim/complete/fail RPCs.
- `supabase/tests/database/resume_gap_redesign_rls.test.sql`: owner isolation, same-owner selection, deletion behavior, run idempotency, validation, and atomic completion tests.
- `src/features/applications/schemas.ts`, `repository.ts`, `actions.ts` and tests: hydrate and change `resumeSourceAssetId` through a narrow authenticated action.
- `src/features/resume-gaps/schemas.ts`: provider DTOs, stored DTOs, exact-excerpt sanitizer, summary classifier, priority ordering, and stable result types.
- `src/features/resume-gaps/prompt.ts`: fixed coverage-only system instructions.
- `src/features/resume-gaps/repository.ts`: typed baseline/run/item persistence and display-query methods.
- `src/features/resume-gaps/service.ts`: claim, parse, provider, sanitize, cost, complete/fail orchestration.
- `src/features/resume-gaps/http.ts`: request validation, OCR-text intake, stable input hash, idempotent handler, and sanitized responses.
- `src/app/api/applications/[id]/resume/gaps/analyze/route.ts`: authenticated production/fake wiring.
- `src/features/resume-gaps/baseline-selector.tsx`: select existing, upload new, replace, skip, and setup-mode continuation.
- `src/features/resume-gaps/gap-analysis-control.tsx`: explicit model call, progress, retry, and browser OCR fallback.
- `src/features/resume-gaps/gap-panel.tsx`: deterministic grouped gap display and profile-only mode.
- `src/features/jd-analysis/requirements-panel.tsx`: summary dashboard, priority/all/source views, and accessible requirement disclosure.
- `src/app/(app)/applications/[id]/page.tsx`: server-side data loading and primary JD/Resume tab composition.
- `src/features/extraction/provider.ts`, `deepseek-extractor.ts` and tests: add `analyzeResumeGaps` without binding business code to DeepSeek.
- `src/features/privacy/export.ts`, `src/app/api/account/export/route.ts` and tests: include the user's baseline IDs and sanitized gap history in account export.
- `tests/e2e/application-workspace.spec.ts`: replace primary resume-generation assertions with upload/skip/gap flows while retaining a seeded historical-version export assertion.

## Task 1: Add the owner-safe database contract

Files:
- Create: `supabase/migrations/202608240001_resume_gap_redesign.sql`
- Create: `supabase/tests/database/resume_gap_redesign_rls.test.sql`

- [ ] Step 1: Write the failing pgTAP contract first

Create two authenticated users, two applications, and one source asset per user. Assert all of the following before adding the migration:

- `applications.resume_source_asset_id` is nullable and references `source_assets(id)` with `on delete set null`.
- `set_application_resume_source(application_id, asset_id)` accepts an owned asset, accepts `null` for skip, rejects another user's asset with `P0002/application-or-resume-not-found`, and never mutates another application.
- deleting the selected source asset clears only the application's active selection.
- `resume_gap_runs` and `resume_gap_items` can be selected only by their owner and cannot be inserted/updated/deleted directly by `authenticated`.
- `create_or_get_resume_gap` is idempotent for `(user, application, input_hash, provider, model)`.
- claim increments `attempt_count`, fresh running work is not claimed twice, and a two-minute stale lease may be reclaimed.
- completion validates that the selected application, JD analysis run, requirement IDs, source asset, filename/SHA snapshots, and current authenticated user agree.
- completion rejects unknown, duplicate, missing, cross-run, or cross-owner requirement IDs atomically.
- completion stores exactly one sanitized item per requirement and never stores full JD/resume text.
- fail records only an allowlisted code/message and does not delete the preceding succeeded run.

Run the focused test before implementation:

```bash
pnpm exec supabase db reset
pnpm exec supabase test db supabase/tests/database/resume_gap_redesign_rls.test.sql
```

Expected: FAIL because the new column, tables, and functions do not exist.

- [ ] Step 2: Implement the forward-only migration

Use the following physical shape, with all text bounds expressed as `check` constraints and all security-definer functions using `set search_path = ''`:

```sql
alter table public.applications
  add column resume_source_asset_id uuid
  references public.source_assets(id) on delete set null;

create type public.resume_coverage as enum ('covered', 'partial', 'missing');

create table public.resume_gap_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_run_id uuid not null references public.application_analysis_runs(id) on delete cascade,
  source_asset_id uuid references public.source_assets(id) on delete set null,
  source_filename_snapshot text not null check (char_length(source_filename_snapshot) between 1 and 255),
  source_sha256_snapshot text not null check (source_sha256_snapshot ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null check (char_length(provider) between 1 and 80),
  model text not null check (char_length(model) between 1 and 160),
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_id, input_hash, provider, model)
);

create table public.resume_gap_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.resume_gap_runs(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requirement_id uuid references public.application_requirements(id) on delete set null,
  requirement_text_snapshot text not null,
  requirement_category_snapshot text not null,
  requirement_priority_snapshot text not null,
  jd_source_excerpt_snapshot text not null,
  resume_coverage public.resume_coverage not null,
  resume_excerpt text,
  sort_order integer not null check (sort_order >= 0),
  unique (run_id, sort_order)
);
```

The snapshot columns keep a prior successful display readable after a later JD analysis replaces requirement rows. Add indexes for application/latest-run and run/item order. Enable RLS; grant `select` only to `authenticated`; revoke all direct mutations.

Expose only these authenticated RPCs:

```sql
set_application_resume_source(uuid, uuid) returns public.applications;
create_or_get_resume_gap(uuid, uuid, uuid, text, text, text)
  returns public.resume_gap_runs;
claim_resume_gap(uuid, integer) returns boolean;
complete_resume_gap(uuid, integer, jsonb, jsonb, jsonb)
  returns public.resume_gap_runs;
fail_resume_gap(uuid, integer, text, text) returns public.resume_gap_runs;
```

`set_application_resume_source` locks the application, derives the caller from `auth.uid()`, verifies both resources belong to that caller, and allows `null` to skip. `create_or_get_resume_gap` reads filename and SHA from the owned asset and takes only IDs plus hash/provider/model from TypeScript; it must not trust caller-supplied snapshots. `complete_resume_gap` takes `expected_attempt_count`, `items`, safe AI usage, and estimated cost. It locks the run, validates the attempt is current/running, verifies the item keys are exactly `requirementId`, `resumeCoverage`, and `resumeExcerpt`, checks the requirement belongs to the run's analysis/application, snapshots requirement fields, then inserts all items and marks the run succeeded in one transaction. It computes result counts server-side.

- [ ] Step 3: Make database tests green and regenerate types

```bash
pnpm exec supabase db reset
pnpm exec supabase test db supabase/tests/database/resume_gap_redesign_rls.test.sql
pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts
pnpm exec tsc --noEmit
```

Expected: focused pgTAP PASS and TypeScript recognizes the new column, tables, enum, and RPCs.

- [ ] Step 4: Commit the database slice

```bash
git add -- supabase/migrations/202608240001_resume_gap_redesign.sql supabase/tests/database/resume_gap_redesign_rls.test.sql src/lib/supabase/database.types.ts
git commit -m "feat: add application resume gap storage"
```

## Task 2: Add baseline selection to applications

Files:
- Modify: `src/features/applications/schemas.ts`
- Modify: `src/features/applications/schemas.test.ts`
- Modify: `src/features/applications/repository.ts`
- Modify: `src/features/applications/actions.ts`
- Modify: `src/features/applications/actions.test.ts`

- [ ] Step 1: Write failing schema/repository/action tests

Assert that hydration exposes `resumeSourceAssetId: string | null`; the action accepts an application UUID and either a source-asset UUID or an empty value; invalid UUIDs fail before repository access; authentication runs before mutation; repository errors are sanitized; success revalidates `/applications/{id}`, `/applications`, and `/app`.

Use this public input contract:

```ts
export const applicationResumeSourceSchema = z.object({
  applicationId: z.uuid(),
  sourceAssetId: z.preprocess(
    (value) => value === "" || value == null ? null : value,
    z.uuid().nullable(),
  ),
});
```

Run red:

```bash
pnpm exec vitest run src/features/applications/schemas.test.ts src/features/applications/actions.test.ts
```

- [ ] Step 2: Implement the narrow repository/action contract

Extend `Application` and `toApplication` with `resumeSourceAssetId`. Add only this repository method:

```ts
setResumeSource(input: {
  applicationId: string;
  sourceAssetId: string | null;
}): Promise<Application>;
```

It calls `set_application_resume_source`, never performs a direct table update, and maps both unowned/missing application and unowned/missing asset to `application-or-resume-not-found`. Add `setApplicationResumeSourceAction`, derive the user through `requireUser`, validate client data, call the repository, and return `{ok: true, applicationId}` without returning the application row.

- [ ] Step 3: Verify and commit

```bash
pnpm exec vitest run src/features/applications/schemas.test.ts src/features/applications/actions.test.ts
pnpm exec tsc --noEmit
git add -- src/features/applications/schemas.ts src/features/applications/schemas.test.ts src/features/applications/repository.ts src/features/applications/actions.ts src/features/applications/actions.test.ts
git commit -m "feat: select a baseline resume per application"
```

## Task 3: Define coverage-only schemas, sanitizer, and classifier

Files:
- Create: `src/features/resume-gaps/schemas.ts`
- Create: `src/features/resume-gaps/schemas.test.ts`

- [ ] Step 1: Write the failing domain tests

Cover provider-output strictness, unknown IDs, duplicate IDs, missing IDs, extra fields, missing-with-excerpt rejection, covered/partial-without-excerpt rejection, normalized exact substring verification, maximum excerpt length, and exactly one valid item per supplied requirement. Cover all deterministic display combinations and stable ordering:

| Resume coverage | Confirmed profile evidence | Display group |
|---|---:|---|
| missing | yes | `resume_omission` |
| missing | no | `missing_evidence` |
| partial | either | `partial_coverage` |
| covered | either | `covered` |

Profile-only mode derives its groups directly from JD `matchStatus` and must never render or return the `resume_omission` label. Priority ordering must put core missing evidence first and cap the priority list at five.

Run red:

```bash
pnpm exec vitest run src/features/resume-gaps/schemas.test.ts
```

- [ ] Step 2: Implement strict provider and stored DTOs

Use strict schemas so the provider cannot smuggle prose or rewrite instructions into storage:

```ts
export const resumeGapProviderOutputSchema = z.object({
  items: z.array(z.object({
    requirementId: z.uuid(),
    resumeCoverage: z.enum(["covered", "partial", "missing"]),
    resumeExcerpt: z.string().trim().min(1).max(700).nullable(),
  }).strict()).max(80),
}).strict();

export type ResumeGapAnalysisInput = {
  resumeText: string;
  requirements: Array<{
    id: string;
    category: RequirementCategory;
    text: string;
    priority: "core" | "supporting";
  }>;
};
```

Normalize comparison text with the existing `normalizeResumeText` behavior plus NFKC and Unicode-whitespace folding. `covered` and `partial` require an excerpt whose folded value is an exact substring of the folded resume. `missing` requires `null`. Reject the entire output if any required ID is absent or duplicated after unknown IDs are discarded; do not partially complete a run.

Implement the display classifier as a pure function:

```ts
export function classifyGap(item: ResumeGapItemView): ResumeGapGroup {
  if (item.resumeCoverage === "covered") return "covered";
  if (item.resumeCoverage === "partial") return "partial_coverage";
  return item.profileEvidence.length > 0
    ? "resume_omission"
    : "missing_evidence";
}
```

The deterministic explanation is also pure and contains no model prose, for example: “当前简历未出现这项要求，但职业档案中已有 2 条已确认事实。”

- [ ] Step 3: Verify and commit

```bash
pnpm exec vitest run src/features/resume-gaps/schemas.test.ts
git add -- src/features/resume-gaps/schemas.ts src/features/resume-gaps/schemas.test.ts
git commit -m "feat: define deterministic resume gap classification"
```

## Task 4: Extend the vendor-neutral provider and DeepSeek adapter

Files:
- Create: `src/features/resume-gaps/prompt.ts`
- Modify: `src/features/extraction/provider.ts`
- Modify: `src/features/extraction/deepseek-extractor.ts`
- Modify: `src/features/extraction/deepseek-extractor.test.ts`

- [ ] Step 1: Write failing adapter tests

Mock DeepSeek and assert:

- `AIProvider.analyzeResumeGaps` exists and accepts only requirements plus resume text.
- JSON mode is enabled, `thinking` is disabled, and a bounded `max_tokens` is used.
- fixed instructions precede variable resume/requirements content for cache friendliness.
- the prompt says comparison only, forbids rewriting, and requests exactly the three output keys.
- malformed JSON or Zod-invalid output retries once; a valid but ungrounded excerpt is not the adapter's concern and is rejected later by the service sanitizer without another provider call.
- logs contain provider/model/request ID/status/latency/token counts only, never resume text, JD text, or raw response content.

Run red:

```bash
pnpm exec vitest run src/features/extraction/deepseek-extractor.test.ts
```

- [ ] Step 2: Add the provider method and prompt

Extend the independent interface rather than importing DeepSeek into business logic:

```ts
analyzeResumeGaps(
  input: ResumeGapAnalysisInput,
): Promise<AIResult<ResumeGapProviderOutput>>;
```

The system prompt must say that the model classifies whether each supplied requirement is explicitly present in the supplied resume and copies a short exact excerpt when present. It must prohibit suggestions, inferred experience, new facts, commentary, and omitted requirement IDs. Serialize user content with explicit `<requirements_json>` and `<resume_document>` delimiters. Use `resume-gap-invalid-output` as the adapter's stable output error.

- [ ] Step 3: Verify existing adapters remain green and commit

```bash
pnpm exec vitest run src/features/extraction/deepseek-extractor.test.ts src/features/extraction/service.test.ts src/features/jd-analysis/service.test.ts src/features/resume-customization/service.test.ts src/features/interview-preparation/generation-service.test.ts
pnpm exec tsc --noEmit
git add -- src/features/resume-gaps/prompt.ts src/features/extraction/provider.ts src/features/extraction/deepseek-extractor.ts src/features/extraction/deepseek-extractor.test.ts
git commit -m "feat: add resume gap provider contract"
```

## Task 5: Implement run persistence, parsing, caching, and the HTTP boundary

Files:
- Create: `src/features/resume-gaps/repository.ts`
- Create: `src/features/resume-gaps/repository.test.ts`
- Create: `src/features/resume-gaps/service.ts`
- Create: `src/features/resume-gaps/service.test.ts`
- Create: `src/features/resume-gaps/http.ts`
- Create: `src/features/resume-gaps/http.test.ts`

- [ ] Step 1: Write failing repository/service/HTTP tests

Use dependency injection and fake rows to assert:

- unauthenticated, invalid application, unowned application, no consent, no JD run, no requirements, no selected resume, and deleted/unowned asset fail before provider creation;
- the source file is downloaded and parsed only after ownership and consent checks;
- supplied browser OCR text is normalized and used instead of download/parse;
- parser errors return `resume-text-too-short`, `unsupported-content-type`, or a safe `resume-gap-parse-failed` without creating a provider response log;
- the hash is stable across requirement order but changes with schema version, provider/model, source SHA, requirement ID/text/category/priority, or JD analysis run;
- succeeded/fresh-running identical work returns `reused: true` without parsing/provider calls;
- the run is claimed before provider creation; stale attempts cannot complete/fail a newer attempt;
- sanitization failure calls `fail` once, makes no second provider call, and leaves prior succeeded runs queryable;
- matching price schedule records only safe usage/cost metadata.

Run red:

```bash
pnpm exec vitest run src/features/resume-gaps/repository.test.ts src/features/resume-gaps/service.test.ts src/features/resume-gaps/http.test.ts
```

- [ ] Step 2: Implement the repository

Expose `createOrGet`, `claim`, `getOwned`, `getLatest`, `getLatestSucceeded`, `listItems`, `complete`, and `fail`. Hydrate Zod-validated stored JSON and stable enums. `getLatestSucceeded` supports the “previous result preserved” state after a newer failure; the UI must label it stale when its asset SHA or JD analysis run differs from the active inputs.

`listItems` joins current confirmed JD evidence by `requirement_id` when it still exists; if it was replaced, it returns the requirement snapshots with an empty evidence list and labels the run historical. Never treat resume excerpts as confirmed career facts.

- [ ] Step 3: Implement the service

The service receives an already-owned `SourceAsset`, the latest succeeded `JDAnalysisRun`, current requirements, and a provider. It claims the run, downloads the private blob through `downloadSource`, extracts text through `extractResumeText`, or uses validated `ocrText`, then calls `analyzeResumeGaps` once. It sanitizes against normalized resume text, estimates cost only for a matching configured schedule, and completes with the current attempt token. Map failures to this allowlist:

```ts
const safeErrors = new Set([
  "resume-text-too-short",
  "resume-text-too-long",
  "unsupported-content-type",
  "source-download-failed",
  "resume-gap-invalid-output",
  "ai-provider-rate-limited",
  "ai-provider-request-failed",
  "ai-provider-timeout",
]);
```

Authentication/API-key failures become `resume-gap-unavailable`; all other failures become `resume-gap-failed`. Error messages contain no filename, JD, resume text, excerpt, provider body, or stack trace.

- [ ] Step 4: Implement the hash and POST handler

Use `/api/applications/[id]/resume/gaps/analyze`. Accept either an empty POST body or strict JSON `{ocrText: string}` capped at 1 MiB, following the existing source-extraction HTTP reader. Build the cache key from a stable projection:

```ts
{
  schemaVersion: "resume-gap-v1",
  provider,
  model,
  analysisRunId,
  sourceSha256,
  requirements: sorted.map(({id, category, text, priority}) => ({
    id, category, text, priority,
  })),
}
```

Do not include confirmed career facts because they do not change resume coverage; the display classifier recomputes profile supplementation from the current confirmed evidence without spending tokens.

- [ ] Step 5: Verify and commit

```bash
pnpm exec vitest run src/features/resume-gaps/repository.test.ts src/features/resume-gaps/service.test.ts src/features/resume-gaps/http.test.ts
pnpm exec tsc --noEmit
git diff --check
git add -- src/features/resume-gaps/repository.ts src/features/resume-gaps/repository.test.ts src/features/resume-gaps/service.ts src/features/resume-gaps/service.test.ts src/features/resume-gaps/http.ts src/features/resume-gaps/http.test.ts
git commit -m "feat: analyze and cache resume gaps safely"
```

## Task 6: Wire the authenticated API route and deterministic fake provider

Files:
- Create: `src/app/api/applications/[id]/resume/gaps/analyze/route.ts`
- Create: `src/app/api/applications/[id]/resume/gaps/analyze/route.test.ts`

- [ ] Step 1: Write failing route wiring tests

Assert Node runtime/max duration, current-user and consent repositories, application/latest-succeeded-JD/requirement/asset lookups, storage/parser composition, price configuration, and DeepSeek provider configuration. Assert `E2E_FAKE_EXTRACTOR=1` is honored only outside production. Assert the fake provider deterministically returns one covered, one partial, and remaining missing result using exact substrings from the fixture resume.

- [ ] Step 2: Implement route composition

Follow the existing JD and interview routes: `providerConfiguration()` returns `{provider, model}`, `providerFactory()` constructs DeepSeek only after all request guards pass, and price parsing warns with a fixed metadata-only message. The fake provider must depend only on the supplied requirements/resume text and must not execute in production.

Return only:

```json
{
  "runId": "uuid",
  "status": "succeeded",
  "reused": false,
  "errorCode": null
}
```

Never return parsed resume text, excerpts, requirements, raw model output, or provider errors from the mutation endpoint; the refreshed Server Component loads sanitized rows.

- [ ] Step 3: Verify and commit

```bash
pnpm exec vitest run 'src/app/api/applications/[id]/resume/gaps/analyze/route.test.ts' src/features/resume-gaps/http.test.ts
pnpm exec tsc --noEmit
git add -- 'src/app/api/applications/[id]/resume/gaps/analyze/route.ts' 'src/app/api/applications/[id]/resume/gaps/analyze/route.test.ts'
git commit -m "feat: expose authenticated resume gap analysis"
```

## Task 7: Build the application baseline selector and post-JD setup step

Files:
- Create: `src/features/resume-gaps/baseline-selector.tsx`
- Create: `src/features/resume-gaps/baseline-selector.test.tsx`
- Modify: `src/features/applications/application-draft-form.tsx`
- Modify: `src/features/applications/application-draft-form.test.tsx`
- Modify: `src/features/source-assets/repository.ts`
- Modify: `src/app/(app)/applications/[id]/page.tsx`

- [ ] Step 1: Write failing selector and navigation tests

Cover these user paths:

- after application creation, navigation goes to `/applications/{id}?tab=resume&setup=1` rather than the overview;
- existing assets show filename and upload date, newest first;
- selecting an existing asset calls the server action once and refreshes;
- uploading PDF/DOCX calls the existing `/api/source-assets` endpoint, then selects the returned asset without calling `/extract` or writing profile facts;
- replace preserves the old source asset;
- skip passes `null`, exits setup mode, and never calls the gap API;
- invalid/upload failures preserve the current selection and show specific copy;
- all buttons, file input, and selection controls have accessible labels and pending states.

Run red:

```bash
pnpm exec vitest run src/features/resume-gaps/baseline-selector.test.tsx src/features/applications/application-draft-form.test.tsx
```

- [ ] Step 2: Implement a baseline-only upload path

Reuse `/api/source-assets` for validation and private upload, but do not reuse `UploadForm`'s automatic profile extraction. `BaselineSelector` posts the file, receives `{id, originalName}`, calls `setApplicationResumeSourceAction`, and refreshes. This guarantees a comparison upload does not create pending or confirmed career facts.

The selector receives serializable server props:

```ts
type ResumeAssetOption = {
  id: string;
  originalName: string;
  contentType: string;
  createdAt: string;
};

type BaselineSelectorProps = {
  applicationId: string;
  selectedAsset: ResumeAssetOption | null;
  availableAssets: ResumeAssetOption[];
  setupMode: boolean;
  setResumeSource(formData: FormData): Promise<ApplicationActionState>;
};
```

Do not serialize `storagePath`, SHA-256, signed URLs, or any other storage metadata into Client Component props.

In setup mode show “本次对照简历（可选）”, three choices, and a visible “暂时跳过，进入工作区”. Outside setup mode show the active filename/date plus “更换简历” and “上传新简历”. No copy may imply that upload is mandatory.

- [ ] Step 3: Load assets server-side and integrate the setup route

On the Resume tab, call `listAssets(user.id)` and resolve the selected asset from that owned list. `setup=1` affects presentation only; ownership always comes from the server. After selection or skip, navigate to the same tab without `setup=1`.

- [ ] Step 4: Verify and commit

```bash
pnpm exec vitest run src/features/resume-gaps/baseline-selector.test.tsx src/features/applications/application-draft-form.test.tsx src/app/api/source-assets/route.test.ts
pnpm exec tsc --noEmit
git add -- src/features/resume-gaps/baseline-selector.tsx src/features/resume-gaps/baseline-selector.test.tsx src/features/applications/application-draft-form.tsx src/features/applications/application-draft-form.test.tsx src/features/source-assets/repository.ts 'src/app/(app)/applications/[id]/page.tsx'
git commit -m "feat: add optional application resume setup"
```

## Task 8: Redesign the JD tab with progressive disclosure

Files:
- Modify: `src/features/jd-analysis/requirements-panel.tsx`
- Modify: `src/features/jd-analysis/requirements-panel.test.tsx`
- Modify: `src/features/jd-analysis/analysis-control.tsx`
- Modify: `src/features/jd-analysis/analysis-control.test.tsx`
- Modify: `src/app/(app)/applications/[id]/page.tsx`

- [ ] Step 1: Write failing interaction and summary tests

Assert the first viewport contains total/core/evidence/attention counts and no evidence/source excerpt by default. The default “重点” view shows at most five rows in the approved priority order. “全部要求” shows collapsed category headers with counts. “JD 原文” hides the immutable text until selected. Requirement rows expose text/priority/status, `aria-expanded`, and keyboard activation; expansion reveals reason, confirmed facts/source, then JD excerpt. Switching away closes details and returns focus to the row/view control.

Run red:

```bash
pnpm exec vitest run src/features/jd-analysis/requirements-panel.test.tsx src/features/jd-analysis/analysis-control.test.tsx
```

- [ ] Step 2: Implement the compact analysis/status row

Keep explicit analysis and cache-reuse behavior, but remove the large promotional card. Show a compact current-state sentence, last result count/cost when present, and one button (`开始分析 JD` or `重新检查匹配`). Preserve all existing failure/consent messages and the rule that no model call occurs until click.

- [ ] Step 3: Implement the three local views

Make only `RequirementsPanel` a Client Component. Pass the JD source text and optional original URL as serializable props; keep all database access in the page Server Component. Use accessible buttons for `重点`, `全部要求`, and `JD 原文`, and controlled disclosure state for predictable one-open-row behavior in the priority view. Categories and rows start collapsed.

Use the existing V2 mint tokens: white dense surfaces and thin separators for rows; cream only for the active local view; coral only for urgent chips; no heavy shadow on every requirement.

- [ ] Step 4: Verify responsive behavior and commit

```bash
pnpm exec vitest run src/features/jd-analysis/requirements-panel.test.tsx src/features/jd-analysis/analysis-control.test.tsx
pnpm exec tsc --noEmit
git add -- src/features/jd-analysis/requirements-panel.tsx src/features/jd-analysis/requirements-panel.test.tsx src/features/jd-analysis/analysis-control.tsx src/features/jd-analysis/analysis-control.test.tsx 'src/app/(app)/applications/[id]/page.tsx'
git commit -m "feat: simplify JD analysis with progressive disclosure"
```

## Task 9: Replace the primary resume editor with gap analysis

Files:
- Create: `src/features/resume-gaps/gap-analysis-control.tsx`
- Create: `src/features/resume-gaps/gap-analysis-control.test.tsx`
- Create: `src/features/resume-gaps/gap-panel.tsx`
- Create: `src/features/resume-gaps/gap-panel.test.tsx`
- Modify: `src/app/(app)/applications/[id]/page.tsx`

- [ ] Step 1: Write failing primary-flow tests

Assert:

- page heading is `简历差距` while the application tab remains `简历`;
- no selected resume shows `仅职业档案模式`, the optional selector, and no `简历漏写` copy;
- no JD analysis shows `先完成 JD 分析，才能判断简历差距` with a JD-tab link;
- with a selected resume, no API call happens until `分析简历差距` is clicked;
- success renders the four approved groups/counts, with the first three visible and `已经覆盖` collapsed;
- gap rows show only requirement/priority/status until expanded, then JD excerpt, exact resume excerpt, confirmed profile facts, and deterministic explanation;
- a failed newer run can show the previous successful result only with a clear stale filename/JD warning;
- the primary tab contains no `生成岗位简历建议`, `接受`, `修改措辞`, `拒绝`, template selector, three-column editor, or new-version action;
- historical versions stay inside a collapsed `历史版本` section and deep links are unchanged.

Run red:

```bash
pnpm exec vitest run src/features/resume-gaps/gap-analysis-control.test.tsx src/features/resume-gaps/gap-panel.test.tsx
```

- [ ] Step 2: Implement explicit analysis and OCR recovery

`GapAnalysisControl` POSTs only on click, shows progress, refreshes on completion, and reports cache reuse. If server parsing returns `resume-text-too-short` for a PDF, show “在本机识别扫描版 PDF”. On that second explicit click:

1. fetch `/api/source-assets/{id}/download` as a blob;
2. construct a `File` using the owned asset metadata;
3. dynamically import existing `extractScannedPdfText`;
4. show page progress/cancel;
5. POST strict `{ocrText}` to the gap endpoint.

The PDF bytes and OCR model stay in the browser; only recognized text is sent to the configured AI after existing AI-data consent. DOCX parse failures offer retry or another file, not OCR.

- [ ] Step 3: Implement profile-only and four-group displays

`GapPanel` consumes already-hydrated requirement/evidence/run/item DTOs and uses only pure functions from `schemas.ts`. In profile-only mode, show JD statuses as “档案已支持 / 部分匹配 / 缺少证据 / 需要判断” and keep source details collapsed. With a baseline, show “简历漏写 / 部分覆盖 / 缺少证据 / 已经覆盖”. Never copy a resume excerpt into profile evidence and never expose an add/confirm shortcut inside the gap row.

- [ ] Step 4: Preserve history without exposing generation

Remove `ResumeGenerationControl` and the current-review workspace from `ResumePanel`. Keep `resumeCustomizationRepository.listVersions` and the existing links under native/accessible collapsed `历史版本`. Do not remove:

- `src/features/resume-customization/*` generation/review code;
- `/api/applications/[id]/resume/generate`;
- `/applications/[id]/resume/[resourceId]`;
- DOCX/PDF export routes.

This preserves old bookmarks and immutable snapshots while changing only the primary navigation.

- [ ] Step 5: Verify and commit

```bash
pnpm exec vitest run src/features/resume-gaps/gap-analysis-control.test.tsx src/features/resume-gaps/gap-panel.test.tsx src/features/resume-customization/resume-editor.test.tsx src/features/resume-customization/export-http.test.ts
pnpm exec tsc --noEmit
git add -- src/features/resume-gaps/gap-analysis-control.tsx src/features/resume-gaps/gap-analysis-control.test.tsx src/features/resume-gaps/gap-panel.tsx src/features/resume-gaps/gap-panel.test.tsx 'src/app/(app)/applications/[id]/page.tsx'
git commit -m "feat: replace resume rewrite UI with gap analysis"
```

## Task 10: Include gap history in privacy export

Files:
- Modify: `src/features/privacy/export.ts`
- Modify: `src/features/privacy/export.test.ts`
- Modify: `src/app/api/account/export/route.ts`

- [ ] Step 1: Write failing owner-filtered export tests

Add gap runs/items for two users. Assert the archive includes the requested user's application baseline ID, sanitized run metadata, requirement snapshots, coverage, and verified excerpts, and excludes the other user's rows. Assert no raw provider response, parsed full resume, full additional JD copy, signed URL, storage credential, or error stack is serialized.

- [ ] Step 2: Add repository dependencies and serialization

Extend account export dependencies with owner-filtered `listResumeGapRuns` and `listResumeGapItems`; intersect application/run IDs before serialization even though RLS already filters. Put data in `resume-gaps.json` with a schema version and generated timestamp. Existing `applications.json`, `career-profile.json`, and resume-version export behavior remain compatible.

- [ ] Step 3: Verify and commit

```bash
pnpm exec vitest run src/features/privacy/export.test.ts
pnpm exec tsc --noEmit
git add -- src/features/privacy/export.ts src/features/privacy/export.test.ts src/app/api/account/export/route.ts
git commit -m "feat: include resume gap history in account export"
```

## Task 11: Replace the application-workspace E2E path

Files:
- Modify: `tests/e2e/application-workspace.spec.ts`
- Reuse: `tests/fixtures/resume-en.pdf`
- Reuse: `tests/fixtures/resume-scanned.pdf`

- [ ] Step 1: Update the fake-provider happy path

After creating an application, assert the browser lands on `?tab=resume&setup=1`. Upload `resume-en.pdf`, confirm the filename, analyze the JD, return to Resume, click `分析简历差距`, and assert four summary labels plus at least one expandable row. Click again and assert one `resume_gap_runs` row with `attempt_count = 1` and a reused response.

- [ ] Step 2: Add skip and later-upload coverage

Create a second application, choose `暂时跳过`, assert profile-only mode and zero gap runs, then upload/select a baseline later and assert it transitions to resume comparison. Confirm the first application's `resume_source_asset_id` is unchanged.

- [ ] Step 3: Add disclosure/mobile/OCR assertions

On desktop, assert JD evidence and source text are absent until their controls open. At 390×844, assert no horizontal overflow, keyboard/click disclosure remains usable, and the old mobile `正文 / 建议 / 证据` switcher is absent. Use `resume-scanned.pdf` to exercise the local OCR recovery path with the existing OCR mock/stub so CI does not download a model or call a paid OCR API.

- [ ] Step 4: Preserve historical version/export coverage

Instead of generating a new version through the now-hidden primary UI, create a legacy generation/version fixture using the existing authenticated RPCs, navigate directly to `/applications/{id}/resume/{versionId}`, and verify both DOCX and PDF exports. This proves backward compatibility without reintroducing rewrite controls.

- [ ] Step 5: Run E2E and commit

```bash
E2E_FAKE_EXTRACTOR=1 pnpm exec playwright test tests/e2e/application-workspace.spec.ts --project=chromium
git add -- tests/e2e/application-workspace.spec.ts
git commit -m "test: cover progressive JD and resume gaps"
```

Expected: all new upload/skip/reuse/disclosure/mobile/OCR paths PASS, and the seeded historical version still exports.

## Task 12: Full verification, visual inspection, and release

Files:
- Modify only if verification finds an in-scope defect.

- [ ] Step 1: Run every local verification gate

```bash
pnpm exec supabase db reset
pnpm test:db
pnpm verify
E2E_FAKE_EXTRACTOR=1 pnpm test:e2e -- --project=chromium
pnpm build
git diff --check
git status --short
```

Expected: database tests, lint, typecheck, Vitest, Chromium E2E, production build, and whitespace checks all PASS; the worktree contains only intended changes.

- [ ] Step 2: Inspect desktop and mobile screenshots

Run the local app and capture:

- JD priority summary at 1440×1000;
- all-requirements collapsed categories;
- Resume profile-only state;
- Resume four-group gap result;
- selected baseline replacement state;
- JD and Resume tabs at 390×844.

Verify the V2 mint visual tokens, first-viewport information hierarchy, readable English/German JD wrapping, focus rings, text+symbol statuses, no unintended horizontal scroll, and no heavy border/shadow repetition. Fix only documented acceptance issues and rerun the affected test plus `pnpm verify`.

- [ ] Step 3: Run a security/privacy review

Search for accidental content logging and legacy primary controls:

```bash
rg -n "console\.(log|error|warn).*?(jdText|resumeText|ocrText|sourceExcerpt)|JSON\.stringify\(.*?(jdText|resumeText|ocrText)" src
rg -n "ResumeGenerationControl|生成岗位简历建议|继续审核建议" 'src/app/(app)/applications/[id]/page.tsx' src/features/resume-gaps
```

Expected: no content logging, and no old generation control/copy in the primary application page or new gap components.

- [ ] Step 4: Apply cloud migration and deploy only after local green

```bash
pnpm exec supabase db push --linked
git push -u origin codex/jd-resume-gap-redesign
gh pr create --base main --head codex/jd-resume-gap-redesign --title "Simplify JD review and add resume gap analysis" --body-file docs/superpowers/specs/2026-08-24-jd-resume-gap-redesign-design.md
```

Wait for CI and Vercel Preview. Smoke-test registration/login, application creation, baseline upload/skip, JD analysis, resume-gap analysis/reuse, scanned-PDF OCR recovery, another user's isolation, existing historical version export, and mobile layout. Do not expose or rotate existing API keys during deployment.

- [ ] Step 5: Merge and production smoke test

After all required checks pass, merge through GitHub, wait for the production deployment, then repeat the non-destructive smoke checks against production. Record only run IDs/status/token counts/estimated cost in operational notes—never JD/resume contents.

## Final acceptance checklist

- [ ] A new application always offers an optional baseline-resume choice after the JD is saved.
- [ ] Skip works and incurs no resume-gap API cost.
- [ ] The selected baseline is isolated per application and can be replaced without deleting files or changing the career profile.
- [ ] JD starts with a compact summary and at most five priority requirements; full requirements/evidence/source are opt-in.
- [ ] Resume comparison distinguishes resume omission, partial coverage, missing evidence, and covered using deterministic code.
- [ ] Profile-only mode is useful and never says `简历漏写`.
- [ ] Model output cannot create facts, explanations, rewrites, or unverified excerpts.
- [ ] Identical JD/resume inputs reuse a succeeded run and do not spend additional tokens.
- [ ] The primary Resume tab contains no rewrite suggestions, accept/edit/reject loop, templates, or three-column editor.
- [ ] Existing immutable resume versions and DOCX/PDF export deep links still work.
- [ ] Desktop/mobile disclosures are keyboard accessible, status is not color-only, and no horizontal overflow exists.
- [ ] Owner isolation, account export, failure preservation, content-log prohibition, CI mock behavior, and production-only provider safety all pass automated tests.
