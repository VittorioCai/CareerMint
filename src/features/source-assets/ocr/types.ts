export type OcrProgress =
  | { phase: "loading-model" }
  | { phase: "recognizing"; page: number; totalPages: number };

export interface ScannedPdfOcrOptions {
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
}
