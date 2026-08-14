# CareerMint Resume DOCX/PDF Export

**Goal:** Export an owned immutable resume version as a polished DOCX or PDF whose content exactly matches the saved version.

**Architecture:** The immutable `ResumeVersion` is the only export source of truth. A server-only document module receives public candidate/application metadata plus version items, builds bytes in memory, and returns them through an authenticated owner-checked route. Export never invokes AI, never rereads mutable career facts, and never creates a new factual statement.

**Document design:** Use the `compact_reference_guide` preset as the single density/hierarchy baseline. Use a named `resume_identity_masthead` adaptation of `memo_masthead`: candidate name, target role/company, and contact line, without a running header or decorative cover. Letter portrait; named resume override margins of 0.70 in; Aptos/Arial-compatible typography; 10.5 pt body; 1.15 line spacing; 4 pt item spacing; real Word list numbering; muted ink for simple and restrained mint/ink accents for modern.

**PDF implementation note:** The production route is Node/serverless, so PDF uses the existing `pdf-lib` dependency instead of Python ReportLab. It implements the same numeric geometry and wrapping tokens. PDF output is restricted to WinAnsi-compatible English-resume text; when unsupported characters are present, the endpoint returns an actionable response and DOCX remains available.

---

## 1. Generator contract and tests

- Define `ResumeExportDocument` with candidate name, email, company, role, template, version number, and immutable version items.
- Group items by the stable resume section order.
- Build DOCX with explicit Letter geometry, named styles, real bullet numbering, exact margins, and section heading rules.
- Build PDF with matching page geometry, typography scale, wrapping, and page breaks; keep employer-facing files free of product watermarks and internal version labels.
- Test that both formats include exactly the immutable item content and exclude fact-audit metadata.
- Test long content creates valid multi-page output without clipping or negative cursor positions.

## 2. Secure export route

- Add `/api/applications/[id]/resume/[versionId]/export?format=docx|pdf`.
- Require a signed-in user, validate both UUIDs, load the owned application and owned version, and use account metadata only after owner checks.
- Return a safe ASCII filename, correct MIME type, attachment disposition, and `private, no-store` caching.
- Return stable 400/404 responses for unsupported format, unsupported PDF characters, invalid IDs, or unowned resources without exposing private text.
- Do not log generated content or save export bytes in database/storage.

## 3. Version-page controls

- Add visible DOCX and PDF download buttons only to immutable version pages.
- Explain that the file is generated from the displayed snapshot and costs no AI tokens.
- Keep DOCX available if PDF cannot encode the candidate's characters.
- Preserve keyboard access, focus states, and clear download feedback from the browser.

## 4. Visual QA and release

- Generate representative simple and modern fixtures with long content.
- Render DOCX via the document skill renderer and PDF via Poppler.
- Inspect every page PNG at full resolution for clipping, wrapping, alignment, spacing, page breaks, and glyph issues; iterate until clean.
- Extend Playwright to verify authenticated downloads and filenames; cover MIME types and foreign-user denial in the isolated HTTP contract tests.
- Run lint, typecheck, unit tests, build, pgTAP, schema lint, and E2E; deploy production and smoke-test both downloads before merging.
