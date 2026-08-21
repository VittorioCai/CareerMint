# Local Resume OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add zero-per-call browser OCR for scanned PDF resumes using Baidu PP-OCRv6 Small while preserving the existing native parser, AI consent, evidence checking, and idempotent DeepSeek extraction flow.

**Architecture:** The server remains the first extraction path. When its native PDF parser reports `resume-text-too-short`, the client dynamically loads a focused OCR module, renders the local PDF with PDF.js, recognizes pages with the official PaddleOCR browser SDK, and resubmits normalized OCR text through an independently idempotent extraction job. OCR source text is never written to logs or job metadata.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Vitest/Testing Library, PDF.js 6, `@paddleocr/paddleocr-js` 0.4.x, PP-OCRv6 Small, Supabase processing jobs.

---

### Task 1: Accept validated OCR text in the existing extraction pipeline

**Files:**
- Modify: `src/features/extraction/http.ts`
- Modify: `src/features/extraction/service.ts`
- Modify: `src/app/api/source-assets/[id]/extract/route.ts`
- Test: `src/app/api/source-assets/[id]/extract/route.test.ts`
- Test: `src/features/extraction/service.test.ts`

- [x] **Step 1: Write failing handler tests for OCR input and idempotency**

Add tests that POST `{ "ocrText": "..." }`, expect the OCR-specific key, and verify the text reaches `runExtraction` without appearing in the response:

```ts
const ocrText =
  "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";
const request = new Request(
  `http://localhost/api/source-assets/${assetId}/extract`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ocrText }),
  },
);

expect(fakes.createOrGetJob).toHaveBeenCalledWith(
  assetId,
  `source-asset:${assetId}:resume-extract:ocr:v1`,
);
expect(fakes.runExtraction).toHaveBeenCalledWith(
  expect.objectContaining({ sourceText: ocrText }),
);
```

Also cover malformed/too-short text with a sanitized `400` response and ensure no job/provider is created.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm vitest run 'src/app/api/source-assets/[id]/extract/route.test.ts' src/features/extraction/service.test.ts
```

Expected: FAIL because the handler ignores the body and the service has no `sourceText` override.

- [x] **Step 3: Implement the minimal request contract**

Parse JSON only when `content-type` is JSON, validate optional OCR text with `normalizeResumeText`, and extend the dependency input:

```ts
runExtraction(input: {
  userId: string;
  job: ProcessingJob;
  asset: ResumeExtractionAsset;
  provider: Pick<AIProvider, "extractResumeFacts">;
  sourceText?: string;
}): Promise<ProcessingJob>;
```

Use `source-asset:${asset.id}:resume-extract:ocr:v1` only when validated OCR text is present; retain the existing `...:resume-extract:v1` key otherwise. Return `{ error: "invalid-ocr-text" }` with status 400 for invalid input without including submitted text.

- [x] **Step 4: Make the extraction service skip storage parsing for OCR input**

Extend `run` with `sourceText?: string` and select the source without logging it:

```ts
const sourceText = input.sourceText
  ? normalizeResumeText(input.sourceText)
  : await parseStoredResume(input.asset);
```

Keep `verifyCandidateEvidence`, cost accounting, job persistence, and failure sanitization unchanged. Update the route dependency to pass `sourceText` into the service.

- [x] **Step 5: Verify GREEN and commit**

Run the focused tests and then:

```bash
pnpm typecheck
git add src/features/extraction/http.ts src/features/extraction/service.ts \
  'src/app/api/source-assets/[id]/extract/route.ts' \
  'src/app/api/source-assets/[id]/extract/route.test.ts' \
  src/features/extraction/service.test.ts
git commit -m "feat: accept local OCR resume text"
```

Expected: focused tests and typecheck pass.

### Task 2: Build the lazy local PP-OCRv6 PDF engine

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/features/source-assets/ocr/types.ts`
- Create: `src/features/source-assets/ocr/pdf-ocr.ts`
- Create: `src/features/source-assets/ocr/pdf-ocr.test.ts`

- [x] **Step 1: Add the official browser SDK**

Run:

```bash
pnpm add @paddleocr/paddleocr-js@^0.4.2
```

Do not statically import it from `upload-form.tsx`; the OCR implementation must remain behind a dynamic `import()`.

- [x] **Step 2: Define the testable OCR contract and failing tests**

Define focused public types:

```ts
export type ResumeOcrProgress =
  | { phase: "loading-model" }
  | { phase: "recognizing"; page: number; totalPages: number };

