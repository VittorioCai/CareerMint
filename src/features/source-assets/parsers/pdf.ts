type PdfjsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: { WorkerMessageHandler: unknown };
};

type CanvasGlobal = {
  DOMMatrix?: unknown;
  Path2D?: unknown;
};

export async function extractPdfText(buffer: Buffer) {
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

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
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
