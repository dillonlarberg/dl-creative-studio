# TODOS

## Selection Tools — Deferred Enhancements

### Magic wand threshold slider
**Priority:** P3 | **Size:** S
Editable input or slider as alternative to drag-to-adjust threshold. ~20 min.

### Selection fill preview
**Priority:** P2 | **Size:** S
Semi-transparent fill (10-20% opacity blue) inside marching ants selection. Makes non-contiguous selections visually clearer. Modify drawHatch to fill interior pixels. ~20 min.

### First-use shortcut hints overlay
**Priority:** P3 | **Size:** S
Translucent overlay on canvas area showing interaction hints. Auto-dismiss after 5s or first interaction. localStorage flag for "seen". ~15 min.

## Post-MVP Tools

### Pen Tool (polygon + Bezier)
**Priority:** P2 | **Size:** L
Spec in `docs/superpowers/specs/2026-03-16-structured-selection-tools-design.md`. Implements SelectionTool interface. Click places vertices, drag creates Bezier control handles. Rasterizes closed path to BinaryMask.

### Color Pick Tool
**Priority:** P2 | **Size:** M
Click picks reference color, scans all pixels by Euclidean RGB distance, marks matching pixels. Drag adjusts tolerance. Same interaction model as magic wand.

## Architecture Improvements

### Decompose MaskEditorModal
**Priority:** P3 | **Size:** L
Extract toolbar, canvas area, and footer into separate components. Use custom hooks for tool state management. Target: orchestrator < 200 lines.

### Compressed undo entries
**Priority:** P3 | **Size:** M
Store only bounds-region data in undo stack instead of full-image Uint8Arrays. ~95% memory reduction for large images.

### Production Replicate proxy
**Priority:** P2 | **Size:** M
Two features use Vite dev proxies to call Replicate's API (CORS prevents direct browser calls):
1. **SAM segmentation tool** (`/replicate-api`) — mask editor segment tool
2. **AI recommendation translator** (`/replicate-recommend`) — edit-image revamp

For production, add a single Firebase Cloud Function that proxies to Replicate with the API token server-side, supporting both use cases via a path parameter or separate endpoints. See `docs/superpowers/specs/2026-03-20-segment-tool-design.md` and `docs/superpowers/specs/2026-03-24-edit-image-revamp-design.md` for context.
