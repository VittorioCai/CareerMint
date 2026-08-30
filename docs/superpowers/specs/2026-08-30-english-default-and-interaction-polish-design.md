# English-default interface and interaction polish

Date: 2026-08-30  
Status: approved for planning

## Objective

Polish the existing product so that navigation, analysis progress, disclosure, and page transitions feel smooth without redesigning the product or changing its evidence rules. At the same time, make English the default interface for new users and signed-out visitors while retaining a complete Chinese interface for existing and bilingual users.

This release must preserve the current visual language, authenticated data, source documents, historical AI results, and explicit-confirmation safety model.

## Confirmed product decisions

- The existing UI and information architecture remain the baseline.
- Motion is allowed when it helps users understand a state change.
- English is the default for new users and signed-out visitors.
- Existing accounts retain their saved interface locale.
- All user-facing pages are available in English and Simplified Chinese.
- The language switch keeps the user on the current route and preserves the current application and tab.
- AI output is generated in the interface language active when the user explicitly starts the operation.
- Switching language never triggers an AI call automatically.
- Historical AI results remain in their original language and show that language clearly.
- User-provided resumes, JDs, company names, notes, and historical records remain in their original language.
- A Vercel preview is reviewed before production deployment.

## Scope

### Interface localization

Localize all user-visible product surfaces:

- public landing page and metadata;
- sign-up, login, password reset, and email-confirmation landing states;
- onboarding;
- app shell, navigation, account menu, empty states, loading states, and errors;
- home;
- new-application workflow;
- application list, board, overview, resume, difference analysis, improvement guidance, interview preparation, and timeline;
- career profile;
- interview library;
- account and privacy settings;
- export labels and generated filenames where the filename is product-owned.

Source documents and user-entered content are not translated by the interface layer.

### Interaction polish

Improve only existing interactions:

- route and tab pending feedback;
- analysis-button feedback and duplicate-submit prevention;
- staged progress copy for long analysis operations;
- restrained content-entry transitions;
- smooth disclosure for details and matched-content sections;
- scroll-position and focus preservation where navigation remains within one application;
- consistent control height, focus treatment, disabled treatment, and feedback placement;
- responsive behavior for filters, tabs, cards, and dense content;
- reduced-motion support.

No new task-management feature, match score, auto-edit feature, or automated application behavior is included.

## Locale architecture

### Locale type

Use one shared application type:

```ts
type AppLocale = "en" | "zh-CN";
```

English is the source dictionary for key completeness. The Chinese dictionary must satisfy the same key structure at compile time.

### URL policy

Keep the current route structure. Do not add locale-prefixed application routes in this release. This avoids breaking existing application links, callbacks, bookmarks, and tests.

The public and authenticated pages resolve language from account or cookie state:

1. For an authenticated user, `profiles.interface_locale` is authoritative.
2. For a signed-out visitor, a valid locale cookie is authoritative.
3. If neither exists, use `en`.

Browser language is not used for automatic redirection because the confirmed product behavior is English by default.

### Language switch

Place `EN / 中文` in the account area on desktop and in the mobile account/navigation surface.

When a user switches language:

- write the locale cookie;
- update `profiles.interface_locale` when authenticated;
- refresh the current route without changing its path, query string, application ID, or active tab;
- restore focus to the language control;
- do not start, repeat, or translate an AI task.

If saving the authenticated preference fails, keep the current page usable, show a localized error, and do not pretend the preference was saved.

### Dictionary boundaries

Use typed, feature-oriented dictionaries rather than one unstructured translation file. Suggested namespaces:

- `common`
- `auth`
- `onboarding`
- `shell`
- `home`
- `applications`
- `careerProfile`
- `differenceAnalysis`
- `improvements`
- `interview`
- `settings`
- `errors`
- `emails`

Server components receive the resolved dictionary on the server. Client components receive only the feature namespace they need. Avoid embedding user content into dictionary files.

### Database default

Add a migration that changes only the database default for future `profiles.interface_locale` rows from `zh-CN` to `en`. Do not update existing profile rows.

## Locale-aware AI output

### Required behavior

Every user-triggered AI workflow receives `outputLocale: AppLocale`:

- resume extraction and normalization;
- JD extraction and requirement analysis;
- resume/JD difference analysis and improvement directions;
- resume customization;
- interview-question and outline generation.

Prompt instructions must explicitly specify the requested output language while retaining original-language citations and source excerpts.

### Stored output locale

Add `output_locale` to the relevant AI run records. Existing successful rows are backfilled as `zh-CN`, because the released prompts currently require Simplified Chinese output. New runs store the requested locale.

The UI displays a localized language chip on historical results, for example `Generated in Chinese` or `英文生成`. Switching interface language does not hide or mutate a historical result.

### Schema compatibility

Current AI contracts contain Chinese-specific field names such as `summaryZh` and `translationZh`. Do not silently place English content into fields whose names promise Chinese.

Introduce versioned, locale-neutral output contracts for new runs. Repository boundaries parse both the existing contract and the new contract and normalize them into one internal view model. Existing rows therefore remain readable without a bulk JSON rewrite.

The migration sequence is:

1. add nullable `output_locale` columns;
2. backfill released historical runs as `zh-CN`;
3. make new run creation require a valid `AppLocale`;
4. introduce new schema and prompt versions;
5. retain legacy parsers for historical results.

### Cache and idempotency

The requested output locale participates in:

- prompt versioning;
- input fingerprints or hashes;
- create-or-get idempotency decisions;
- result freshness checks.

An English request must never reuse a Chinese output as if it were English. A repeated request with identical source material, prompt version, and locale may reuse the existing result.

### Cost behavior

