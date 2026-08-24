# JD Summary and Resume Gap Redesign

**Date:** 2026-08-24  
**Status:** Approved for implementation planning  
**Selected direction:** A — summary dashboard with progressive disclosure  
**Comparison mode:** Optional per-application resume plus confirmed career-profile evidence

## Context

The current JD tab renders every requirement, match reason, career fact, and source excerpt in one long page. The current resume flow adds a three-column editor containing AI rewrites, a document preview, evidence cards, accept/edit/reject controls, template selection, and version creation. Both screens expose too much detail at once and make it difficult to answer the user's primary questions:

1. What matters most in this JD?
2. What does my current resume still fail to cover?

The user selected a progressive-disclosure layout and explicitly removed resume rewrite suggestions and repeated review decisions from the primary experience. The user also specified that every application must offer an optional resume upload or selection immediately after the JD is entered. That application-specific resume is the comparison baseline; confirmed career-profile facts supplement it.

## Goals

- Make the JD tab understandable from its first viewport.
- Keep full requirements, evidence, and source text available on demand.
- Add an optional application-specific resume selection step after JD creation.
- Distinguish content omitted from the selected resume from genuine evidence gaps.
- Show gap analysis only; do not generate rewrite suggestions or require accept/edit/reject decisions.
- Preserve fact provenance, safety rules, existing immutable resume versions, and exports.
- Avoid repeated model calls by caching identical analyses.
- Keep the design usable on desktop and mobile with keyboard-accessible controls.

## Non-goals

- No automatic resume rewriting.
- No new resume editor or document-layout workflow.
- No automatic application submission.
- No claim that a gap must be filled or that adding a phrase will improve hiring outcomes.
- No deletion or migration of existing resume suggestions, runs, versions, or exported-document history.
- No silent writes from an application resume into the career profile.

## User Flow

### 1. Create an application

The application creation flow becomes two explicit stages:

1. **Add JD:** keep the existing paste, link, and manual entry behavior and save the application draft.
2. **本次对照简历:** offer three choices after the JD is saved:
   - **上传新简历** — upload PDF or DOCX using the existing file validation, private storage, PDF/DOCX parsing, and browser-local OCR fallback.
   - **选择已有简历** — choose a previously uploaded source asset by filename and upload date.
   - **暂时跳过** — enter the application workspace without a baseline resume.

The step is optional. Skipping never blocks application creation. The Resume tab continues to offer upload and selection later.

The selected asset belongs to this application only. Selecting a different baseline for one application does not change any other application or the user's global career profile.

### 2. Analyze the JD

JD analysis remains an explicit user action. It continues to extract structured requirements and match only confirmed career-profile facts. A selected application resume does not become a confirmed career fact and does not silently change the profile.

### 3. Analyze resume gaps

When a baseline resume is selected, the Resume tab shows a single explicit action: **分析简历差距**. This parses the selected file, then compares its text with the latest structured JD requirements. The application combines that result with existing confirmed profile matches.

When no baseline resume is selected, the Resume tab works in **仅职业档案模式**. It displays profile-supported, partial, missing, and needs-user statuses from the latest JD analysis and offers a non-blocking upload control. It does not call the resume-gap model.

## JD Tab Design

### Summary area

The large analysis control becomes a compact status/action row followed by a summary dashboard. The summary shows:

- total structured requirements;
- core requirements;
- requirements with confirmed evidence;
- requirements needing attention.

`需要关注` includes core requirements whose match status is `partial`, `none`, or `needs_user`. Supporting requirements remain visible in the full list but do not displace core gaps in the priority summary.

### Views

The JD panel contains three local views beneath the application-level tabs:

1. **重点** — default view; shows at most five requirements ordered by:
   1. core + `none`;
   2. core + `needs_user`;
   3. core + `partial`;
   4. supporting + `none`;
   5. supporting + `needs_user` or `partial`.
2. **全部要求** — categories are collapsed by default and show category name, count, and status counts.
3. **JD 原文** — the complete immutable JD snapshot, hidden until selected.

