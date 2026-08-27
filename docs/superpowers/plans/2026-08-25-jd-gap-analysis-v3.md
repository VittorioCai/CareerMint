# JD Gap Analysis V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace broad fact matching with a two-stage, evidence-grounded JD gap analysis that compares atomic requirements against the selected resume, shows exact gaps and impact, and chooses a production Prompt through a compact capped evaluation.

**Architecture:** Add a new V3 vertical slice beside the existing JD/resume-gap implementation so old results remain readable. Stage one structures and translates only the immutable JD; stage two compares the stored atomic criteria with the selected resume and confirmed career facts. A deterministic TypeScript policy validates excerpts, prevents profile evidence from upgrading resume coverage, aggregates criterion results, and assigns impact. One user click advances the two stages through at most one model call per HTTP request, keeping each Vercel request within its duration limit while preserving independent caches.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Zod, Supabase/PostgreSQL with RLS and pgTAP, Vitest/Testing Library, Playwright, DeepSeek JSON mode, existing private PDF/DOCX parsing and browser-local PaddleOCR recovery.

**Execution mode:** Inline execution by the current Sol primary agent. Do not dispatch Luna or other subagents.

---

## File map

### New V3 domain and provider files

- `src/features/jd-gap-analysis/schemas.ts`: strict stage-one/stage-two DTOs, stored result types, and bounded enums.
- `src/features/jd-gap-analysis/sanitizers.ts`: JD/source verification, ID completeness, fact allowlisting, and resume-excerpt grounding.
- `src/features/jd-gap-analysis/policy.ts`: deterministic criterion-group aggregation, requirement coverage, impact, counts, and ordering.
- `src/features/jd-gap-analysis/prompts.ts`: one fixed structure Prompt and three selected comparison Prompt candidates.
- `src/features/jd-gap-analysis/structure-repository.ts`: owner-scoped structure-run/requirement/criterion persistence.
- `src/features/jd-gap-analysis/gap-repository.ts`: owner-scoped gap-run/result/assessment persistence.
- `src/features/jd-gap-analysis/structure-service.ts`: claim, stage-one provider, sanitize, cost, complete/fail.
- `src/features/jd-gap-analysis/comparison-service.ts`: parse/OCR input, stage-two provider, sanitize, aggregate, cost, complete/fail.
- `src/features/jd-gap-analysis/http.ts`: authenticated one-stage-per-request advancement, versioned hashes, reuse, and safe responses.
- `src/features/jd-gap-analysis/analysis-control.tsx`: one-click client loop, progress, retry, and local OCR recovery.
- `src/features/jd-gap-analysis/analysis-panel.tsx`: `待补差距 / 全部要求 / JD 内容` views and accessible disclosures.
- `src/features/jd-gap-analysis/markdown.ts`: unresolved-gap Markdown export.

### New persistence, API, evaluation, and test files

- `supabase/migrations/202608250001_jd_gap_analysis_v3.sql`: six V3 tables, indexes, RLS, grants, and create/claim/complete/fail RPCs.
- `supabase/tests/database/jd_gap_analysis_v3_rls.test.sql`: ownership, validation, atomicity, idempotency, and history tests.
- `src/app/api/applications/[id]/jd-gap/analyze/route.ts`: production/fake provider wiring.
- `src/app/api/applications/[id]/jd-gap/export/route.ts`: owner-safe Markdown download.
- `src/features/jd-gap-analysis/evaluation.ts`: gold labels, hard gates, weighted score, stability, and winner selection.
- `scripts/evaluate-jd-gap-prompts.ts`: explicit live runner with 30-call and USD 2 circuit breakers.
- `tests/fixtures/jd-gap-eval/01-en-composite.json`
- `tests/fixtures/jd-gap-eval/02-de-degree-equivalence.json`
- `tests/fixtures/jd-gap-eval/03-years-cert-tools.json`
- `tests/fixtures/jd-gap-eval/04-language-authorization.json`
- `tests/fixtures/jd-gap-eval/05-industry-responsibility.json`
- `tests/fixtures/jd-gap-eval/06-false-positive-trap.json`
- `docs/evaluations/2026-08-25-jd-gap-prompt-comparison.md`: metadata-only comparison summary and winning Prompt version.

### Existing integration files

- `src/features/extraction/provider.ts`, `deepseek-extractor.ts`, `deepseek-extractor.test.ts`: add vendor-neutral stage-one and stage-two methods.
- `src/lib/env/server.ts`, `server.test.ts`: allowlist the selected comparison Prompt variant.
- `src/lib/supabase/database.types.ts`: regenerate from the local migrated database.
- `src/features/resume-gaps/baseline-selector.tsx` and tests: retain preview, clarify skip behavior, and route selection before analysis.
- `src/app/(app)/applications/[id]/page.tsx`: load V3 and legacy data, selected asset, and compose the JD tab.
- `src/features/jd-analysis/requirements-panel.tsx` and tests: legacy-only banner/copy; do not reinterpret V2 rows as V3.
- `src/features/resume-gaps/resume-workspace.tsx`, `gap-panel.tsx` and tests: keep legacy results/history readable and direct current analysis to the JD tab.
- `src/features/privacy/export.ts`, `export.test.ts`, `src/app/api/account/export/route.ts`: include owner-scoped V3 history without full source documents.
- `package.json`, `.gitignore`: explicit evaluation command and local report exclusion.
- `tests/e2e/application-workspace.spec.ts`: deterministic English/German/composite/legacy/OCR/desktop/mobile flow.

## Task 1: Define the V3 contracts and deterministic policy

**Files:**
- Create: `src/features/jd-gap-analysis/schemas.ts`
- Create: `src/features/jd-gap-analysis/schemas.test.ts`
- Create: `src/features/jd-gap-analysis/sanitizers.ts`
- Create: `src/features/jd-gap-analysis/sanitizers.test.ts`
- Create: `src/features/jd-gap-analysis/policy.ts`
- Create: `src/features/jd-gap-analysis/policy.test.ts`

- [ ] **Step 1: Write failing schema tests**

Cover strict top-level keys, maximum 80 requirements, maximum 12 criteria per requirement, unique local keys, bounded Chinese/original text, grouped `all/any` logic, all criterion kinds, and all comparison statuses. Use these public contracts:

```ts
export const criterionKindSchema = z.enum([
  "degree_level",
  "degree_field",
  "years_experience",
  "language",
  "work_authorization",
  "certification",
  "tool",
  "responsibility",
  "industry",
  "soft_skill",
  "quantified_outcome",
  "other",
]);

export const requirementTypeSchema = z.enum(["required", "core", "preferred"]);
export const criterionGroupRuleSchema = z.enum(["all", "any"]);
export const criterionEvidenceStatusSchema = z.enum([
  "direct",
  "partial_direct",
  "none",
  "needs_confirmation",
]);
export const coverageStatusSchema = z.enum([
  "complete",
  "partial",
  "none",
  "needs_confirmation",
]);
export const impactLevelSchema = z.enum(["blocking", "important", "minor"]);
export const gapTypeSchema = z.enum([
  "missing_from_resume",
  "too_vague",
  "missing_result_or_number",
  "no_supporting_fact",
  "language_or_authorization_confirmation",
  "none",
]);
```

