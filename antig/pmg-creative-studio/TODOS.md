# TODOS

## Phase 2: Konva Canvas Upgrade — Needs Scoping
**What:** Before starting the Konva canvas upgrade, run `/office-hours` + `/plan-eng-review` to produce a proper implementation plan.
**Why:** The Phase 2 section in the current design doc is aspirational (no task breakdown, no migration plan from CSS overlay → Konva Stage, no coordinate-system reconciliation spec).
**Context:** Phase 2 replaces CanvasOverlay.tsx CSS div handles with a Konva Stage + Transformer for drag/resize/lasso. The zone-reporter postMessage protocol from Phase 1 is reusable. Key open questions: how to reconcile Konva's coordinate system with the iframe scale; how to handle multi-size templates; whether ResizeObserver from Phase 1 needs to change.
**Depends on:** Phase 1 complete and verified on localhost.
