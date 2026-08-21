import type { PdfAdapter, PdfDocumentAdapter, PdfPageImage } from "./runner";
import { raceWithAbort } from "./abort";

interface PdfJsPage {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
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
    async open(data, signal) {
      const loadingTask = pdfjs.getDocument({ data });
      let destroyed = false;
      const destroyLoadingTask = () => {
        if (destroyed) return;
        destroyed = true;
        return loadingTask.destroy();
      };
      let document: PdfJsDocument;
      try {
        document = (await raceWithAbort(loadingTask.promise, signal, destroyLoadingTask)) as PdfJsDocument;
      } catch (error) {
        await Promise.resolve(destroyLoadingTask()).catch(() => undefined);
        throw error;
      }

      return createDocumentAdapter(document);
    },
  };
}

function createDocumentAdapter(document: PdfJsDocument): PdfDocumentAdapter {
  return {
    numPages: document.numPages,
    async renderPage(pageNumber, signal) {
      const page = await raceWithAbort(
        document.getPage(pageNumber),
        signal,
        undefined,
        (latePage) => latePage.cleanup(),
      );
      let canvas: HTMLCanvasElement | undefined;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          page.cleanup();
        } finally {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
      };

      try {
        const initialViewport = page.getViewport({ scale: BASE_SCALE });
        const longestSide = Math.max(initialViewport.width, initialViewport.height);
        const scale =
          longestSide > MAX_LONGEST_SIDE
            ? BASE_SCALE * (MAX_LONGEST_SIDE / longestSide)
            : BASE_SCALE;
        const viewport = page.getViewport({ scale });
        canvas = globalThis.document.createElement("canvas");
        canvas.width = Math.max(1, Math.min(MAX_LONGEST_SIDE, Math.ceil(viewport.width)));
        canvas.height = Math.max(1, Math.min(MAX_LONGEST_SIDE, Math.ceil(viewport.height)));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("resume-ocr-unavailable");
        const renderTask = page.render({ canvasContext: context, viewport });
        await raceWithAbort(renderTask.promise, signal, () => renderTask.cancel());
      } catch (error) {
        release();
        throw error;
      }

      const image: PdfPageImage = {
        page: pageNumber,
        width: canvas.width,
        height: canvas.height,
        source: canvas,
        release,
      };
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

let paddleGeneration = 0;
const disposedPaddleInstances = new WeakSet<object>();

interface PaddleCacheEntry {
  generation: number;
  promise: Promise<PaddleInstance>;
  activeConsumers: number;
}

let paddleCacheEntry: PaddleCacheEntry | undefined;

const PADDLE_OPTIONS: Record<string, unknown> = {
  textDetectionModelName: "PP-OCRv6_small_det",
  textRecognitionModelName: "PP-OCRv6_small_rec",
  worker: true,
  initialize: false,
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
  let entry: PaddleCacheEntry | undefined;
  let leaseHeld = false;

  const disposeInstance = (candidate: PaddleInstance) => {
    if (disposedPaddleInstances.has(candidate)) return;
    disposedPaddleInstances.add(candidate);
    void Promise.resolve(candidate.dispose()).catch(() => undefined);
  };

  const clearEntry = (candidate: PaddleCacheEntry) => {
    if (
      paddleCacheEntry === candidate &&
      paddleCacheEntry.generation === candidate.generation
    ) {
      paddleCacheEntry = undefined;
    }
  };

  const getEntry = () => {
    if (paddleCacheEntry) return paddleCacheEntry;
    const created: PaddleCacheEntry = {
      generation: ++paddleGeneration,
      activeConsumers: 0,
      promise: Promise.resolve().then(async () => {
        const { PaddleOCR } = await options.createPaddleModule();
        return PaddleOCR.create({ ...PADDLE_OPTIONS });
      }),
    };
    created.promise = created.promise.catch((error) => {
      clearEntry(created);
      throw error;
    });
    paddleCacheEntry = created;
    return created;
  };

  const releaseLease = (candidate: PaddleCacheEntry, candidateInstance?: PaddleInstance) => {
    if (!leaseHeld || entry !== candidate) return;
    leaseHeld = false;
    candidate.activeConsumers -= 1;
    if (candidate.activeConsumers > 0) return;
    clearEntry(candidate);
    if (candidateInstance) {
      disposeInstance(candidateInstance);
      return;
    }
    void candidate.promise
      .then((resolved) => {
        if (candidate.activeConsumers === 0) disposeInstance(resolved);
      })
      .catch(() => undefined);
  };

  return {
    async initialize(signal?: AbortSignal) {
      const candidate = getEntry();
      entry = candidate;
      if (!leaseHeld) {
        candidate.activeConsumers += 1;
        leaseHeld = true;
      }
      try {
        instance = await raceWithAbort(candidate.promise, signal, () => {
          releaseLease(candidate);
        });
        await raceWithAbort(instance.initialize(), signal, () => {
          releaseLease(candidate, instance);
          instance = undefined;
        });
      } catch (error) {
        releaseLease(candidate, instance);
        instance = undefined;
        throw error;
      }
    },
    async recognize(image: PdfPageImage, signal?: AbortSignal) {
      if (!instance || !entry || !(image.source instanceof HTMLCanvasElement)) {
        throw new Error("resume-ocr-unavailable");
      }
      try {
        const result = await raceWithAbort(instance.predict(image.source), signal, () => {
          releaseLease(entry!, instance);
          instance = undefined;
        });
        return result[0] ?? { items: [] };
      } catch (error) {
        releaseLease(entry, instance);
        instance = undefined;
        throw error;
      }
    },
    async dispose() {
      // Keep initialized models alive for the next user action. The worker and
      // model are deliberately shared through the module-level cache entry.
    },
  };
}

export function resetBrowserOcrModelForTests() {
  paddleCacheEntry = undefined;
}

export { PADDLE_OPTIONS };