Every stage-one criterion has `key`, `groupKey`, `groupRule`, `kind`, `originalText`, `translationZh`, and a strict constraint object:

```ts
const criterionConstraintSchema = z.object({
  operator: z.enum(["none", "exact", "gte", "one_of", "equivalent_allowed"]),
  value: z.string().trim().min(1).max(160).nullable(),
  unit: z.string().trim().min(1).max(40).nullable(),
}).strict();
```

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/schemas.test.ts
```

Expected: FAIL because the new schemas do not exist.

- [ ] **Step 2: Implement the strict schemas**

Export provider inputs/outputs and stored view types. Stage one must not contain resume/fact/match fields. Stage two must contain exactly one assessment per database criterion ID:

```ts
export type JDGapComparisonInput = {
  resumeText: string;
  requirements: JDGapRequirementForComparison[];
  confirmedFacts: ConfirmedFactForAnalysis[];
};

export type JDGapComparisonOutput = {
  assessments: Array<{
    criterionId: string;
    resumeEvidenceStatus: CriterionEvidenceStatus;
    resumeExcerpt: string | null;
    profileFactIds: string[];
    gapType: GapType;
    reasonZh: string;
    userQuestionZh: string | null;
  }>;
};
```

Run the schema test again; expected PASS.

- [ ] **Step 3: Write failing sanitizer tests**

Assert all of the following:

- stage one rejects an unknown/duplicate requirement key, duplicate criterion key, absent criterion, or JD excerpt not found after safe normalization;
- stage one preserves requirement order and never accepts more than 80 requirements;
- stage two rejects unknown, duplicate, or missing criterion IDs atomically;
- foreign/unconfirmed fact IDs are removed and counted;
- `direct`/`partial_direct` with a valid exact resume excerpt is preserved;
- an ungrounded excerpt downgrades only that criterion to `none`, clears the excerpt, and never upgrades another criterion;
- `none` and `needs_confirmation` always store a null excerpt;
- every returned reason/question remains length-bounded and no Provider extras survive.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/sanitizers.test.ts
```

Expected: FAIL because sanitizer functions do not exist.

- [ ] **Step 4: Implement source and evidence sanitizers**

Use the existing `verifyCandidateEvidence` and `normalizeForMatching` helpers. The comparison sanitizer must apply this downgrade rule:

```ts
const hasGroundedExcerpt =
  candidate.resumeExcerpt !== null &&
  normalizeForMatching(resumeText).includes(
    normalizeForMatching(candidate.resumeExcerpt),
  );

if (
  (candidate.resumeEvidenceStatus === "direct" ||
    candidate.resumeEvidenceStatus === "partial_direct") &&
  !hasGroundedExcerpt
) {
  return {
    ...candidate,
    resumeEvidenceStatus: "none" as const,
    resumeExcerpt: null,
    gapType: validFactIds.length
      ? "missing_from_resume" as const
      : "no_supporting_fact" as const,
    profileFactIds: validFactIds,
  };
}
```

Unknown/duplicate/missing criterion IDs remain a whole-output error so the Provider adapter can retry once.

For `work_authorization`, preserve `direct` or `partial_direct` only when both the resume excerpt is grounded and at least one returned fact ID resolves to a confirmed authorization fact. With no confirmed authorization fact, force `needs_confirmation`; with a confirmed fact but no resume excerpt, keep `none` and the fact ID as separate profile support.

- [ ] **Step 5: Write failing aggregation and category-policy tests**

Test `all` and `any` groups, including `SQL or Python` plus a separate years criterion. Assert:

- all required groups direct → `complete`;
- some direct evidence plus an incomplete group → `partial`;
- no direct/partial evidence plus a confirmation criterion → `needs_confirmation`;
- otherwise → `none`;
- profile facts never change those results;
- `preferred` always has `minor` impact;
- an explicit gate has `blocking` importance when incomplete;
- other required/core gaps are `important`;
- complete requirements remain in the covered group regardless of importance;
- degree equivalence is eligible only when `allowsEquivalent` is true;
- a numeric years shortfall and missing required metric cannot become complete.
- a work-authorization criterion may use a resume quote only when at least one allowlisted, confirmed authorization fact corroborates it; without confirmation it becomes `needs_confirmation`, while a confirmed profile fact without a resume quote remains a resume omission rather than complete.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/policy.test.ts
```

Expected: FAIL before `aggregateRequirement` and `orderGapResults` exist.

- [ ] **Step 6: Implement deterministic aggregation and ordering**

Use this aggregation sequence:

```ts
export function aggregateRequirement(input: AggregateRequirementInput) {
  const groups = groupCriteria(input.criteria);
  const groupStates = groups.map(aggregateCriterionGroup);
  const hasResumeEvidence = input.criteria.some((criterion) =>
    criterion.resumeEvidenceStatus === "direct" ||
    criterion.resumeEvidenceStatus === "partial_direct",
  );

  const coverageStatus = groupStates.every((state) => state === "complete")
    ? "complete"
    : hasResumeEvidence
      ? "partial"
      : groupStates.some((state) => state === "needs_confirmation")
        ? "needs_confirmation"
        : "none";

  const impactLevel = input.requirementType === "preferred"
    ? "minor"
    : input.explicitGate
      ? "blocking"
      : "important";

  return { coverageStatus, impactLevel } as const;
}
```

`orderGapResults` sorts incomplete requirements by impact (`blocking`, `important`, `minor`), then coverage (`none`, `needs_confirmation`, `partial`), then source order. Complete rows sort last and are not truncated.

- [ ] **Step 7: Verify and commit the domain slice**

```bash
pnpm exec vitest run src/features/jd-gap-analysis/schemas.test.ts src/features/jd-gap-analysis/sanitizers.test.ts src/features/jd-gap-analysis/policy.test.ts
pnpm typecheck
git add -- src/features/jd-gap-analysis/schemas.ts src/features/jd-gap-analysis/schemas.test.ts src/features/jd-gap-analysis/sanitizers.ts src/features/jd-gap-analysis/sanitizers.test.ts src/features/jd-gap-analysis/policy.ts src/features/jd-gap-analysis/policy.test.ts
git commit -m "feat: define deterministic JD gap policy"
```

Expected: focused tests and typecheck PASS.

## Task 2: Add the fixed structure Prompt and three comparison candidates

**Files:**
- Create: `src/features/jd-gap-analysis/prompts.ts`
- Create: `src/features/jd-gap-analysis/prompts.test.ts`
- Modify: `src/features/extraction/provider.ts`
- Modify: `src/features/extraction/deepseek-extractor.ts`
- Modify: `src/features/extraction/deepseek-extractor.test.ts`
- Modify: `src/lib/env/server.ts`
- Modify: `src/lib/env/server.test.ts`

- [ ] **Step 1: Write failing Prompt contract tests**

Assert the structure Prompt:

- sees only `<job_description>`;
- emits translation, requirement type, exact JD excerpt, `allowsEquivalent`, `explicitGate`, grouped atomic criteria, and constraints;
- treats `or/equivalent/comparable/vergleichbar` as logic/data rather than permission to invent equivalence;
- explicitly excludes user matching.

Assert P1/P2/P3 all prohibit keyword-only matching, require exact resume excerpts for direct/partial evidence, keep profile evidence separate, apply the category matrix, and return every criterion exactly once. P2 contains positive/negative contrast examples; P3 adds an internal completeness/overmatching check but returns only the JSON envelope.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/prompts.test.ts
```

