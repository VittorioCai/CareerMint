// The WebAssembly-only build. The default export of `onnxruntime-web` also
// carries the JSEP glue for WebGPU and WebNN, and asks for the matching
// `.jsep.wasm` — 26.8 MB against 13.5 MB — to run the same CPU kernels: OCR
// here is created with `backend: "wasm"` and never reaches for a GPU.
// scripts/sync-ocr-assets.mjs copies the runtime files this build fetches.
export { default } from "onnxruntime-web/wasm";
