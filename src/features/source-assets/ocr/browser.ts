import type { PdfAdapter, PdfDocumentAdapter, PdfPageImage } from "./runner";

interface PdfJsPage {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
  cleanup: () => void;
}

interface PdfJsDocument {
  numPages: number;
  getPage: (page: number) => Promise<PdfJsPage>;
  destroy: () => void | Promise<void>;
}

interface PdfJsLoadingTask {
  promise: Promise<unknown>;
  destroy: () => void | Promise<void>;
}

interface PdfJsModule {
  getDocument: (options: { data: Uint8Array }) => PdfJsLoadingTask;
  GlobalWorkerOptions: { workerSrc: string };
}

const BASE_SCALE = 1.75;
const MAX_LONGEST_SIDE = 2_400;

export function createBrowserPdfAdapter(pdfjs: PdfJsModule): PdfAdapter {
  return {
    async open(data) {
      const loadingTask = pdfjs.getDocument({ data });
      let document: PdfJsDocument;
      try {
        document = (await loadingTask.promise) as PdfJsDocument;
      } catch (error) {
        await Promise.resolve(loadingTask.destroy()).catch(() => undefined);
        throw error;
      }

      return createDocumentAdapter(document);
    },
  };
}

function createDocumentAdapter(document: PdfJsDocument): PdfDocumentAdapter {
  return {
    numPages: document.numPages,
    async renderPage(pageNumber) {
      const page = await document.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: BASE_SCALE });
      const longestSide = Math.max(initialViewport.width, initialViewport.height);
      const scale =
        longestSide > MAX_LONGEST_SIDE
          ? BASE_SCALE * (MAX_LONGEST_SIDE / longestSide)
          : BASE_SCALE;
      const viewport = page.getViewport({ scale });
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
        throw new Error("resume-ocr-unavailable");
      }

      let released = false;
      try {
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (error) {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
        throw error;
      }

      const image: PdfPageImage = {
        page: pageNumber,
        width: canvas.width,
        height: canvas.height,
        release() {
          if (released) return;
          released = true;
          page.cleanup();
          canvas.width = 0;
          canvas.height = 0;
        },
      };
      // Canvas is intentionally exposed as a non-enumerable property so the
      // runner's OCR adapter can pass it without widening the test contract.
      Object.defineProperty(image, "canvas", { value: canvas });
      return image;
    },
    async destroy() {
      await document.destroy();
    },
  };
}

export interface BrowserOcrAdapterOptions {
  createPaddleModule: () => Promise<{
    PaddleOCR: {
      create: (options: Record<string, unknown>) => Promise<{
        initialize: () => Promise<unknown>;
        predict: (input: unknown) => Promise<Array<{ items: Array<{ text: string; score: number }> }>>;
        dispose: () => Promise<void>;
      }>;
    };
  }>;
}

type PaddleInstance = Awaited<ReturnType<BrowserOcrAdapterOptions["createPaddleModule"]>>["PaddleOCR"] extends {
  create: (...args: never[]) => infer Result;
}
  ? Awaited<Result>
  : never;

let paddleInstancePromise: Promise<PaddleInstance> | undefined;

const PADDLE_OPTIONS: Record<string, unknown> = {
  textDetectionModelName: "PP-OCRv6_small_det",
  textRecognitionModelName: "PP-OCRv6_small_rec",
  worker: true,
  ortOptions: {
    backend: "wasm",
    wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/",
    numThreads: 1,
    simd: true,
    proxy: false,
  },
};

export function createBrowserOcrAdapter(options: BrowserOcrAdapterOptions) {
  let instance: PaddleInstance | undefined;

  return {
    async initialize() {
      if (!paddleInstancePromise) {
        paddleInstancePromise = options
          .createPaddleModule()
          .then(({ PaddleOCR }) => PaddleOCR.create({ ...PADDLE_OPTIONS }))
          .catch((error) => {
            paddleInstancePromise = undefined;
            throw error;
          });
      }
      instance = await paddleInstancePromise;
    },
    async recognize(image: PdfPageImage) {
      if (!instance) throw new Error("resume-ocr-unavailable");
      const result = await instance.predict((image as PdfPageImage & { canvas: HTMLCanvasElement }).canvas);
      return result[0] ?? { items: [] };
    },
    async dispose() {
      // Keep initialized models alive for the next user action. The worker and
      // model are deliberately shared through paddleInstancePromise.
    },
  };
}

export function resetBrowserOcrModelForTests() {
  paddleInstancePromise = undefined;
}

export { PADDLE_OPTIONS };
