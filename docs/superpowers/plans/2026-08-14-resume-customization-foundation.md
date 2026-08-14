# CareerMint Resume Customization Foundation

**Goal:** Deliver an evidence-safe, application-specific resume workflow from explicit AI generation through line-by-line review to immutable version snapshots.

**Architecture:** Resume generation is a separate, user-triggered and idempotent AI job. Model output is accepted only when every suggestion references owned confirmed career facts and current owned JD requirements. Suggestions remain mutable review records; only an explicit save action creates an immutable full-version snapshot. Historical evidence stores a fact snapshot as well as the live fact reference, so deleting a career fact cannot rewrite a submitted history.

**Tech stack:** Next.js 16 App Router, React 19, Supabase Postgres/RLS/security-definer RPCs, Zod 4, DeepSeek through the existing `AIProvider`, Vitest, React Testing Library, pgTAP, Playwright.

**Approved product constraints:** This slice follows the confirmed V2 mint workspace design. It does not auto-submit applications, silently update the career profile, or generate unsupported facts. DOCX/PDF export follows this slice after versioning is reliable; the version records and item snapshots are designed as the export source of truth.

---

## 1. Domain and safety contract

Create `src/features/resume-customization/schemas.ts` and tests.

- Define resume sections: summary, experience, project, education, skills, certification, language, achievement.
- Define suggestion decisions: pending, accepted, rejected.
- Require concise English suggestion text, a reason, one or more confirmed fact IDs, and zero or more current requirement IDs.
- Reject unknown fact and requirement IDs.
- Reject output without evidence and deduplicate equivalent suggestions.
- Preserve only the allowlisted fact and requirement references.
- Represent immutable versions and their evidence snapshots in typed domain objects.

## 2. Database persistence and authorization

Add `supabase/migrations/202608140003_resume_customization.sql` and pgTAP coverage.

- Add `resume_generation_runs`, `resume_suggestions`, `resume_suggestion_facts`, `resume_suggestion_requirements`, `resume_versions`, `resume_version_items`, and `resume_version_item_evidence`.
- Enable RLS and expose owner read access only; revoke direct writes from authenticated users.
- Add security-definer RPCs to create/reuse, claim, complete, and fail generation jobs.
- Validate on completion that all evidence facts are owned and confirmed and that all requirements belong to the same application.
- Add review RPC that updates only an owned succeeded run; edited text remains attached to the same approved evidence.
- Add version RPC that snapshots accepted items, assigns a monotonically increasing application version number, and captures immutable fact text/source snapshots.
- Never provide an update or delete path for saved version rows.

## 3. AI provider and orchestration

Extend the independent `AIProvider` interface with `generateResumeSuggestions`.

- Use a fixed system prompt before variable JD, requirement, and fact inputs for cache friendliness.
- Treat all input documents as untrusted data.
- Require structured JSON and cap response length.
- Reuse the existing timeout, one invalid-output retry, metadata-only logging, configurable model, token accounting, and price schedule.
- Compute an input hash from schema version, JD snapshot, current requirements, confirmed facts, provider, and model.
- Call the model only after an explicit user click and AI-processing consent check.
- Reuse successful/running identical jobs and persist safe failures without losing JD or previous versions.

## 4. Review actions and immutable versions

Create repository, service, HTTP handler, API route, and server actions.

- Load current suggestions with resolved confirmed facts and JD requirements.
- Accept, edit-and-accept, or reject one suggestion at a time.
- Validate edited text length and preserve evidence references.
- Create a new version only when at least one accepted item exists.
- Store each version as a complete snapshot and keep its version number stable.
- Expose latest version and version history for the application.

## 5. Three-column resume workspace

Replace the resume placeholder and add `/applications/[id]/resume/[runId]`.

- Resume tab shows the explicit generation control, latest version, history, and safety explanation.
- Desktop editor uses structure/review navigation, document-like preview, and evidence/JD context.
- Mobile switches between content, suggestions, and evidence rather than squeezing three columns.
- Every suggestion visibly provides original fact text, proposed English text, rationale, matching JD requirement, and fact source.
- All controls are keyboard reachable; statuses use text and color; long operations show busy state and recoverable errors.
- Saving creates a new version and redirects to a stable version view or displays the saved result.

## 6. Privacy, regression tests, and release

- Include generation runs, suggestions, versions, items, and evidence snapshots in account ZIP exports.
- Add an E2E flow covering no-call-before-click, confirmed-only evidence, accept/edit/reject, immutable V1/V2, and idempotent generation.
- Verify lint, typecheck, unit tests, build, pgTAP, public-schema lint, and Playwright.
- Apply the cloud migration, deploy production with no AI key cost, smoke test the unavailable-provider path, open a PR, wait for checks, and merge.