Expected: FAIL because the Prompt module does not exist.

- [ ] **Step 2: Implement versioned Prompt exports**

Export stable identifiers and a strict selector:

```ts
export const JD_STRUCTURE_PROMPT_VERSION = "jd-structure-v3.1";
export const JD_GAP_POLICY_VERSION = "jd-gap-policy-v3.1";
export const comparisonPromptVariants = {
  p1: { version: "jd-gap-p1-rules-v1", instructions: p1Instructions },
  p2: { version: "jd-gap-p2-contrast-v1", instructions: p2Instructions },
  p3: { version: "jd-gap-p3-self-check-v1", instructions: p3Instructions },
} as const;

export type ComparisonPromptVariant = keyof typeof comparisonPromptVariants;
```

Fixed instructions must appear before variable user content to preserve DeepSeek cache reuse.

- [ ] **Step 3: Write failing Provider adapter tests**

Add tests that `structureJobDescription({ jdText })` sends no career facts/resume, and `compareJDGapCriteria(input, { promptVariant })` sends requirements, resume and confirmed facts in distinct untrusted-data blocks. Assert JSON mode, thinking disabled, exact schema parsing, one invalid-output retry, usage accumulation, 30-second per-attempt timeout, and no content logging.

Use these vendor-neutral methods:

```ts
type AIProvider = {
  extractResumeFacts(resumeText: string): Promise<AIResult<ResumeExtraction>>;
  analyzeJobDescription(
    input: JobDescriptionAnalysisInput,
  ): Promise<AIResult<JDAnalysis>>;
  generateResumeSuggestions(
    input: ResumeGenerationInput,
  ): Promise<AIResult<ResumeSuggestionOutput>>;
  generateInterviewQuestions(
    input: InterviewQuestionGenerationInput,
  ): Promise<AIResult<InterviewQuestionGenerationOutput>>;
  analyzeResumeGaps(
    input: ResumeGapAnalysisInput,
  ): Promise<AIResult<ResumeGapProviderOutput>>;
  structureJobDescription(
    input: JDStructureInput,
  ): Promise<AIResult<JDStructureProviderOutput>>;
  compareJDGapCriteria(
    input: JDGapComparisonInput,
    options: { promptVariant: ComparisonPromptVariant },
  ): Promise<AIResult<JDGapComparisonOutput>>;
};
```

Run:

```bash
pnpm exec vitest run src/features/extraction/deepseek-extractor.test.ts
```

Expected: FAIL because the methods are absent.

- [ ] **Step 4: Implement the two adapter methods**

Reuse `runAttempt` and `withInvalidOutputRetry`. Set stage-one and stage-two `max_tokens` to 8192; do not reuse the legacy 96,000-token gap limit. Only metadata may reach `MetadataLogger`.

- [ ] **Step 5: Add the allowlisted runtime Prompt selection**

Extend the server env schema:

```ts
JD_GAP_MATCH_PROMPT_VARIANT: z.enum(["p1", "p2", "p3"]).default("p3"),
```

Test invalid values fail closed and the default remains `p3` until the compact evaluation selects another candidate. The Provider name/model remain separately configurable.

- [ ] **Step 6: Verify and commit**

```bash
pnpm exec vitest run src/features/jd-gap-analysis/prompts.test.ts src/features/extraction/deepseek-extractor.test.ts src/lib/env/server.test.ts
pnpm typecheck
git add -- src/features/jd-gap-analysis/prompts.ts src/features/jd-gap-analysis/prompts.test.ts src/features/extraction/provider.ts src/features/extraction/deepseek-extractor.ts src/features/extraction/deepseek-extractor.test.ts src/lib/env/server.ts src/lib/env/server.test.ts
git commit -m "feat: add versioned JD gap prompts"
```

## Task 3: Build and run the compact Prompt comparison

**Files:**
- Create: `src/features/jd-gap-analysis/evaluation.ts`
- Create: `src/features/jd-gap-analysis/evaluation.test.ts`
- Create: `scripts/evaluate-jd-gap-prompts.ts`
- Create: six JSON files under `tests/fixtures/jd-gap-eval/`
- Create after the run: `docs/evaluations/2026-08-25-jd-gap-prompt-comparison.md`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing evaluator tests**

Use synthetic miniature cases to assert:

