# Workspace Consistency, Export, and Translation Design

**Date:** 2026-08-24  
**Status:** User-approved design  
**Implementation owner:** Sol  
**Selected direction:** Repair the data flow and the interface together

## Context

Production review exposed seven connected problems: identical resume uploads appear repeatedly, gap results cannot be taken into a writing workflow, applications cannot be removed, manual facts use one unsuitable generic form, the dashboard uses first-use copy after applications exist, resume selection and JD analysis communicate the wrong order, and requirement lists do not prioritize gaps or translate foreign-language content.

The changes form one workflow correction rather than seven isolated patches. The application should lead a user through a predictable sequence, preserve private historical data, and place unsupported requirements before already-proven items.

## Goals

- Prevent identical resume files from creating additional visible source assets.
- Preserve existing historical references while hiding legacy duplicates.
- Export the current resume-gap report as a UTF-8 Markdown file without writing suggestions.
- Allow an owner to delete an application and its application-scoped history safely.
- Tailor career-fact fields and labels to the selected fact category.
- Use first-use language only when the user truly has no applications.
- Put resume selection and preview before explicit JD analysis in both the setup flow and detail navigation.
- Sort unsupported requirements first and show both original text and Chinese translation.
- Produce translations inside the user-triggered JD analysis call, not as an automatic or separate call.

## Non-goals

- No semantic merging or deletion of career facts extracted from legacy duplicate uploads.
- No automatic application deletion based on similar company or role names.
- No resume rewrite suggestions in the gap workflow.
- No automatic JD analysis or translation on page load.
- No external translation provider, OCR call, or paid call for resume preview.
- No deletion of a global source resume when an application is deleted.

## 1. Resume Deduplication

### Root cause

The upload endpoint validates the file, allocates a new UUID, uploads a new object, and inserts a new `source_assets` row every time. The schema has no per-user uniqueness rule for `sha256`, and `listAssets` returns every row. Re-uploading the exact same bytes therefore creates another visible option.

### Canonical records

Add `duplicate_of_id` to `source_assets`. A null value identifies the canonical record. A migration groups rows by `(user_id, sha256)`, chooses one canonical record with this deterministic order, and marks the rest as duplicates:

1. `ready` before `extracting`, `uploaded`, and `failed`;
2. earliest `created_at`;
3. lexicographically smallest `id`.

The migration updates each application's active `resume_source_asset_id` to the canonical ID. It does not rewrite historical gap-run snapshots, processing jobs, or career-fact provenance. Duplicate database rows and private objects remain available to existing history; normal asset lists exclude them.

A partial unique index on `(user_id, sha256)` where `duplicate_of_id is null` prevents two canonical records for the same user and bytes.

### Upload behavior

After validation calculates SHA-256, the endpoint checks for an owned canonical asset before uploading. If one exists, it returns that ID with `reused: true`. If concurrent uploads race, the database uniqueness rule selects one winner; the losing request removes its newly uploaded object, fetches the canonical row, and returns it. No external service receives the file or hash.

Files with different bytes remain separate. A re-exported PDF may therefore remain a separate version even when its visible text is similar. Text-level similarity can be added later only as a user-confirmed suggestion; this iteration never merges on fuzzy similarity.

## 2. Markdown Gap Export

Add an authenticated owner-only endpoint for the current application, selected resume, latest succeeded JD analysis, and matching succeeded gap run. The response is a UTF-8 `.md` attachment with a sanitized filename.

The document contains:

- company, role, export date, and baseline resume filename;
- missing-evidence requirements;
- requirements missing from the resume but backed by confirmed profile evidence;
- partially covered requirements;
- original requirement, Chinese translation, priority, exact verified resume excerpt when present, and confirmed profile evidence when present.

Covered requirements are excluded because the export exists to organize unresolved work. The document contains no rewrite, invented fact, recommendation, or claim about hiring outcomes. A stale or non-current gap run returns a stable conflict response and keeps the page unchanged.

## 3. Application Deletion

Add “删除记录” to the table/board item actions and the application overview. The first activation expands an inline warning that names the company and role; the second activation performs the deletion. This avoids an unnecessary modal while still requiring an explicit destructive confirmation.

Deletion removes the owned application and application-scoped analysis runs, requirements, gap runs, resume versions, stage events, and interview associations through tested database cascades or an owner-only RPC if a restrictive dependency requires an explicit order. It does not delete career facts, shared interview questions, source resumes, or other applications.

On success, detail pages redirect to `/applications`; list pages remove the item after refresh. Failure leaves the record visible and displays a stable error. Cross-user deletion is rejected by RLS and repository ownership checks.

## 4. Category-specific Career Facts

The add and edit experiences share one type-aware field component while continuing to store the existing normalized `CareerFactInput` shape. This avoids a database migration while presenting suitable labels and validation.

| Fact type | Visible fields |
| --- | --- |
| Personal summary | Headline, summary |
| Work experience | Role, company, start/end, responsibilities and outcomes, skills |
| Education | Degree or program, school, start/end, focus or achievements |
| Project | Project name, organization (optional), start/end, contribution and outcome, skills |
| Skill | Skill name, proficiency or usage context |
| Certification | Certificate name, issuer, obtained date, credential details |
| Language | Language, proficiency, certificate or evidence (optional) |
| Quantified achievement | Outcome, metric, context |
| STAR story | Story title, situation, task, action, result |

