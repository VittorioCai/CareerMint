type PdfjsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: { WorkerMessageHandler: unknown };
};

type CanvasGlobal = {
  DOMMatrix?: unknown;
  Path2D?: unknown;
};

/**
 * A resume is a page or two, and ten megabytes of PDF can declare thousands.
 * Each is parsed in turn on a route with sixty seconds to live, so a document
 * built to be slow could hold one for all of them. Fifty is far past any
 * resume and well inside the time there is.
 */
export const MAX_PDF_PAGES = 50;

/**
 * Pages are not all the same size, so the count alone does not bound the
 * work. This does. It is checked between pages, which is the only place the
 * parser yields.
 */
export const PDF_PARSE_BUDGET_MS = 20_000;

export async function extractPdfText(
  buffer: Buffer,
  now: () => number = Date.now,
) {
  const canvas = await import("@napi-rs/canvas");
  const canvasGlobal = globalThis as unknown as CanvasGlobal;
  if (canvasGlobal.DOMMatrix === undefined) {
    canvasGlobal.DOMMatrix = canvas.DOMMatrix;
  }
  if (canvasGlobal.Path2D === undefined) {
    canvasGlobal.Path2D = canvas.Path2D;
  }

  const [{ getDocument }, { WorkerMessageHandler }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ]);
  const pdfjsGlobal = globalThis as PdfjsWorkerGlobal;
  pdfjsGlobal.pdfjsWorker ??= { WorkerMessageHandler };

  const startedAt = now();
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  try {
    const document = await loadingTask.promise;
    // The code every caller already explains to the reader: this document
    // is longer than a resume. Reading the first fifty pages and saying
    // nothing about the rest would be an analysis of part of a file,
    // presented as an analysis of the file.
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error("resume-text-too-long");
    }
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (now() - startedAt > PDF_PARSE_BUDGET_MS) {
        throw new Error("resume-parse-timeout");
      }
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" ");
      pages.push(text);
    }

    return pages.join("\n");
  } finally {
    await loadingTask.destroy();
  }
}
