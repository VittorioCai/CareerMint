import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";

type PdfjsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler };
};

const pdfjsGlobal = globalThis as PdfjsWorkerGlobal;
pdfjsGlobal.pdfjsWorker ??= { WorkerMessageHandler };

export async function extractPdfText(buffer: Buffer) {
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