export type ResumePdfOcrOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: ResumeOcrProgress) => void;
};
```

Write tests with injected fake PDF pages and OCR engine to verify:

- page text is joined in page order;
- blank/low-confidence items are discarded;
- `loading-model` is reported once and page progress is reported for every page;
- more than 10 pages throws `resume-ocr-too-many-pages` before model initialization;
- an aborted signal throws an `AbortError` and stops subsequent pages;
- normalized output under 40 characters throws `resume-text-too-short`.

- [x] **Step 3: Run the OCR unit test and verify RED**

Run:

```bash
pnpm vitest run src/features/source-assets/ocr/pdf-ocr.test.ts
```

Expected: FAIL because the OCR module does not exist.

- [x] **Step 4: Implement PDF rendering and PP-OCRv6 Small inference**

Create a client-only module that dynamically imports PDF.js and PaddleOCR inside the exported function. Configure the official SDK with the small pair and worker mode:

```ts
const ocr = await PaddleOCR.create({
  textDetectionModelName: "PP-OCRv6_small_det",
  textRecognitionModelName: "PP-OCRv6_small_rec",
  worker: true,
  ortOptions: { backend: "wasm", numThreads: 1, simd: true },
});
```

Render one page at a time at a bounded scale, pass the canvas or `ImageBitmap` to `predict`, keep lines with non-empty text and score at least `0.35`, and release page/canvas/bitmap resources immediately. Use a module-level promise to reuse the initialized model in the same browser session. Always normalize the final result with the existing text limits.

Use one WASM thread for the MVP so the app does not require cross-origin-isolation headers or `SharedArrayBuffer`; the dedicated PaddleOCR worker still keeps inference off the UI thread.

Keep PDF.js worker setup compatible with Next.js 16 by using a statically analyzable worker URL or the supported package worker asset; do not use a server import of this client module.

- [x] **Step 5: Verify GREEN, type safety, and commit**

Run:

```bash
pnpm vitest run src/features/source-assets/ocr/pdf-ocr.test.ts
pnpm typecheck
git add package.json pnpm-lock.yaml src/features/source-assets/ocr
git commit -m "feat: add local PaddleOCR PDF engine"
```

Expected: tests and typecheck pass without loading the real model in Vitest.

### Task 3: Trigger OCR only after native scanned-PDF failure

**Files:**
- Modify: `src/features/source-assets/upload-form.tsx`
- Modify: `src/features/source-assets/upload-form.test.tsx`

- [x] **Step 1: Write failing component tests for fallback, progress, caching, and cancellation**

Inject an optional `ocrPdf` prop for tests. Simulate upload success, native job failure with `resume-text-too-short`, OCR success, and OCR extraction success. Assert that the second extraction request contains only validated OCR JSON:

```ts
expect(request).toHaveBeenCalledWith(
  `/api/source-assets/${assetId}/extract`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ocrText }),
  },
);
```

Add tests that progress renders “正在本地识别扫描版简历（第 2/3 页）”, retry reuses cached OCR text without re-running the OCR function, and clicking “取消本地识别” aborts the injected OCR operation.

- [x] **Step 2: Run the component test and verify RED**

Run:

```bash
pnpm vitest run src/features/source-assets/upload-form.test.tsx
```

Expected: FAIL because the component has no OCR phase or fallback.

- [x] **Step 3: Implement the fallback state machine**

Extend the phase union with `ocr`, retain the selected `File`, and keep an `AbortController` plus cached OCR text. The default OCR function must load the engine only on demand:

```ts
async function defaultOcrPdf(
  file: File,
  options: ResumePdfOcrOptions,
) {
  const { extractScannedPdfText } = await import("./ocr/pdf-ocr");
  return extractScannedPdfText(file, options);
}
```

When polling returns `resume-text-too-short` for a PDF, run OCR and resubmit with `ocrText`. Never trigger OCR for DOCX or for AI/provider failures. Cache successful OCR text in component state/ref so the retry button resubmits without recognizing again.

- [x] **Step 4: Add accessible progress and error copy**

Render determinate page progress and a cancel button during OCR. Add user-facing mappings for `resume-ocr-too-many-pages`, `resume-ocr-unavailable`, `resume-text-too-short`, and `ai-provider-authentication-failed`. The busy state includes upload, OCR, and extraction; every status is announced through `aria-live` or `role="alert"`.

- [x] **Step 5: Verify GREEN and commit**

Run:

```bash
pnpm vitest run src/features/source-assets/upload-form.test.tsx
pnpm typecheck
git add src/features/source-assets/upload-form.tsx \
  src/features/source-assets/upload-form.test.tsx
git commit -m "feat: fall back to local OCR for scanned resumes"
```

Expected: all upload form tests and typecheck pass.

### Task 4: Document, verify, and production-build the OCR path

**Files:**
- Modify: `README.md`
- Modify if required by build: `next.config.ts` or the existing Next configuration file

- [x] **Step 1: Document runtime behavior and cost boundary**

Add a concise README section stating that text PDFs use native extraction, scanned PDFs use browser-local PP-OCRv6 Small, OCR has no per-call API charge, and DeepSeek is still required for structured fact extraction. State that model files are downloaded but resume pixels are not sent to an OCR API.

- [x] **Step 2: Run the full verification suite**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: zero lint errors, zero type errors, all tests pass, and the Next.js production build completes.

- [x] **Step 3: Inspect the production client chunks**

Confirm the PaddleOCR/OpenCV/ONNX code is not part of the initial upload page chunk and is emitted as an on-demand chunk. If Next.js requires an explicit browser-worker or asset configuration, apply the smallest configuration supported by the local Next.js 16 documentation and rerun the build.

- [x] **Step 4: Commit documentation/build adjustments**

```bash
git add README.md next.config.*
git commit -m "docs: explain local resume OCR"
```

If no Next config change is needed, stage only README. Expected: clean working tree after the commit.

### Task 5: Browser smoke verification

**Files:**
- Create when a stable fixture is needed: `e2e/fixtures/scanned-resume.pdf`
- Modify when automated smoke coverage is practical: the existing resume-upload Playwright spec

- [x] **Step 1: Start the app with the existing fake extractor setup**

Use the repository's documented local Supabase/E2E environment. Ensure the fake extractor is enabled only outside production.

- [x] **Step 2: Verify both PDF paths**

In a Chromium browser:

- upload a normal text PDF and confirm no PaddleOCR model request occurs;
- upload a two-page scanned PDF and confirm OCR progress reaches page 2/2;
- confirm the OCR submission creates facts through the fake extractor;
- cancel one OCR run and confirm no OCR text is submitted;
- retry and confirm the already-uploaded source is not uploaded again.

- [x] **Step 3: Run final verification and commit any fixture/test**

```bash
pnpm verify
pnpm build
git status --short
```

Expected: all checks pass and the only committed fixture contains synthetic data with no personal information.
