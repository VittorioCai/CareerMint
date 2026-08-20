# CareerMint Interview Preparation Foundation

**Goal:** Replace the interview placeholders with a private, reusable question bank where common questions exist once and automatically appear in every application workspace.

**Architecture:** Store a user-owned canonical question once in `interview_questions`. Job-specific inclusion is a separate `application_interview_questions` link, so one core question can be reused without copies. Alternate wording lives in `interview_question_variants`. Preparation state, outline, and notes stay on the canonical question for reuse; confirmed career facts and STAR stories are linked through `interview_question_facts`.

**Safety rules:** All tables use RLS and owner-scoped RPCs. Common questions are deterministic built-ins and do not call AI. Job-specific questions are labelled as possibilities, never employer certainties. AI generation is the next layer and will only run after an explicit click; this foundation must work with zero model configuration and zero API spend.

---

## 1. Domain contract and database

- Define category, preparation status, source, canonical normalization, and form schemas.
- Add canonical questions, variants, application links, and confirmed-fact links.
- Seed a small common bank for existing and future users.
- Add owner-scoped create/update/link RPCs, RLS, grants, indexes, and pgTAP coverage.

## 2. Repository and actions

- Hydrate questions with variants, linked applications, and linked confirmed facts.
- List the global bank and compose an application preparation set as common plus linked questions.
- Add manual questions without duplicating canonical prompts.
- Save state, outline, and notes through validated server actions.

## 3. Product UI

- Replace `/interview` with searchable/filterable status and category groups.
- Replace the application interview placeholder with the composed preparation set.
- Make preparation state and answer outline editable with clear save feedback.
- Show prediction labels, reuse relationships, variants, and linked evidence.

## 4. Verification and release

- Add schema/action/component tests and extend authenticated Playwright flows.
- Run lint, typecheck, unit tests, build, pgTAP, schema lint, and mobile overflow checks.
- Apply the migration to cloud Supabase, deploy production, and run a no-AI smoke test.
