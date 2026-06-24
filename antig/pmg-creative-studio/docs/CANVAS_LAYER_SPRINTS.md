# Canvas Layer — Sprint Tracking

**Branch:** `feat/canvas-layer`
**Component scope:** `src/apps/template-builder/_internal/CanvasLayer.tsx` and supporting files

---

## Sprint 1 — Completed 2026-06-24

### Shipped
- **Zone status badges** — amber/green dot on every zone rect (green = mapped + no overflow, amber = unmapped or overflowing)
- **Text overflow indicator** — iframe zone reporter posts `zone-overflow`; parent-side overflow check in `FilledTemplatePreview` runs 300ms after every `apply-updates` so font-size changes are caught without a full iframe reload
- **Feed row nav inside ZoneInspector** — Prev / Row N of M / Next inside both image and text zone inspectors
- **Pre-flight issues panel** — `FieldMappingPanel` pre-flight header with issue count
- **ZoneInspector design tokens** — header rounded-t-xl, uppercase tracking-[0.2em], card body rounded-b-xl, z-index 30
- **DESIGN.md + `.impeccable/design.json`** — design system documented; named rules (Scale Contract, All-Caps Lock Rule, One Blue Rule, etc.)
- **TDZ crash fix** — `feedSampleData` moved before first `useEffect` in `DesignStep`
- **Stale postMessage race** — `overflowGatedRef` guards zone-overflow messages from old iframe after wireframe change
- **Amber hex token fix** — `#D97706` → `#f59e0b` (amber-500, DESIGN.md warning token)
- **`mappedZoneIds` prop threading** — computed from `allFields + feedMappings` in `DesignStep`, passed to `PreviewPanel` → `CanvasLayer` (replaces broken `slotMappings` inversion)
- **Zone hover labels** — dark pill overlay showing zone ID on hover (`HEADLINE 1`, `CTA`, etc.)
- **"Worst case" feed row jump** — feed nav "Worst" button in PreviewPanel; computes the row with the longest combined text across all mapped text fields and jumps directly to it (solves manual scrolling through 10k+ rows to find overflow edge cases)
- **SKIP_ZONE_IDS filtering on zone-overflow** — prevents wrapper elements (`ad`, `frame`, `left`, `right`) from triggering false amber dots

### Known deferred (not Sprint 1)
- `setAddFieldOpen` no-op — requires a new Add Field dialog component
- Unit tests: `ZoneInspector.test.tsx`, `DesignStep.test.ts`, `CanvasLayer` badge tests, `FieldMappingPanel` pre-flight tests, `reportOverflow` tests

---

## Sprint 2 — Backlog

### Feed-aware overflow analysis
**Partial:** "Worst case" row jump button shipped in Sprint 1 (see below). Full analysis below is Sprint 2.

**What:** The current overflow checker only evaluates the currently-previewed feed row. It has no awareness of content variance across the full feed.

**Desired behaviour:**
- After font size or zone dimension changes, scan the full `feedSampleData` array for each mapped text field
- Find worst-case (longest string) and best-case (shortest non-empty string)
- For each zone, determine at what font size the worst-case value starts overflowing
- Surface in the pre-flight panel: _"At 50px, HEADLINE overflows on ~3,800/10,000 rows. Suggested max: 18px based on longest description value."_

**Implementation notes:**
- `feedSampleData` is already available in `DesignStep`; no new data fetching needed
- Approach: use a hidden off-screen DOM element (or canvas `measureText`) to estimate text height at a given font size + box width, rather than re-rendering every row in the iframe (too slow)
- Alternatively: render the worst-case row in the iframe, check overflow, binary-search the optimal font size
- Output: a `feedOverflowRisk` map per zone → `{ worstCaseLength: number, overflowsAt: number /* rows */, suggestedFontSize?: number }`
- Lives in `DesignStep` alongside `overflowZoneIds`; feeds into `FieldMappingPanel` pre-flight panel

**Acceptance criteria:**
- [ ] Pre-flight panel shows a feed overflow risk line per affected zone
- [ ] Suggested font size is shown when >5% of feed rows would overflow
- [ ] Warning updates within 1s of font-size change (debounced)
- [ ] Does not block or flicker the live preview

---

### Other Sprint 2 candidates (to be prioritised)
- **Undo/redo history** — Cmd+Z / Cmd+Shift+Z + toolbar buttons (⟵/⟶). Requires a history stack in DesignStep (array of `stepData` snapshots or action records). Each canvas mutation (move, resize, style change, zone create/delete) pushes a snapshot. Redo stack is cleared on any new action. Scope: 15–20 snapshots max to avoid memory bloat.
- Add Field dialog (`setAddFieldOpen` currently a no-op)
- Unit test suite for Sprint 1 components
- Zone hover identification + wireframe zone inspector panel (SHIPPED in Sprint 1 tail — hover label shows field label, panel shows X/Y/W/H + alignment + font size)
- Multi-zone selection (lasso) actions — bulk delete, bulk reset
