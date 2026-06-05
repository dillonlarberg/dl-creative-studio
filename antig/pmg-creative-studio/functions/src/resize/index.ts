// Public exports for the resize package. `runOutpaintBatch` is the only
// onCall registered with Firebase; the rest are pipeline/storage helpers
// re-exported for callers and unit tests.
//
// The outpaint primitives (P1/P2 pipeline, canvas prep, legalGenDims, schema,
// config) now live in `_shared/ai/outpaint`. They are re-exported here so the
// resize package's public surface is unchanged for existing consumers.
export * from "../_shared/ai/outpaint";
export * from "./errorClassifier";
export * from "./ssrf";
export * from "./storage";
export * from "./runOutpaintBatch";