### Requirement rows

Every requirement is a one-line summary by default:

- requirement text;
- core/supporting label;
- textual match-status chip.

Expanding the row reveals, in order:

1. the short match reason when available;
2. linked confirmed career facts and their sources;
3. the verified JD source excerpt.

Only one requirement needs to be open at a time in the priority view. The full categorized view may allow multiple open rows, but nothing is open by default.

## Resume Tab Design

The application-level tab label remains **简历** for navigation stability. Its page heading becomes **简历差距**.

### Baseline selector

The top row displays:

- the selected filename and upload date;
- **更换简历**;
- **上传新简历**;
- or **暂时跳过** when the setup step is active.

Changing the baseline never deletes the previous source asset or previous analysis. The current application stores only the active baseline selection.

### Summary

With a baseline resume, the summary shows four counts:

- `简历漏写`;
- `部分覆盖`;
- `缺少证据`;
- `已经覆盖`.

Only the first three groups are expanded in the main page. `已经覆盖` is collapsed at the bottom.

Without a baseline resume, the summary is explicitly labeled **仅职业档案模式** and does not use the phrase `简历漏写`.

### Deterministic display classification

The model returns only resume coverage for each known requirement: `covered`, `partial`, or `missing`, with an optional exact resume excerpt. Existing JD analysis supplies confirmed profile evidence.

The UI classification is deterministic:

1. **简历漏写** — resume coverage is `missing`, and the requirement has at least one linked confirmed career fact.
2. **部分覆盖** — resume coverage is `partial`.
3. **缺少证据** — resume coverage is `missing`, and the requirement has no linked confirmed career fact. Preserve `需要用户判断` as a secondary text label when applicable.
4. **已经覆盖** — resume coverage is `covered`.

If the resume covers a requirement that is not represented by a confirmed profile fact, it is still `已经覆盖` for this read-only comparison because the verified excerpt proves the text exists in the user-provided resume. It does not become a confirmed career fact and cannot be reused for generated claims.

### Gap rows

Each collapsed row shows:

- JD requirement text;
- core/supporting priority;
- one gap-status chip.

Expanding it shows only evidence and explanation:

1. verified JD source excerpt;
2. verified current-resume excerpt, if present;
3. linked confirmed career-profile facts, if present;
4. a short explanation of why the deterministic classifier placed it in the group.

The row contains no rewrite, accept, edit, reject, or confirmation action.

### Historical versions

Existing immutable resume versions remain available in a collapsed **历史版本** section below the gap analysis. Existing version pages and export actions remain unchanged. The primary UI no longer exposes generation, review, template selection, or new-version creation.

## Data and Architecture

### Application baseline

Add nullable `applications.resume_source_asset_id` referencing `source_assets(id)` with `on delete set null`. Ownership checks must ensure the application and asset belong to the same authenticated user before assignment.

The application repository exposes a narrow method for changing this selection. No source asset is copied or deleted.

### Resume-gap runs

Add two owner-scoped resources:

- `resume_gap_runs`
  - application, user, JD-analysis-run, nullable source-asset reference, source filename/SHA-256 snapshots, input hash, provider, model, status, attempts, sanitized usage/cost result, stable error code, timestamps;
- `resume_gap_items`
  - run, application, user, requirement, resume coverage, verified resume excerpt, stable sort order.

Rows use RLS owner policies and controlled RPCs following the existing JD-analysis and resume-generation job patterns.

### AI provider boundary

Extend the independent `AIProvider` interface with a resume-gap method. The default DeepSeek implementation receives:

- structured requirement IDs, text, category, and priority;
- extracted text from the selected baseline resume.

It does not receive instructions to rewrite the resume. Its JSON output contains exactly:

```json
{
  "items": [
    {
      "requirementId": "uuid",
      "resumeCoverage": "covered",
      "resumeExcerpt": "exact text or null"
    }
  ]
}
```

Programmatic sanitization must:

- reject unknown requirement IDs;
- deduplicate requirement IDs;
- require `covered` and `partial` excerpts to be exact substrings of normalized resume text;
- require `missing` items to have a null excerpt;
- cap excerpt length;
- require exactly one valid item for every supplied requirement, otherwise fail the run with a stable invalid-output error and retain the prior successful run;
- never store or log the complete resume text, JD, or provider response.

The short explanation displayed by the UI is deterministic and derived from resume coverage plus existing confirmed-profile matches. It is not generated by the model.

### Caching and cost

The input hash contains a schema version, provider/model, selected asset SHA-256, and a stable projection of the latest structured requirements. An existing succeeded run with the same hash is reused. A fresh running run is returned rather than duplicated; stale work follows the existing lease/reclaim pattern.

One new model call is permitted only when the user clicks **分析简历差距** for a new JD/resume combination. Selecting the same data again costs nothing. Skipping the resume performs no resume-gap call.

## Empty, Loading, and Error States

- **No JD analysis:** show `先完成 JD 分析，才能判断简历差距` and link back to the JD tab.
- **No baseline resume:** show profile-only results and the optional upload/selection control.
- **No confirmed profile facts:** still show resume coverage; profile supplementation is labeled unavailable.
- **Parse failure:** preserve the application and uploaded file; allow retry, another file, or the existing browser-local OCR fallback.
- **AI failure:** preserve JD, baseline selection, prior successful gap run, and versions. Show a stable retry message without provider details.
- **Deleted selected asset:** clear the application selection through the foreign key, show the no-baseline state, and retain prior run metadata using the filename/SHA-256 snapshots; the run's source-asset reference becomes null.
- **No gaps:** show a concise success state and keep `已经覆盖` collapsed for inspection.

Long operations show progress and allow navigation away. Reopening the application reads the current run status.

## Responsive and Accessibility Rules

- Desktop and mobile both use one reading column for JD and gap lists.
- Mobile removes the former `正文 / 建议 / 证据` switcher entirely.
- Native disclosure semantics or equivalent accessible buttons expose `aria-expanded` and keyboard operation.
- Status is always expressed in text and symbol, never color alone.
- Focus returns to the expanded row after closing or switching a detail.
- Empty states always name the next available action; optional upload is never phrased as mandatory.

## Compatibility and Migration

- Existing applications start with `resume_source_asset_id = null` and therefore use profile-only mode.
- Existing resume generation data, review decisions, versions, and exports remain readable.
- Existing deep links to generation runs and immutable versions continue to resolve.
- The old generation control and editor are removed from primary navigation but their storage is not destructively changed.

## Testing Strategy

### Unit and component tests

- priority ordering and five-item limit;
- summary counts and category counts;
- collapsed-by-default requirement and JD-source disclosure;
- deterministic gap classification for every profile/resume combination;
- profile-only mode never says `简历漏写`;
- baseline selection, replacement, and skip behavior;
- no rewrite/review/template controls in the primary Resume tab;
- existing historical versions remain accessible;
- keyboard and ARIA disclosure behavior.

### Service and security tests

- exact resume-excerpt verification;
- unknown and duplicate requirement rejection;
- missing or invalid output fails safely while preserving the prior successful result;
- input-hash reuse and running-task deduplication;
- owner-only baseline assignment and run reads;
- no full resume/JD/provider content in normal logs or HTTP errors;
- mock provider in CI and no production fake-provider path.

### End-to-end tests

- create application, save JD, upload a baseline resume, analyze, and see all four classifications;
- create application and skip resume, then see profile-only mode;
- add a baseline later and transition from profile-only to resume comparison;
- replace the selected baseline without changing another application;
- expand and collapse JD/gap evidence on desktop and 390 px mobile;
- open and export a pre-existing immutable resume version.

## Acceptance Criteria

The redesign is complete when a user can understand the important JD requirements and resume gaps without scrolling through evidence by default; can optionally select a different baseline resume for every application; can distinguish resume omissions from true profile evidence gaps; can inspect all supporting evidence on demand; and never encounters AI rewrite suggestions or accept/edit/reject decisions in the primary flow.