The component transforms these fields into the existing title, organization, dates, description, and skills properties. Hidden irrelevant inputs are never submitted. Every manual fact still starts as pending and requires explicit confirmation before deterministic AI use.

## 5. Dashboard Copy

The primary dashboard action derives its label from the actual application count:

- zero applications: `添加第一份 JD`;
- one or more applications: `添加 JD`.

This rule is independent of profile completion. The existing application summary remains the source of truth.

## 6. Resume-first Setup and Preview

### Navigation order

Application detail tabs become:

`概览 → 简历 → JD → 面试准备 → 时间线`

### Setup flow

The sequence after saving a new application is:

1. JD and basic application information are saved without an AI call.
2. The user selects an existing resume, uploads one, or explicitly skips.
3. Before selection, the user may preview a resume.
4. Selection or skip redirects to the JD tab in setup mode.
5. The user explicitly starts JD analysis and translation.
6. Completion links back to the Resume tab to analyze gaps.

The visible setup indicator uses `JD 已保存 → 选择并预览简历 → 分析 JD → 查看差距`. It distinguishes saving a JD from analyzing it, so “resume before JD” unambiguously means resume before JD analysis.

### Private preview

A protected owner-only preview route reads the stored private asset without exposing a public storage URL. PDF files render inline in the browser's PDF viewer. DOCX files are parsed server-side into sanitized plain text and shown in an inline expandable preview. Preview does not call AI or OCR. A scanned PDF remains visually inspectable through the PDF viewer even when it contains no text layer.

Preview errors leave the selector usable and offer download/open as a fallback. Keyboard users can open and close the preview, and focus returns to the triggering row.

## 7. Requirement Priority and Chinese Translation

### Ordering

Both the priority view and every expanded category in “全部要求” use this status order:

1. no evidence;
2. needs user judgment;
3. partial match;
4. evidence.

Within a status, core requirements precede supporting requirements, then the original stable sort order applies. Category headers remain collapsed by default and show status counts.

### Translation data

The JD provider output adds:

- `jdTranslationZh` for the complete JD;
- `translationZh` for every structured requirement.

The schema enforces trimmed bounded strings. Original requirement text and verbatim source excerpts remain the grounding source; translation is explanatory text and never substitutes for evidence validation. The analysis schema version is incremented so an old cached result cannot masquerade as a translated result.

The database stores requirement translations alongside requirement rows and the full JD translation in the analysis-run result. New analyses generate structure, matching, and translation in one provider call. This increases output tokens but does not add a second request. Existing runs remain readable; when translation fields are absent the UI states that the analysis predates Chinese translation and offers the existing explicit re-analysis action.

### Presentation

Collapsed requirement rows show the original requirement, priority, and status. Expanded content follows this order:

1. Chinese translation;
2. match reason;
3. verified resume excerpt or confirmed career evidence;
4. original JD source excerpt.

The JD source view contains two independent closed disclosures: `JD 中文翻译` first and `JD 原文` second. Long English or German strings wrap without reducing the base font size.

## Error Handling and Privacy

- Duplicate reuse and cleanup never log filenames, resume text, JD text, or hashes in ordinary application logs.
- Failed Markdown export returns a stable message and never falls back to another user's or historical run.
- Delete operations require the exact owned application ID and explicit confirmation value.
- Preview sets `Content-Disposition: inline` only after ownership validation and uses restrictive content headers.
- Translation output that fails schema validation fails the entire new analysis; the previous succeeded run stays visible.
- No newly added behavior runs DeepSeek, OCR, or translation automatically.

## Testing and Acceptance

### Automated tests

- Upload HTTP tests prove identical bytes return the canonical asset and do not upload again.
- Repository and database tests prove legacy duplicates are hidden, active application references are canonicalized, and the partial unique index rejects a second canonical row.
- Export tests verify authentication, ownership, current-run binding, filename sanitation, UTF-8 content, ordering, translations, and absence of rewrite suggestions.
- Deletion action, repository, and database tests verify explicit confirmation, owner isolation, cascades, preserved global facts/assets, redirects, and failure feedback.
- Fact-form tests cover every category, visible labels, transformations, irrelevant-field omission, validation, and pending status.
- Dashboard tests cover zero and nonzero application labels.
- Baseline-selector tests cover PDF/DOCX preview, selection-to-JD redirect, skip behavior, error recovery, and no AI/OCR calls.
- JD schema, prompt, service, repository, migration, and panel tests cover translations, schema-version cache invalidation, status ordering, progressive disclosure, and old-run fallback copy.
- E2E tests cover `添加 JD → 预览/选择简历 → 分析 JD → 返回简历差距 → 导出 Markdown`, plus deleting an application.

### Acceptance criteria

- Uploading the exact same resume again does not add another visible option.
- Existing duplicate rows disappear from normal selection without breaking historical records.
- The exported Markdown contains only unresolved comparison material and opens correctly as UTF-8.
- An application can be deleted only after explicit confirmation, and global resumes/facts remain.
- Language facts never show company, employment dates, or skill-list fields.
- Existing users with applications see `添加 JD`, not `添加第一份 JD`.
- Resume is before JD in detail navigation and before JD analysis in setup.
- Every selectable resume has a preview action that does not trigger AI or OCR.
- “全部要求” puts unsupported items first.
- New JD analyses display both original text and Chinese translation, with the full translated JD folded by default.