Language switching is free and does not call an AI provider. Only an explicit analyze/generate action can produce a new localized result and API cost. Existing results remain visible so users can decide whether a localized rerun is worthwhile.

## Interaction and motion design

### Motion tokens

Use CSS and existing React capabilities; do not add an animation library.

- micro feedback: 120–160 ms;
- disclosure and content entry: 160–220 ms;
- easing: restrained ease-out for entry and ease-in for exit;
- transform distance: no more than 4–8 px;
- no continuous, decorative, or looping animation in the application workspace.

Under `prefers-reduced-motion: reduce`, remove nonessential transform and opacity animation while retaining immediate state feedback.

### Navigation and tabs

- Show a pending treatment on the selected tab or navigation control immediately.
- Keep the current application header stable while switching application tabs.
- Preserve the query string and active application context.
- Restore the relevant heading or control focus after navigation when necessary for keyboard and screen-reader users.
- Avoid a global full-page spinner when only the content panel is changing.

### Analysis controls

- Disable the analysis trigger after a valid submission begins.
- Replace static button text with localized staged progress such as source reading, comparison, and result preparation.
- Keep an already published result visible while a new analysis is processing.
- Put failures next to the trigger and preserve the old result and user context.
- Re-enable retry without requiring file re-upload or page reload.

### Difference analysis

- Keep the overall judgment and top issues visible before the detailed list.
- Prioritize missing evidence and weak expression before matched content.
- Keep matched content collapsed by default.
- Use smooth native disclosure with a rotating indicator and no layout-jarring animation.
- Keep export, stale-result, and generated-language status close to the result identity.
- Preserve the current evidence and authenticity rules; this work only changes presentation and interaction.

### Improvement guidance

- Keep it read-only in this release.
- Maintain a clear link from every direction back to its source difference when the source is available.
- Keep target location, focus areas, job language, and authenticity visually distinct.
- Do not add persisted `not started`, `done`, or `rejected` task states.
- Keep the transition to interview preparation optional.

## Error handling

- Missing dictionary keys fail tests and development checks rather than silently showing empty text.
- Invalid locale values fall back to `en` for signed-out users and to the last valid profile locale for authenticated users.
- Preference-save failures show a localized non-destructive message.
- A missing legacy output-locale value is interpreted as `zh-CN` only for known released schema and prompt versions.
- AI failures retain source files, drafts, prior results, and the active locale.
- English and Chinese errors share stable internal error codes; only display copy is localized.
- The email-confirmation callback and password-reset flow preserve the selected locale where possible and always provide a usable localized return-to-login path.

## Accessibility and responsive behavior

- Keep all controls keyboard accessible and ensure language switching is announced.
- Maintain at least 44 px touch targets for primary mobile controls.
- Status must not rely on color alone.
- Fix white-on-coral and low-contrast muted-text combinations while preserving the palette.
- Horizontal tab and filter rows may scroll on narrow screens without forcing the whole page to scroll sideways.
- Dense two-column analysis content collapses to one column before it becomes cramped.
- Use localized `lang` attributes for interface copy and retain source-language or `lang="und"` treatment for unmodified excerpts when the precise language is unknown.

## Testing

### Unit and type tests

- dictionary key parity between English and Chinese;
- locale parsing and precedence;
- authenticated and signed-out language switching;
- new-profile default is English while existing rows remain unchanged;
- AI prompt receives the requested locale;
- output locale participates in hashes and idempotency;
- legacy and new AI result contracts normalize to the same view model;
- reduced-motion and pending-state helpers;
- localized error-code mapping.

### Component tests

- app shell and language control in both locales;
- representative forms, empty states, and errors;
- difference analysis and improvement panels with English, Chinese, legacy, stale, processing, and failed results;
- no automatic analyze request occurs when language changes;
- disclosure, pending, retry, and old-result-preservation behavior.

### End-to-end tests

- signed-out visitor lands in English;
- existing Chinese account remains Chinese;
- new account starts in English;
- switching language preserves the current application and tab after refresh;
- an English AI run is not reused for a Chinese request and vice versa;
- old Chinese results remain viewable from an English interface;
- mobile navigation and key application workflows work in both locales.

### Release verification

Run lint, TypeScript checks, unit tests, production build, and targeted end-to-end tests. Test long English and Chinese labels at desktop and mobile widths. Check core authenticated pages manually in the Vercel preview before production release.

## Rollout

1. Introduce locale infrastructure and English dictionaries without changing existing-account preferences.
2. Localize public/auth pages and app shell.
3. Localize feature pages and errors.
4. Add locale-aware AI contracts, storage metadata, hashing, and compatibility adapters.
5. Add interaction polish and reduced-motion behavior.
6. Run full verification and deploy a Vercel preview.
7. User reviews English, Chinese, historical results, and core mobile flows.
8. Deploy to production only after explicit approval of the preview.

## Success criteria

- A signed-out visitor and a newly created account see a complete English experience.
- An existing Chinese account is not unexpectedly switched to English.
- Users can change language without losing their current route or triggering AI cost.
- All released pages have complete English and Chinese interface copy.
- AI results are generated and cached by requested language, with legacy results preserved.
- Core navigation, analysis, disclosure, and retry interactions feel responsive and stable.
- No existing source document, application, career fact, or historical result is rewritten.
- The production deployment occurs only after the preview passes verification and user review.

## Non-goals

- German or additional interface locales;
- automatic browser-language routing;
- automatic translation of resumes, JDs, notes, or historical results;
- persisted improvement-task states;
- new match scores or application recommendations;
- visual redesign of the product;
- changing evidence, authenticity, or confirmation policies;
- adding a paid translation or animation service.