- any invalid resume quote, profile-driven coverage upgrade, missing criterion, complete-with-incomplete-group, or preferred-blocking result fails a hard gate;
- false positives have the highest penalty;
- ties break by requirement recall, gap explanation, stability, then tokens/cost/latency;
- the runner refuses call 31;
- the runner refuses a next call when actual spend plus the conservative reserved cost would exceed USD 2;
- report data contains case IDs, status counts, usage, cost, latency and errors, but never raw JD/resume/profile text.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/evaluation.test.ts
```

Expected: FAIL before the evaluator exists.

- [ ] **Step 2: Implement the six irreversible fixtures**

Each JSON file contains synthetic/anonymized `caseId`, JD, resume, confirmed facts, expected structure labels and expected criterion outcomes. Keep each complete Prompt input below 30,000 UTF-8 bytes. Cover:

1. English composite responsibilities, tools and metrics;
2. German `oder vergleichbarer Studiengang` plus an explicitly unique degree contrast;
3. years, certificate and non-substitutable tool;
4. CEFR/descriptive language and work authorization;
5. same-industry synonymous responsibility and behavioral soft-skill evidence;
6. adjacent-industry keyword trap plus profile-only support.

Do not copy any user's original company, dates, contact details, exact resume bullets or full JD.

After stage-one sanitization, map local requirement/criterion keys to deterministic UUIDv5 fixture IDs before constructing the three stage-two inputs. This mirrors production database IDs without requiring Supabase during Prompt evaluation.

- [ ] **Step 3: Implement scoring and budget guards**

The runner executes one fixed structure call per case and reuses the sanitized structure for P1/P2/P3, totaling 6 + 18 = 24 base calls. Export constants:

```ts
export const JD_GAP_EVAL_MAX_CALLS = 30;
export const JD_GAP_EVAL_MAX_COST_USD = 2;
export const JD_GAP_EVAL_MAX_OUTPUT_TOKENS = 4096;
```

Before every request, calculate a conservative ceiling using UTF-8 request bytes as an upper bound for input tokens, the configured peak cache-miss rate, and 4096 output tokens at the configured peak output rate. Abort before sending if `actualCost + reservedCeiling > 2`.

- [ ] **Step 4: Add an explicit, opt-in command**

Add:

```json
{
  "scripts": {
    "eval:jd-gap": "tsx scripts/evaluate-jd-gap-prompts.ts"
  },
  "devDependencies": {
    "tsx": "^4.20.5"
  }
}
```

The script loads `.env.local` through `@next/env`, requires `RUN_JD_GAP_EVAL=1`, `DEEPSEEK_API_KEY`, and a valid `AI_PRICE_SCHEDULE_JSON`, and writes detailed local output only under ignored `tmp/jd-gap-eval/`. Without the opt-in flag it exits before constructing the Provider.

- [ ] **Step 5: Verify the dry path and commit the harness**

```bash
pnpm install
pnpm exec vitest run src/features/jd-gap-analysis/evaluation.test.ts
pnpm eval:jd-gap
git add -- package.json pnpm-lock.yaml .gitignore src/features/jd-gap-analysis/evaluation.ts src/features/jd-gap-analysis/evaluation.test.ts scripts/evaluate-jd-gap-prompts.ts tests/fixtures/jd-gap-eval
git commit -m "test: add compact JD gap prompt evaluation"
```

Expected: unit tests PASS; the command without `RUN_JD_GAP_EVAL=1` exits safely with `jd-gap-eval-explicit-opt-in-required` and makes zero network calls.

- [ ] **Step 6: Run the approved 24-call comparison**

```bash
RUN_JD_GAP_EVAL=1 pnpm eval:jd-gap
```

Expected: 24 or fewer base calls, actual estimated spend below USD 2, no hard-cap breach, and a winner among P1/P2/P3. Only if the top candidates tie or a hard-gate failure requires confirmation, run the tool once with `--stability`; it may add at most six calls and must still share the same 30-call/USD 2 ledger.

- [ ] **Step 7: Record the winner without sensitive content**

Create `docs/evaluations/2026-08-25-jd-gap-prompt-comparison.md` containing:

- model and collection date;
- Prompt version IDs;
- case IDs only;
- hard-gate pass/fail;
- false positives, recall, quote validity, stability, token/cost/latency totals;
- winning variant and deterministic tie-break reason;
- total calls and cost.

Do not include source text or raw Provider responses. Set `JD_GAP_MATCH_PROMPT_VARIANT` locally to the recorded winner for subsequent tests.

```bash
git add -- docs/evaluations/2026-08-25-jd-gap-prompt-comparison.md
git commit -m "docs: record JD gap prompt comparison"
```

## Task 4: Add owner-safe V3 persistence

**Files:**
- Create: `supabase/migrations/202608250001_jd_gap_analysis_v3.sql`
- Create: `supabase/tests/database/jd_gap_analysis_v3_rls.test.sql`
- Regenerate: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing pgTAP contract**

Create two authenticated users, one application and source asset per user, confirmed/pending facts, and assert:

- all six V3 tables exist and have RLS enabled;
- authenticated users receive `select` only and cannot mutate tables directly;
- owner/cross-owner visibility is isolated;
- create RPCs reject cross-owner application/source/run/fact IDs;
- identical versioned hashes return the same run;
- a fresh running lease cannot be claimed twice and a stale two-minute lease can be reclaimed with attempt fencing;
- structure completion accepts every JD requirement/criterion exactly once, verifies JD excerpts and rejects malformed groups atomically;
- gap completion accepts every requirement and criterion exactly once, validates all IDs belong to the chosen structure run, and validates every profile fact is confirmed and owner-scoped;
- source deletion sets only `source_asset_id` to null while filename/SHA snapshots remain;
- failure preserves the prior successful run;
- run result JSON contains metadata/counts only and no full JD, resume, profile or Provider body.

Run red:

```bash
pnpm exec supabase db reset
pnpm exec supabase test db supabase/tests/database/jd_gap_analysis_v3_rls.test.sql
```

Expected: FAIL because the V3 tables/functions do not exist.

- [ ] **Step 2: Create the six-table migration**

Use these tables and stable names:

```sql
create table public.jd_structure_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  jd_sha256 text not null check (jd_sha256 ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 160),
  schema_version text not null check (char_length(btrim(schema_version)) between 1 and 80),
  prompt_version text not null check (char_length(btrim(prompt_version)) between 1 and 80),
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text check (error_code is null or char_length(btrim(error_code)) between 1 and 120),
  error_message text check (error_message is null or char_length(btrim(error_message)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (user_id, application_id, input_hash, provider, model)
);

create table public.jd_structure_requirements (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jd_structure_runs(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('responsibility','hard_requirement','preferred','skill','language_work_authorization','location_workplace','compensation')),
  requirement_type text not null check (requirement_type in ('required','core','preferred')),
  original_text text not null check (char_length(btrim(original_text)) between 1 and 500),
  translation_zh text not null check (char_length(btrim(translation_zh)) between 1 and 1000),
  source_excerpt text not null check (char_length(btrim(source_excerpt)) between 1 and 1000),
  allows_equivalent boolean not null default false,
  explicit_gate boolean not null default false,
  sort_order integer not null check (sort_order between 0 and 79),
  created_at timestamptz not null default now(),
  unique (run_id, sort_order)
);

create table public.jd_structure_criteria (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.jd_structure_requirements(id) on delete cascade,
  run_id uuid not null references public.jd_structure_runs(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_key text not null check (group_key ~ '^g[1-9][0-9]?$'),
  group_rule text not null check (group_rule in ('all','any')),
  kind text not null check (kind in ('degree_level','degree_field','years_experience','language','work_authorization','certification','tool','responsibility','industry','soft_skill','quantified_outcome','other')),
  original_text text not null check (char_length(btrim(original_text)) between 1 and 500),
  translation_zh text not null check (char_length(btrim(translation_zh)) between 1 and 1000),
  constraint_payload jsonb not null check (jsonb_typeof(constraint_payload) = 'object'),
  sort_order integer not null check (sort_order between 0 and 11),
  created_at timestamptz not null default now(),
  unique (requirement_id, sort_order)
);

create table public.jd_gap_v3_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  structure_run_id uuid not null references public.jd_structure_runs(id) on delete cascade,
  source_asset_id uuid references public.source_assets(id) on delete set null,
  source_filename text not null check (char_length(btrim(source_filename)) between 1 and 260),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  fact_fingerprint text not null check (fact_fingerprint ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 160),
  schema_version text not null check (char_length(btrim(schema_version)) between 1 and 80),
  prompt_version text not null check (char_length(btrim(prompt_version)) between 1 and 80),
  policy_version text not null check (char_length(btrim(policy_version)) between 1 and 80),
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text check (error_code is null or char_length(btrim(error_code)) between 1 and 120),
  error_message text check (error_message is null or char_length(btrim(error_message)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (user_id, application_id, input_hash, provider, model)
);

create table public.jd_gap_v3_requirement_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jd_gap_v3_runs(id) on delete cascade,
  requirement_id uuid not null references public.jd_structure_requirements(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  coverage_status text not null check (coverage_status in ('complete','partial','none','needs_confirmation')),
  impact_level text not null check (impact_level in ('blocking','important','minor')),
  covered_criterion_count integer not null check (covered_criterion_count between 0 and 12),
  missing_criterion_count integer not null check (missing_criterion_count between 0 and 12),
  sort_order integer not null check (sort_order between 0 and 79),
  created_at timestamptz not null default now(),
  unique (run_id, requirement_id),
  unique (run_id, sort_order)
);

create table public.jd_gap_v3_criterion_assessments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jd_gap_v3_runs(id) on delete cascade,
  criterion_id uuid not null references public.jd_structure_criteria(id) on delete cascade,
  requirement_id uuid not null references public.jd_structure_requirements(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_evidence_status text not null check (resume_evidence_status in ('direct','partial_direct','none','needs_confirmation')),
  verified_resume_excerpt text check (verified_resume_excerpt is null or char_length(btrim(verified_resume_excerpt)) between 1 and 1000),
  profile_fact_ids uuid[] not null default '{}'::uuid[] check (cardinality(profile_fact_ids) <= 5),
  gap_type text not null check (gap_type in ('missing_from_resume','too_vague','missing_result_or_number','no_supporting_fact','language_or_authorization_confirmation','none')),
  reason_zh text not null check (char_length(btrim(reason_zh)) between 1 and 700),
  user_question_zh text check (user_question_zh is null or char_length(btrim(user_question_zh)) between 1 and 500),
  sort_order integer not null check (sort_order between 0 and 959),
  created_at timestamptz not null default now(),
  unique (run_id, criterion_id),
  unique (run_id, sort_order),
  check ((resume_evidence_status in ('direct','partial_direct')) = (verified_resume_excerpt is not null))
);
```

Required structure columns:

- run: application/user, JD SHA-256, input hash, provider/model, schema/prompt version, processing status/attempt/result/errors/timestamps;
- requirement: run/application/user, category, requirement type, original/Chinese text, verified source excerpt, `allows_equivalent`, `explicit_gate`, sort order;
- criterion: requirement/run/application/user, group key/rule, kind, original/Chinese text, strict constraint JSON, sort order.

Required gap columns:

- run: application/user, structure run, nullable source asset with filename/SHA snapshots, fact fingerprint, input hash, provider/model, schema/prompt/policy version, status/attempt/result/errors/timestamps;
- requirement result: run/requirement/application/user, final coverage, impact, covered/missing counts, sort order;
- criterion assessment: run/criterion/requirement/application/user, evidence status, verified excerpt, confirmed `profile_fact_ids uuid[]`, gap type, bounded Chinese reason/question, sort order.

Use text checks or enums for all allowlisted states, `unique (run_id, sort_order)` constraints, application/latest-run indexes, `on delete cascade` within an application, and `on delete set null` for the source asset. Never store full resume text.

- [ ] **Step 3: Implement only the authenticated RPC boundary**

Expose:

```sql
create_or_get_jd_structure(uuid, text, text, text, text, text, text)
claim_jd_structure(uuid, integer, public.processing_job_status, integer)
complete_jd_structure(uuid, integer, text, jsonb, jsonb, jsonb)
fail_jd_structure(uuid, integer, text, text)
create_or_get_jd_gap_v3(uuid, uuid, uuid, text, text, text, text, text, text, text)
claim_jd_gap_v3(uuid, integer, public.processing_job_status, integer)
complete_jd_gap_v3(uuid, integer, jsonb, jsonb, jsonb, jsonb)
fail_jd_gap_v3(uuid, integer, text, text)
```

All functions are `security definer set search_path = ''`, derive the caller from `auth.uid()`, validate exact JSON keys and bounds, follow the established analysis→criteria→source→application lock order, and revoke execution from `anon`. Completion writes children and marks the run succeeded in one transaction.

- [ ] **Step 4: Make database tests green and regenerate types**

```bash
pnpm exec supabase db reset
pnpm exec supabase test db supabase/tests/database/jd_gap_analysis_v3_rls.test.sql
pnpm test:db
pnpm db:types
pnpm typecheck
```

Expected: focused and complete pgTAP suites PASS; generated types include all V3 tables and RPCs.

- [ ] **Step 5: Commit the database slice**

```bash
git add -- supabase/migrations/202608250001_jd_gap_analysis_v3.sql supabase/tests/database/jd_gap_analysis_v3_rls.test.sql src/lib/supabase/database.types.ts
git commit -m "feat: add JD gap analysis v3 storage"
```

## Task 5: Implement typed V3 repositories and versioned cache keys

**Files:**
- Create: `src/features/jd-gap-analysis/structure-repository.ts`
- Create: `src/features/jd-gap-analysis/structure-repository.test.ts`
- Create: `src/features/jd-gap-analysis/gap-repository.ts`
- Create: `src/features/jd-gap-analysis/gap-repository.test.ts`
- Create: `src/features/jd-gap-analysis/hashes.ts`
- Create: `src/features/jd-gap-analysis/hashes.test.ts`

- [ ] **Step 1: Write failing repository mapping tests**

Mock Supabase and assert strict mapping for every status/result enum, malformed stored JSON rejection, owner filters on all list/get calls, stable ordering, and RPC parameter names. `listLatestView(userId, applicationId)` must return requirements with criteria, result/assessments, and current confirmed profile facts resolved from allowlisted IDs without exposing another user's fact.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/structure-repository.test.ts src/features/jd-gap-analysis/gap-repository.test.ts
```

Expected: FAIL before repositories exist.

- [ ] **Step 2: Implement narrow repositories**

Expose separate contracts:

```ts
export const jdStructureRepository = {
  createOrGet,
  claim,
  getOwned,
  getLatest,
  getLatestSucceeded,
  listRequirementsWithCriteria,
  complete,
  fail,
};

export const jdGapV3Repository = {
  createOrGet,
  claim,
  getOwned,
  getLatest,
  getLatestSucceeded,
  getLatestForCombination,
  listView,
  complete,
  fail,
};
```

Repositories must never accept or return full JD/resume text as persisted run metadata.

- [ ] **Step 3: Write failing hash/fingerprint tests**

Assert:

- structure hash changes with JD, model, provider, schema or structure Prompt version, but not career facts/resume;
- fact fingerprint is stable across fact ordering and changes with any confirmed fact field/status/source change;
- gap hash changes with structure run, resume SHA, fact fingerprint, model/provider, comparison Prompt or policy version;
- all hashes are lowercase SHA-256;
- no raw values appear in a hash or returned metadata.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/hashes.test.ts
```

Expected: FAIL before the hash helpers exist.

- [ ] **Step 4: Implement hashes**

```ts
export const JD_STRUCTURE_SCHEMA_VERSION = "jd-analysis-v3";
export const JD_GAP_SCHEMA_VERSION = "resume-gap-v3";

export function buildJDStructureInputHash(input: JDStructureHashInput): string;
export function buildConfirmedFactFingerprint(
  facts: ConfirmedFactForAnalysis[],
): string;
export function buildJDGapInputHash(input: JDGapHashInput): string;
```

Use stable sorted projections and `createHash("sha256")`.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec vitest run src/features/jd-gap-analysis/structure-repository.test.ts src/features/jd-gap-analysis/gap-repository.test.ts src/features/jd-gap-analysis/hashes.test.ts
pnpm typecheck
git add -- src/features/jd-gap-analysis/structure-repository.ts src/features/jd-gap-analysis/structure-repository.test.ts src/features/jd-gap-analysis/gap-repository.ts src/features/jd-gap-analysis/gap-repository.test.ts src/features/jd-gap-analysis/hashes.ts src/features/jd-gap-analysis/hashes.test.ts
git commit -m "feat: add versioned JD gap repositories"
```

## Task 6: Orchestrate one-click, two-stage analysis safely

**Files:**
- Create: `src/features/jd-gap-analysis/structure-service.ts`
- Create: `src/features/jd-gap-analysis/structure-service.test.ts`
- Create: `src/features/jd-gap-analysis/comparison-service.ts`
- Create: `src/features/jd-gap-analysis/comparison-service.test.ts`
- Create: `src/features/jd-gap-analysis/http.ts`
- Create: `src/features/jd-gap-analysis/http.test.ts`
- Create: `src/app/api/applications/[id]/jd-gap/analyze/route.ts`
- Create: `src/app/api/applications/[id]/jd-gap/analyze/route.test.ts`

- [ ] **Step 1: Write failing service tests**

For both services assert ownership before Provider construction, idempotent succeeded reuse, fenced claim, one provider invocation, exact sanitizer/policy output, metadata-only cost recording, stable failure codes, and preceding-success preservation. Comparison tests must cover PDF/DOCX parsing, supplied browser OCR text, too-short/too-long text, source download failure, and confirmed facts passed separately.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/structure-service.test.ts src/features/jd-gap-analysis/comparison-service.test.ts
```

Expected: FAIL before services exist.

- [ ] **Step 2: Implement focused services**

`createJDStructureService` calls only `structureJobDescription`, sanitizes against JD text, and completes through the structure repository. `createJDGapComparisonService` parses only the selected asset, calls only `compareJDGapCriteria`, sanitizes evidence, runs `aggregateRequirement`, then completes assessments/results atomically.

Allowlist these safe failures:

```ts
const safeErrors = new Set([
  "jd-structure-invalid-output",
  "jd-gap-invalid-output",
  "resume-text-too-short",
  "resume-text-too-long",
  "unsupported-content-type",
  "source-download-failed",
  "ai-provider-rate-limited",
  "ai-provider-request-failed",
  "ai-provider-timeout",
]);
```

Provider authentication/key errors map to `jd-gap-unavailable`; unexpected errors map to `jd-gap-failed` without Provider detail.

- [ ] **Step 3: Write failing HTTP advancement tests**

Assert authentication, UUID validation, application ownership, AI consent, selected-resume requirement, `x-resume-source-asset-id` race protection, OCR body size/content validation, and confirmed-fact fingerprinting.

The handler performs at most one fresh model call per request:

```ts
type JDGapAdvanceResponse = {
  status: "queued" | "running" | "succeeded" | "failed";
  phase: "structure" | "comparison" | "complete";
  nextPhase: "comparison" | null;
  structureRunId: string | null;
  gapRunId: string | null;
  reused: boolean;
  errorCode: string | null;
};
```

First request may create stage one and return `nextPhase: "comparison"`; the client automatically sends the second request. If stage one is cached, the first request may execute stage two. A fresh running task returns without constructing a Provider.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/http.test.ts 'src/app/api/applications/[id]/jd-gap/analyze/route.test.ts'
```

Expected: FAIL before the handler and route exist.

- [ ] **Step 4: Implement the handler and route wiring**

Before editing Next.js route code, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` completely as required by `AGENTS.md`.

The route uses Node runtime and `maxDuration = 60`. The non-production fake returns deterministic English/German structures and only exact copied resume excerpts. It must require `E2E_FAKE_EXTRACTOR=1` and never activate in production.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec vitest run src/features/jd-gap-analysis/structure-service.test.ts src/features/jd-gap-analysis/comparison-service.test.ts src/features/jd-gap-analysis/http.test.ts 'src/app/api/applications/[id]/jd-gap/analyze/route.test.ts'
pnpm typecheck
git add -- src/features/jd-gap-analysis/structure-service.ts src/features/jd-gap-analysis/structure-service.test.ts src/features/jd-gap-analysis/comparison-service.ts src/features/jd-gap-analysis/comparison-service.test.ts src/features/jd-gap-analysis/http.ts src/features/jd-gap-analysis/http.test.ts 'src/app/api/applications/[id]/jd-gap/analyze/route.ts' 'src/app/api/applications/[id]/jd-gap/analyze/route.test.ts'
git commit -m "feat: orchestrate JD gap analysis v3"
```

## Task 7: Build the JD gap UI and preserve legacy views

**Files:**
- Create: `src/features/jd-gap-analysis/analysis-control.tsx`
- Create: `src/features/jd-gap-analysis/analysis-control.test.tsx`
- Create: `src/features/jd-gap-analysis/analysis-panel.tsx`
- Create: `src/features/jd-gap-analysis/analysis-panel.test.tsx`
- Modify: `src/features/resume-gaps/baseline-selector.tsx`
- Modify: `src/features/resume-gaps/baseline-selector.test.tsx`
- Modify: `src/features/jd-analysis/requirements-panel.tsx`
- Modify: `src/features/jd-analysis/requirements-panel.test.tsx`
- Modify: `src/features/resume-gaps/resume-workspace.tsx`
- Modify: `src/features/resume-gaps/resume-workspace.test.tsx`
- Modify: `src/features/resume-gaps/gap-panel.tsx`
- Modify: `src/features/resume-gaps/gap-panel.test.tsx`
- Modify: `src/app/(app)/applications/[id]/page.tsx`

- [ ] **Step 1: Write failing control tests**

Assert:

- no selected resume disables the call and links to resume selection;
- one click follows `nextPhase` automatically and sends at most two sequential requests;
- running/reused/succeeded/failed copy is stable;
- selected asset ID is sent on every request;
- `resume-text-too-short` on a PDF offers existing browser-local OCR, reports progress, can cancel, and resubmits the OCR text;
- changing the asset/run key clears stale local OCR state;
- AI consent links to account settings;
- the control never auto-runs on mount.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/analysis-control.test.tsx
```

Expected: FAIL before the control exists.

- [ ] **Step 2: Implement `JDGapAnalysisControl`**

Reuse the tested OCR behavior from `GapAnalysisControl`, but call `/api/applications/{id}/jd-gap/analyze`. Visible phases are `正在拆解 JD`, `正在核对简历证据`, and `分析完成`. Button copy is `开始 JD 差距分析` or `重新分析 JD 差距`.

- [ ] **Step 3: Write failing panel tests**

Test the approved information architecture:

- main heading `JD 差距分析`;
- selected resume filename;
- summary counts total/complete/partial/uncovered/blocking;
- default tab `待补差距`, plus `全部要求` and `JD 内容`;
- Chinese first, original second;
- blocking→important→minor groups, complete collapsed last;
- within groups none→needs confirmation→partial;
- every incomplete row remains accessible, with explicit `还有 N 条` if initially compacted;
- expanded row shows atomic criteria, exact resume quote, separate profile support, missing criteria, gap type, reason and question;
- status has text and symbol, keyboard disclosure, `aria-expanded`, and no color-only meaning;
- V2 input renders only a legacy banner plus legacy panel and never fabricated V3 fields.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/analysis-panel.test.tsx
```

Expected: FAIL before the panel exists.

- [ ] **Step 4: Implement the panel without a silent cap**

Keep V2 mint tokens and one-column dense surfaces. Use a local `showAll` flag only when an incomplete group exceeds five; render `还有 ${remaining} 条，展开全部` before hiding rows. Fully covered rows live in a native `<details>` section.

- [ ] **Step 5: Correct the resume-selection/setup copy**

Keep upload/select/preview. Change optional skip copy from `暂时跳过，去分析 JD` to `暂时跳过，进入申请`; it may enter the workspace but cannot trigger V3 until a baseline is chosen. After selecting a resume in setup mode, continue to `?tab=jd&setup=1` as today.

- [ ] **Step 6: Integrate server data and legacy compatibility**

Before editing the application Server Component, read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` completely as required by `AGENTS.md`.

On the JD tab, load selected asset plus latest V3 structure/gap view. If no V3 result exists but a V2 result does, show `这是旧版分析，请重新分析以查看详细差距。` and the existing collapsed legacy requirements. Do not map V2 `partial/evidence` into V3.

On the Resume tab, retain baseline management and immutable history. Label the old V1 gap panel `旧版简历差距（只读）` and provide a link to the JD tab for current analysis; do not start new V1 calls from primary UI.

- [ ] **Step 7: Verify and commit**

```bash
pnpm exec vitest run src/features/jd-gap-analysis/analysis-control.test.tsx src/features/jd-gap-analysis/analysis-panel.test.tsx src/features/resume-gaps/baseline-selector.test.tsx src/features/jd-analysis/requirements-panel.test.tsx src/features/resume-gaps/resume-workspace.test.tsx src/features/resume-gaps/gap-panel.test.tsx
pnpm typecheck
git add -- src/features/jd-gap-analysis/analysis-control.tsx src/features/jd-gap-analysis/analysis-control.test.tsx src/features/jd-gap-analysis/analysis-panel.tsx src/features/jd-gap-analysis/analysis-panel.test.tsx src/features/resume-gaps/baseline-selector.tsx src/features/resume-gaps/baseline-selector.test.tsx src/features/jd-analysis/requirements-panel.tsx src/features/jd-analysis/requirements-panel.test.tsx src/features/resume-gaps/resume-workspace.tsx src/features/resume-gaps/resume-workspace.test.tsx src/features/resume-gaps/gap-panel.tsx src/features/resume-gaps/gap-panel.test.tsx 'src/app/(app)/applications/[id]/page.tsx'
git commit -m "feat: present detailed JD gap analysis"
```

## Task 8: Export unresolved V3 gaps and account data safely

**Files:**
- Create: `src/features/jd-gap-analysis/markdown.ts`
- Create: `src/features/jd-gap-analysis/markdown.test.ts`
- Create: `src/app/api/applications/[id]/jd-gap/export/route.ts`
- Create: `src/app/api/applications/[id]/jd-gap/export/route.test.ts`
- Modify: `src/features/jd-gap-analysis/analysis-panel.tsx`
- Modify: `src/features/jd-gap-analysis/analysis-panel.test.tsx`
- Modify: `src/features/privacy/export.ts`
- Modify: `src/features/privacy/export.test.ts`
- Modify: `src/app/api/account/export/route.ts`

- [ ] **Step 1: Write failing Markdown tests**

Assert export order matches the UI, excludes complete requirements, and includes company/role, selected resume filename, Chinese/original requirement, coverage, impact, covered/missing criteria, gap type, user question, and exact resume/profile evidence labels. Escape Markdown control characters. Do not include full JD/resume text, signed URLs or deleted fact data.

Run:

```bash
pnpm exec vitest run src/features/jd-gap-analysis/markdown.test.ts 'src/app/api/applications/[id]/jd-gap/export/route.test.ts'
```

Expected: FAIL before the renderer and route exist.

- [ ] **Step 2: Implement the owner-safe export route**

The route requires the current user, owned application, current succeeded V3 run matching the selected asset and latest structure, and returns UTF-8 `text/markdown` with a safe RFC 5987 filename. Stale/absent results return 409 without Provider detail.

- [ ] **Step 3: Add the download control to `待补差距`**

Show `导出 Markdown` only for the current succeeded result. Reuse the existing object-URL download pattern and show success/failure feedback.

- [ ] **Step 4: Write and implement account-export coverage**

Add owner-filtered V3 runs, requirements, criteria, results and assessments to a versioned `jd-gap-analysis-v3.json` entry. Include run IDs, versions, statuses, counts, bounded reasons/questions and verified excerpts, but not complete source documents, storage paths, Provider bodies or other users' rows.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec vitest run src/features/jd-gap-analysis/markdown.test.ts 'src/app/api/applications/[id]/jd-gap/export/route.test.ts' src/features/jd-gap-analysis/analysis-panel.test.tsx src/features/privacy/export.test.ts
pnpm typecheck
git add -- src/features/jd-gap-analysis/markdown.ts src/features/jd-gap-analysis/markdown.test.ts 'src/app/api/applications/[id]/jd-gap/export/route.ts' 'src/app/api/applications/[id]/jd-gap/export/route.test.ts' src/features/jd-gap-analysis/analysis-panel.tsx src/features/jd-gap-analysis/analysis-panel.test.tsx src/features/privacy/export.ts src/features/privacy/export.test.ts src/app/api/account/export/route.ts
git commit -m "feat: export JD gap analysis safely"
```

## Task 9: Replace the application-workspace E2E path

**Files:**
- Modify: `tests/e2e/application-workspace.spec.ts`
- Reuse: `tests/fixtures/resume-en.pdf`
- Reuse: `tests/fixtures/resume-scanned.pdf`

- [ ] **Step 1: Update the deterministic happy path**

With `E2E_FAKE_EXTRACTOR=1`, create an application, land on resume setup, preview and choose/upload the baseline, reach JD setup, click once, and wait for both structure and comparison responses. Assert selected filename, `JD 差距分析`, all five summary counts, the three local tabs, at least one blocking/important gap, and complete rows collapsed at the bottom.

- [ ] **Step 2: Cover exact rules and no hidden gaps**

Seed fake requirements for a composite skill, comparable degree, language/authorization confirmation, a profile-only fact and a fully covered criterion. Assert:

- a comparable degree is complete only when the JD allows it;
- profile-only support remains uncovered and is labeled separately;
- the full list contains every fake requirement;
- expanding a row shows Chinese/original text and exact resume evidence;
- repeat click reuses runs without incrementing attempts.

- [ ] **Step 3: Cover skip, later selection, staleness and legacy**

Skip baseline during setup and assert no AI call/control activation. Select a baseline later and analyze. Change the baseline and assert the old result is marked stale until the user clicks again. Seed one V2 analysis and assert the legacy banner plus readable old rows, without V3 summary fabrication.

- [ ] **Step 4: Cover OCR and responsive access**

Use `resume-scanned.pdf` and the existing injected OCR stub to exercise local recovery without downloading a model or calling paid OCR. At 390×844 assert no horizontal overflow, all status text remains visible, disclosure and `还有 N 条` work, and the former three-column editor/switcher is absent.

- [ ] **Step 5: Cover Markdown and immutable history**

Download the V3 Markdown file and verify it contains unresolved labels but no complete JD/resume document. Keep the existing seeded immutable resume-version PDF/DOCX export assertions.

- [ ] **Step 6: Run and commit E2E**

```bash
E2E_FAKE_EXTRACTOR=1 pnpm exec playwright test tests/e2e/application-workspace.spec.ts --project=chromium
git add -- tests/e2e/application-workspace.spec.ts
git commit -m "test: cover JD gap analysis v3 workflow"
```

Expected: the workspace test passes without external AI/OCR cost.

## Task 10: Full verification, release, and production smoke test

**Files:**
- Modify only if verification reveals an in-scope defect.
- Verify: `docs/superpowers/specs/2026-08-25-jd-gap-analysis-v3-design.md`
- Verify: `docs/evaluations/2026-08-25-jd-gap-prompt-comparison.md`

- [ ] **Step 1: Run all local gates**

```bash
pnpm exec supabase db reset
pnpm test:db
pnpm lint
pnpm typecheck
pnpm test
E2E_FAKE_EXTRACTOR=1 pnpm test:e2e -- --project=chromium
pnpm build
git diff --check
git status --short --branch
```

Expected: database, lint, typecheck, all Vitest, Chromium E2E, production build and whitespace checks PASS; only intended commits exist.

- [ ] **Step 2: Run privacy and call-safety searches**

```bash
rg -n "console\.(log|error|warn).*?(jdText|resumeText|ocrText|confirmedFacts)|JSON\.stringify\(.*?(jdText|resumeText|ocrText).*console" src scripts
rg -n "useEffect\([^)]*analy|自动.*分析|auto.*analy" src/features/jd-gap-analysis
rg -n "slice\(0, 5\)|最多显示五条" src/features/jd-gap-analysis
```

Expected: no content logging, no automatic model call, and no silent five-row cap. Any `slice(0, 5)` must be paired with an explicit remaining-count expansion test.

- [ ] **Step 3: Inspect desktop and mobile UI locally**

Capture 1440×1000 and 390×844 views for no-baseline, analyzing, blocking/important/minor groups, all requirements, JD translation, expanded evidence, legacy banner, and OCR recovery. Verify V2 mint tokens, Chinese-first hierarchy, readable German wrapping, focus indicators, text+symbol statuses, and no horizontal scroll.

- [ ] **Step 4: Configure the evaluated Prompt winner**

Read the winner from `docs/evaluations/2026-08-25-jd-gap-prompt-comparison.md`. Set `JD_GAP_MATCH_PROMPT_VARIANT` to that allowlisted value for Preview and Production without printing API keys or other secret values. Do not modify `DEEPSEEK_API_KEY`.

- [ ] **Step 5: Apply the linked migration and deploy Preview**

```bash
pnpm exec supabase db push --linked
git push -u origin codex/jd-gap-analysis-v3
gh pr create --base main --head codex/jd-gap-analysis-v3 --title "Add evidence-based JD gap analysis" --body-file docs/superpowers/specs/2026-08-25-jd-gap-analysis-v3-design.md
```

Wait for CI and Vercel Preview. Run a non-destructive smoke test with a newly created test account: baseline preview, one-click V3 analysis, exact evidence, comparable degree rule, Markdown export, cache reuse, legacy read, mobile layout, and cross-user isolation. Delete only the test account/data in `finally`.

- [ ] **Step 6: Merge, deploy Production, and verify cost metadata**

After Preview and CI pass, merge through GitHub and wait for the production deployment. Repeat the non-destructive smoke path once. Confirm only run IDs, phase/status, Prompt versions, token counts, cost estimate and latency appear in operational evidence. Never record full JD/resume/profile text.

## Final acceptance checklist

- [ ] The selected resume is previewed and chosen before V3 analysis.
- [ ] One click advances stage one and stage two, with no more than one fresh model call per HTTP request.
- [ ] Stage one sees only the JD; stage two sees structured criteria, selected resume and confirmed facts.
- [ ] Every composite requirement is represented by grouped atomic criteria, including common `A or B` logic.
- [ ] Complete requires all required criterion groups to be satisfied by verified resume evidence.
- [ ] Partial requires at least one verified resume excerpt plus an explicit remaining gap.
- [ ] Profile-only evidence is visibly separate and never upgrades resume coverage.
- [ ] Degree equivalence is allowed only when the JD explicitly permits related/comparable fields.
- [ ] Years, language, authorization, certificate and specified-tool rules are strict.
- [ ] Coverage and impact are separate textual axes; no percentage score is shown.
- [ ] All incomplete requirements remain accessible and complete requirements are collapsed last.
- [ ] Chinese translation is primary and original text remains available.
- [ ] Old V1/V2 results remain readable and are clearly labeled legacy.
- [ ] No analysis starts automatically; identical versioned inputs reuse cached runs.
- [ ] Invalid excerpts are downgraded, unknown/missing IDs retry once, and prior success survives failure.
- [ ] The compact comparison uses no more than 30 calls and USD 2, records only metadata, and deploys the hard-gate winner.
- [ ] Markdown/account exports include sanitized V3 results and exclude complete source documents.
- [ ] RLS, owner-safe RPCs, DB tests, unit tests, E2E, build, privacy search, Preview smoke and Production smoke all pass.
