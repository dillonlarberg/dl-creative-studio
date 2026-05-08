# Creative Alli Studio — UX/UI & Full-Stack Implementation Spec

**Last updated:** 2026-05-08
**Audience:** Full-stack engineers building out the Creative Alli Studio
**Status:** Living spec — Resize Image app is built (frontend prototype); all backend wiring and other features are implementation-ready plans

---

## Table of Contents

1. [Product Context](#1-product-context)
2. [System Architecture](#2-system-architecture)
3. [Data Models & DB Schema](#3-data-models--db-schema)
4. [Auth & Navigation Shell](#4-auth--navigation-shell)
5. [Shared Services & API Conventions](#5-shared-services--api-conventions)
6. [Feature: Resize Image App](#6-feature-resize-image-app) ← built
7. [Feature: Template Builder](#7-feature-template-builder)
8. [Feature: Batch Variation Engine](#8-feature-batch-variation-engine)
9. [Feature: Canvas Editor](#9-feature-canvas-editor)
10. [Feature: Brand Kit](#10-feature-brand-kit)
11. [Feature: Asset Manager (DAM)](#11-feature-asset-manager-dam)
12. [Feature: AI Generation](#12-feature-ai-generation)
13. [Render Pipeline & Job Queue](#13-render-pipeline--job-queue)
14. [Feed Integration Layer](#14-feed-integration-layer)
15. [Platform Sizes & Output Spec](#15-platform-sizes--output-spec)
16. [Build Sequence & Phase Gates](#16-build-sequence--phase-gates)

---

## 1. Product Context

**What this is:** A closed-loop creative production system for PMG media and strategy teams. Not a generic design tool — a performance creative automation platform that connects brief → rendered asset → live campaign, with brand data already loaded from Alli.

**What it replaces:** The current manual pipeline: Figma → CRM team → Google Web Designer → Excel sheet → Puppeteer screenshot → S3 → Alli → platform. The CRM team bottleneck is the primary elimination target.

**Who uses it:** Media buyers, strategy team, campaign managers — non-designers who need production-ready ad assets at scale without engineering involvement.

**The unique moat:** Alli already holds client brand profiles, campaign history, and performance data. This tool is the only creative system that has this wired in by default. Every competitor (Canva, AdCreative.ai, Celtra) requires manual upload.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React / Next.js)                │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Resize App  │  │Template Bldg │  │   Canvas Editor      │  │
│  │  (built)     │  │              │  │   (Fabric.js)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Batch Var.  │  │  Brand Kit   │  │   DAM / Assets       │  │
│  │  Engine      │  │  Manager     │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│              Zustand store  |  React Query (data fetching)      │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTPS / REST + WebSocket (job status)
┌─────────────────────▼───────────────────────────────────────────┐
│                   BACKEND (Next.js API routes or FastAPI)       │
│                                                                 │
│  /api/auth        /api/creatives    /api/templates              │
│  /api/jobs        /api/brand-kits   /api/feeds                  │
│  /api/render      /api/assets       /api/exports                │
└────────────┬──────────────┬──────────────────┬──────────────────┘
             │              │                  │
    ┌────────▼───┐  ┌───────▼──────┐  ┌───────▼──────────────┐
    │ PostgreSQL │  │  Redis       │  │  S3 / Cloudflare R2  │
    │            │  │  (job queue) │  │                      │
    │ users      │  │  BullMQ      │  │ /uploads/            │
    │ creatives  │  │  queues:     │  │ /generated/          │
    │ templates  │  │  - render    │  │ /exports/            │
    │ brand_kits │  │  - ai-gen    │  │ /brand-assets/       │
    │ jobs       │  │  - video     │  │                      │
    │ exports    │  └──────────────┘  └──────────────────────┘
    └────────────┘
             │
    ┌────────▼───────────────────────────────────────────────┐
    │               Worker Process (BullMQ consumer)        │
    │                                                       │
    │  render-worker.ts   ai-worker.ts   video-worker.ts   │
    │                                                       │
    │  ← Replicate / fal.ai (Flux image gen)               │
    │  ← Claude API (copywriting)                          │
    │  ← Remove.bg / rembg (bg removal)                    │
    │  ← Puppeteer / Satori (HTML→img render)              │
    └───────────────────────────────────────────────────────┘
             │
    ┌────────▼──────────────────────┐
    │   Alli API (external)        │
    │                              │
    │  fetchDataSources()          │
    │  fetchFeedSample()           │
    │  getBrandProfile()           │
    │  getPerformanceData()        │
    └──────────────────────────────┘
```

### 3-Layer Creative Engine

| Layer | What it is | Build priority |
|---|---|---|
| **Layer 1: Creative Object Model** | Core entity — source, template binding, asset file, lineage, metadata | First. Foundational. |
| **Layer 2: Template + Variant System** | JSON scene graph, slot manifest, render strategy | Second. Unlocks all production flows. |
| **Layer 3: Workflow Layer** | Resize, edit, generate, batch, feed ingest — all call shared Layer 1+2 services | Third. Built incrementally per feature. |

---

## 3. Data Models & DB Schema

### `users`
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  clerk_id    TEXT UNIQUE,          -- Clerk external ID
  role        TEXT DEFAULT 'member', -- member | admin | template_author
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### `client_brand_kits`
```sql
CREATE TABLE client_brand_kits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug   TEXT NOT NULL,       -- matches Alli client slug
  logo_url      TEXT,                -- S3 path
  colors        JSONB DEFAULT '[]',  -- [{hex, label, role}]
  fonts         JSONB DEFAULT '[]',  -- [{family, url, weight}]
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX ON client_brand_kits(client_slug);
```

### `templates`
```sql
CREATE TABLE templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug   TEXT,               -- null = global template
  name          TEXT NOT NULL,
  thumbnail_url TEXT,
  scene         JSONB NOT NULL,     -- full scene graph (elements array)
  manifest      JSONB NOT NULL,     -- slot definitions + validation rules
  sizes         JSONB DEFAULT '[]', -- [{width, height, label, channel}]
  tags          TEXT[] DEFAULT '{}',
  status        TEXT DEFAULT 'draft', -- draft | published
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

**Scene graph shape (template.scene):**
```jsonc
{
  "width": 1080,
  "height": 1080,
  "background": "#ffffff",
  "elements": [
    {
      "id": "headline",
      "type": "text",
      "slot": "headline",          // named slot — maps to manifest
      "x": 40, "y": 80,
      "width": 1000, "height": 120,
      "defaultValue": "Your headline here",
      "style": { "fontFamily": "Inter", "fontSize": 48, "fontWeight": 700, "color": "#000000" }
    },
    {
      "id": "product-image",
      "type": "image",
      "slot": "product_image",
      "x": 0, "y": 200,
      "width": 1080, "height": 780,
      "objectFit": "cover"
    },
    {
      "id": "logo",
      "type": "image",
      "slot": "logo",
      "x": 40, "y": 20,
      "width": 200, "height": 50,
      "locked": true               // cannot be repositioned by user
    }
  ]
}
```

**Manifest shape (template.manifest):**
```jsonc
{
  "slots": [
    { "id": "headline",       "type": "text",  "label": "Headline",       "required": true,  "maxLength": 80 },
    { "id": "product_image",  "type": "image", "label": "Product Image",  "required": true  },
    { "id": "logo",           "type": "image", "label": "Brand Logo",     "required": false, "source": "brand_kit" }
  ]
}
```

### `creatives`
```sql
CREATE TABLE creatives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug     TEXT NOT NULL,
  source          TEXT NOT NULL,     -- 'template' | 'ai_gen' | 'upload' | 'feed_image' | 'resize'
  status          TEXT DEFAULT 'draft', -- draft | approved | rejected | archived
  template_id     UUID REFERENCES templates(id),
  variant_data    JSONB DEFAULT '{}', -- slot values: { headline: "...", product_image: "s3://..." }
  asset_url       TEXT,              -- S3 path to final rendered file
  asset_urls      JSONB DEFAULT '{}', -- { "1080x1080": "s3://...", "1080x1920": "s3://..." }
  parent_id       UUID REFERENCES creatives(id), -- lineage: resized from / iterated from
  feed_row        JSONB,             -- raw feed row if sourced from feed
  metadata        JSONB DEFAULT '{}', -- { width, height, format, fileSize, tags, campaign }
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON creatives(client_slug);
CREATE INDEX ON creatives(parent_id);
CREATE INDEX ON creatives(status);
```

### `render_jobs`
```sql
CREATE TABLE render_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug     TEXT NOT NULL,
  type            TEXT NOT NULL,     -- 'resize' | 'batch_variation' | 'ai_gen' | 'template_render'
  status          TEXT DEFAULT 'queued', -- queued | processing | complete | failed
  input           JSONB NOT NULL,    -- job-type-specific payload
  output_creative_ids UUID[],        -- creatives produced by this job
  error           TEXT,
  worker_id       TEXT,
  queued_at       TIMESTAMPTZ DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id)
);
CREATE INDEX ON render_jobs(status);
CREATE INDEX ON render_jobs(client_slug);
```

### `assets` (DAM)
```sql
CREATE TABLE assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug   TEXT NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,       -- S3 path
  thumbnail_url TEXT,
  type          TEXT NOT NULL,       -- 'image' | 'video' | 'font' | 'logo' | 'icon'
  mime_type     TEXT,
  width         INTEGER,
  height        INTEGER,
  file_size     INTEGER,
  tags          TEXT[] DEFAULT '{}',
  uploaded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON assets(client_slug, type);
```

---

## 4. Auth & Navigation Shell

### Auth
- **Provider:** Clerk (preferred) or Auth0
- Clerk handles SSO, session management, and JWT issuance
- All API routes validate `Authorization: Bearer <clerk_jwt>` via Clerk's `@clerk/nextjs` middleware
- User record is created in `users` table on first login via Clerk webhook (`user.created`)
- Client slug context is passed via URL param (`/adlabs/:clientSlug/`) and verified against user's allowed clients in Alli

### App Shell Layout
```
┌─────────────────────────────────────────────────────┐
│  Alli Nav (from AppLayout.tsx — shared with Alli)   │
│  ├── Left sidebar: Alli navigation icons            │
│  └── Top bar: client switcher, notifications, user  │
├─────────────────────────────────────────────────────┤
│  /adlabs/:clientSlug/         → AdLabs Dashboard    │
│  /adlabs/:clientSlug/resize   → Resize Image App    │
│  /adlabs/:clientSlug/batch    → Batch Variation     │
│  /adlabs/:clientSlug/builder  → Template Builder    │
│  /adlabs/:clientSlug/editor   → Canvas Editor       │
│  /adlabs/:clientSlug/brand    → Brand Kit           │
│  /adlabs/:clientSlug/assets   → Asset Manager       │
└─────────────────────────────────────────────────────┘
```

### AdLabs Dashboard (`/adlabs/:clientSlug/`)
Each app is a card showing: icon, name, description, format badges (JPEG/PNG/MP4), and a "Launch" CTA. Cards are static config for now — no DB query needed. When new apps are added, they're registered in `APP_META`.

---

## 5. Shared Services & API Conventions

### Response envelope
```jsonc
// Success
{ "data": { ... }, "meta": { "requestId": "..." } }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

### Pagination
```
GET /api/creatives?page=1&limit=24&clientSlug=peter-millar
→ { "data": [...], "meta": { "total": 120, "page": 1, "limit": 24 } }
```

### WebSocket / SSE for job status
Real-time output tile updates use Server-Sent Events (SSE) rather than polling:
```
GET /api/jobs/:jobId/stream  → text/event-stream
data: {"outputId":"out-123","status":"complete","imageUrl":"https://..."}
```
Frontend subscribes on job create, tears down on job complete or unmount.

### Feed API (Alli-proxied)
These already exist and are used by the Dynamic Template Builder:
```
fetchDataSources({ clientSlug }) → { feeds: [{ id, name, type }] }
fetchFeedSample({ clientSlug, feed }) → { sampleData: Row[], columns: Column[] }
```
All feed calls are proxied through the backend to inject Alli auth headers — never called directly from the browser.

---

## 6. Feature: Resize Image App

**Status: Built (prototype). Backend wiring is the next step.**

### UX Flow — Complete State Machine

```
[No feed connected]
  └── FeedConnectScreen
        ├── scanFeeds() → fetchDataSources → list verified feeds
        ├── [select feed with single image column] → onConnect()
        └── [select feed with multiple image columns] → ColumnPickerScreen → onConnect()
              ↓
[Feed connected — Browse stage]
  └── Creative gallery (filterable, sortable)
        ├── FilterSortBar: format (landscape/square/portrait), fileType, sort
        ├── [select creative] → ResizeConfigPanel slides in
        │     ├── Channel picker (Social, Programmatic, Print, Digital, Digital Signage)
        │     ├── Dimension checklist (per-channel, deduped)
        │     └── [Generate N sizes] → handleRun() → Results stage
        └── [Change feed] → FeedConnectScreen (jobs preserved)

[Results stage — multi-job]
  ├── Job tab strip (appears when jobs.length > 1)
  │     └── [click tab] → setActiveJobId → switch active job view
  ├── Results header
  │     ├── Status banner: generating spinner | green complete check
  │     ├── Source creative pill (click → source preview modal)
  │     └── [+ Add more sizes] → Browse stage in add mode (addingToJob = true)
  ├── GeneratedFilterBar: channel filter, sort (aspect ratio / A-Z / size desc/asc)
  ├── Generated tile grid
  │     ├── Pending tile: shimmer + spinner
  │     ├── Complete tile: image + View hover overlay + Download on hover
  │     │     └── [View] → SingleImageModal
  │     │           ├── Before/After split view (source left, output right)
  │     │           ├── ← → navigation between completed outputs
  │     │           ├── Re-crop input (prompt → onReiterate)
  │     │           └── Download dropdown (PNG / JPG / WebP)
  │     └── Error tile: "Generation failed" + Retry
  └── Bottom strip (when allComplete)
        ├── [+ Resize another creative] → Browse (same feed, new job)
        ├── [Change feed] → FeedConnectScreen (jobs preserved)
        └── [Download All] dropdown → batch download all completed outputs
```

### Frontend Component Tree
```
AdResizingAppRoot
├── FeedConnectScreen                 (stage: browse, no feed)
│   └── ColumnPickerScreen            (inline state)
├── Browse stage
│   ├── FilterSortBar
│   ├── CreativeTile[]
│   └── ResizeConfigPanel             (slides in on selection)
│       └── DimensionPreview
└── Results stage
    ├── JobTabStrip                   (jobs.length > 1)
    ├── ResultsHeader
    │   └── SourceCreativePreviewModal
    ├── GeneratedFilterBar
    ├── GeneratedTile[]
    │   └── DownloadDropdown
    └── SingleImageModal
        └── DownloadDropdown
```

### State (AppRoot)
```typescript
// Multi-job model
jobs: GenerationJob[]          // all batches this session
activeJobId: string | null     // which job is in view
addingToJob: boolean           // true when "+ Add more sizes" was clicked

// Browse
stage: 'browse' | 'results'
feedCreatives: MockCreative[] | null
connectedFeedLabel: string | null
selectedCreative: MockCreative | null
selectedChannels: string[]
selectedDimensions: Set<string>

// Filters
filterFormat: 'all' | 'landscape' | 'square' | 'portrait'
filterFileType: 'all' | 'JPG' | 'PNG' | 'WEBP'
sortBy: 'newest' | 'oldest' | 'az' | 'za'
genFilterChannel: string
genSort: 'default' | 'label-az' | 'size-desc' | 'size-asc'
```

### Key Business Logic
- **shouldAppend:** `addingToJob && activeJobId && selectedCreative.id === activeJob.sourceCreative.id` — only append when in add mode AND same source creative. Different creative always creates a new job.
- **simulateOutputCompletion:** In prototype, uses `picsum.photos` with seeded URLs. In production, replace with SSE stream from `/api/jobs/:jobId/stream` that emits `{outputId, status, imageUrl}` events.
- **Feed display name:** `formatFeedName(rawName)` utility — parser strips `_raw`, `_v2`, `_staging`, `_historical`; title-cases remaining tokens; supports manual override map.

### Backend API (to wire in)

```
POST /api/resize-jobs
Body: {
  clientSlug: string,
  sourceCreativeId: string,      // or sourceImageUrl for feed images
  sourceImageUrl: string,
  dimensions: Array<{
    id: string,
    width: number,
    height: number,
    label: string,
    channelLabel: string
  }>
}
→ { jobId, outputs: [{ outputId, dimensionId, status: 'queued' }] }

GET /api/jobs/:jobId/stream      → SSE stream of output status events
GET /api/jobs/:jobId             → full job record with all output statuses
POST /api/outputs/:outputId/retry → requeue single output
```

### Worker: resize-worker.ts
```typescript
// Pseudocode — real implementation uses Flux.1 Kontext or similar
async function processResizeOutput(output: ResizeOutput) {
  const { sourceImageUrl, targetWidth, targetHeight } = output;

  // Option A: Smart crop via AI (Flux.1 Kontext, prompt-guided)
  const result = await replicate.run("black-forest-labs/flux-kontext", {
    image: sourceImageUrl,
    prompt: `Resize and recompose this image to ${targetWidth}x${targetHeight}. 
             Maintain subject focus. Expand background if needed. Keep logo/text at fixed size.`,
    width: targetWidth,
    height: targetHeight
  });

  // Option B: Rule-based crop (fallback, no AI cost)
  // - Compute crop box centered on detected subject (face/product detection)
  // - Pad/extend background if aspect ratio changes significantly
  // - Apply logo as overlay at fixed position

  await uploadToS3(result, `generated/${output.jobId}/${output.outputId}.png`);
  await db.renderJobs.updateOutput(output.outputId, { status: 'complete', assetUrl });
  await sse.emit(output.jobId, { outputId: output.outputId, status: 'complete', imageUrl: cdnUrl });
}
```

---

## 7. Feature: Template Builder

### Purpose
Media team picks a saved JSON template, fills slot values (headline, product image, CTA), and renders to a final ad image. No engineering needed per template instance.

### UX Flow

```
[Template Gallery]
  ├── Filter: client templates | global templates | by size | by channel
  ├── TemplateCard: thumbnail + name + size badges + slot count
  └── [Select template] → SlotFillEditor

[SlotFillEditor]
  ├── Left: Canvas Preview (live-updating Fabric.js or static preview image)
  ├── Right: Slot Panel
  │     ├── Text slots → textarea with character counter
  │     ├── Image slots → AssetPickerDropzone (upload or pick from DAM/feed)
  │     └── Brand Kit slots (logo, colors) → auto-filled, override allowed
  ├── [Generate Size] selector → pick target sizes (or all)
  └── [Render] → POST /api/render-jobs → Results view (same as Resize)
```

### Frontend Components
```
TemplateGalleryPage
├── TemplateFilterBar
├── TemplateCard[]
└── EmptyState (no templates for client)

SlotFillEditorPage
├── CanvasPreview            (Fabric.js read-only preview OR static img)
├── SlotPanel
│   ├── TextSlotField[]
│   ├── ImageSlotField[]     → AssetPicker modal
│   └── BrandKitSlotField[]  → auto-filled from brand kit
├── SizeSelector
└── RenderButton → loading state → results
```

### API
```
GET  /api/templates?clientSlug=&status=published
GET  /api/templates/:id
POST /api/render-jobs
Body: {
  type: 'template_render',
  templateId: string,
  variantData: Record<string, string>,  // slotId → value (text or S3 url)
  sizes: Array<{ width, height, label, channel }>,
  clientSlug: string
}
→ { jobId, outputs: [...] }
```

### Live Preview Architecture
Two approaches — choose based on template complexity:

**Option A (simple): Server-side preview image**
On slot change, debounce 500ms → `POST /api/templates/:id/preview` with `variantData` → returns PNG → display as `<img>`. Slow but zero client-side render complexity.

**Option B (fast): Client-side Fabric.js canvas**
Load template scene graph into Fabric.js canvas on mount. On slot change, update the corresponding `fabric.Object` directly. No network round-trip. Preferred when template element count is low (<20 elements).

---

## 8. Feature: Batch Variation Engine

### Purpose
1 template × N slot values = render all combinations automatically. The core value prop: 5 headlines × 3 CTAs × 4 product images = 60 variants in one click.

### UX Flow

```
[Select Template] (same gallery as Template Builder)
  ↓
[Variation Table]
  ├── Column per variation slot (Headline, CTA, Product Image, Background)
  ├── Row per combination source:
  │     ├── Manual input: type values into cells
  │     ├── Feed import: map feed columns → slots
  │     └── AI generate: Claude generates N alternatives per slot
  ├── Combination counter: "5 × 3 × 4 = 60 variants"
  ├── Exclusion rules panel: "Headline A never pairs with Image B"
  ├── Hypothesis field per slot: "Testing: urgency vs. value framing"
  └── [Generate All] → Progress view

[Progress View — batch generation]
  ├── Overall: "Rendering 60 variants — 23 complete"
  ├── Progress bar
  ├── Tile grid: same GeneratedTile component, streams in as complete
  ├── Group toggle: flat grid | grouped by template slot value
  └── [Download All] | [Download Selected] | [Approve Selected]
```

### Frontend State (Zustand slice)
```typescript
interface BatchVariationStore {
  templateId: string | null;
  slots: SlotDefinition[];             // from template manifest
  variations: Record<string, string[]>; // slotId → [value1, value2, ...]
  exclusionRules: ExclusionRule[];
  hypotheses: Record<string, string>;  // slotId → hypothesis text
  combinations: Combination[];         // computed: cartesian product minus exclusions
  jobId: string | null;
  outputs: GeneratedOutput[];
}
```

### Combination Computation (frontend, no API call)
```typescript
function computeCombinations(
  variations: Record<string, string[]>,
  exclusionRules: ExclusionRule[]
): Combination[] {
  const slotIds = Object.keys(variations);
  const cartesian = slotIds.reduce((acc, slotId) => {
    return acc.flatMap(combo =>
      variations[slotId].map(value => ({ ...combo, [slotId]: value }))
    );
  }, [{}] as Record<string, string>[]);

  return cartesian.filter(combo =>
    !exclusionRules.some(rule => rule.matches(combo))
  );
}
```

### API
```
POST /api/batch-jobs
Body: {
  type: 'batch_variation',
  templateId: string,
  variations: Record<string, string[]>,
  exclusionRules: ExclusionRule[],
  sizes: SizeSpec[],
  clientSlug: string,
  hypotheses?: Record<string, string>   // stored with job for later analysis
}
→ { jobId, totalOutputs: 60, outputs: [{ outputId, slotValues, status }] }

GET /api/jobs/:jobId/stream   → SSE (same as resize)
POST /api/outputs/:outputId/approve
POST /api/outputs/:outputId/reject
```

---

## 9. Feature: Canvas Editor

### Purpose
After template rendering, users can fine-tune a specific variant in a Fabric.js canvas — move elements, adjust text, swap images, recolor — and save as a new creative version.

### UX Flow

```
[Open in Editor] (from any output tile, GeneratedTile or results modal)
  ↓
[Canvas Editor]
  ├── Top bar: Undo/Redo | Save | Export | Back
  ├── Left panel: Layers list (element tree from scene graph)
  ├── Canvas (center): Fabric.js
  │     ├── Select: click to select element, shows handles
  │     ├── Text: double-click to edit inline
  │     ├── Image: click to select, drag to reposition
  │     └── Transform: scale, rotate via handles
  ├── Right panel (Properties, contextual):
  │     ├── Text selected: font family, size, weight, color, alignment
  │     ├── Image selected: object-fit, replace image button, opacity
  │     └── Background selected: color picker, image upload, gradient
  └── Bottom bar: canvas zoom slider, size indicator

[Save] → POST /api/creatives → new creative with parent_id = source
[Export] → POST /api/exports → render job → download PNG/JPG/WebP
```

### Fabric.js Integration

**Canvas initialization from template scene:**
```typescript
async function loadSceneIntoCanvas(canvas: fabric.Canvas, scene: SceneGraph) {
  canvas.setWidth(scene.width);
  canvas.setHeight(scene.height);
  canvas.setBackgroundColor(scene.background, canvas.renderAll.bind(canvas));

  for (const el of scene.elements) {
    if (el.type === 'text') {
      const textObj = new fabric.Textbox(el.defaultValue, {
        left: el.x, top: el.y, width: el.width, height: el.height,
        fontSize: el.style.fontSize,
        fontFamily: el.style.fontFamily,
        fontWeight: el.style.fontWeight,
        fill: el.style.color,
        lockScalingX: el.locked, lockScalingY: el.locked,
        lockMovementX: el.locked, lockMovementY: el.locked,
        data: { slotId: el.slot }
      });
      canvas.add(textObj);
    }
    if (el.type === 'image') {
      const img = await fabric.Image.fromURL(el.imageUrl ?? '');
      img.set({ left: el.x, top: el.y, width: el.width, height: el.height });
      img.scaleToWidth(el.width);
      canvas.add(img);
    }
  }
  canvas.renderAll();
}
```

**Serialize back to scene graph for save:**
```typescript
function serializeCanvasToScene(canvas: fabric.Canvas): SceneGraph {
  return {
    width: canvas.getWidth(),
    height: canvas.getHeight(),
    background: canvas.backgroundColor as string,
    elements: canvas.getObjects().map(obj => ({
      id: obj.data?.id,
      slot: obj.data?.slotId,
      type: obj instanceof fabric.Textbox ? 'text' : 'image',
      x: obj.left!, y: obj.top!,
      width: obj.getScaledWidth(), height: obj.getScaledHeight(),
      ...(obj instanceof fabric.Textbox ? {
        value: obj.text,
        style: { fontSize: obj.fontSize, fontFamily: obj.fontFamily, color: obj.fill }
      } : {})
    }))
  };
}
```

### API
```
GET  /api/creatives/:id           → load creative + scene data
POST /api/creatives               → save new version (parent_id = source creative)
POST /api/exports
Body: { creativeId, format: 'png' | 'jpg' | 'webp', quality?: number }
→ { exportUrl }   (pre-signed S3 download URL, 1hr TTL)
```

---

## 10. Feature: Brand Kit

### Purpose
Per-client storage of logos, colors, and fonts. Auto-fills logo and color slots when rendering templates. Fallback to global defaults if client kit is empty.

### UX Flow

```
[Brand Kit Page — /adlabs/:clientSlug/brand]
  ├── Colors section
  │     ├── Color swatch grid (primary, secondary, accent, background)
  │     ├── [+ Add color] → color picker modal → label + hex
  │     └── [Edit] → inline hex input
  ├── Logos section
  │     ├── Logo grid: primary logo, white version, dark version, icon
  │     ├── [Upload logo] → AssetUploader → S3 upload → thumbnail
  │     └── [Replace] on each logo card
  ├── Fonts section
  │     ├── Font cards: family name + preview text ("The quick brown fox")
  │     ├── [Add font] → upload .woff2 → S3 → register in brand kit
  │     └── [Remove] per font
  └── [Save] → PUT /api/brand-kits/:clientSlug
```

### API
```
GET  /api/brand-kits/:clientSlug
PUT  /api/brand-kits/:clientSlug
Body: { colors: ColorEntry[], logoUrls: LogoMap, fonts: FontEntry[] }

POST /api/brand-kits/:clientSlug/logo
Body: FormData (file)
→ { url: "s3://..." }
```

### How Brand Kit plugs into renders
When the render worker processes a job, it fetches the client brand kit and injects:
- `logo` slot → `brand_kit.logoUrls.primary`
- Any slot with `source: "brand_kit"` in the manifest → auto-filled
- Font family names in template elements → resolved to S3 font URLs for Puppeteer/Satori font loading

---

## 11. Feature: Asset Manager (DAM)

### Purpose
Searchable library of all client assets (images, logos, fonts, brand materials). Referenced by name/tag from template slots and batch variation.

### UX Flow

```
[Asset Manager — /adlabs/:clientSlug/assets]
  ├── Search bar (by name, tag)
  ├── Filter tabs: All | Images | Logos | Fonts | Videos
  ├── Asset grid
  │     ├── AssetCard: thumbnail + name + dimensions + file size
  │     ├── [Select] → AssetDetailPanel slides in (right)
  │     │     ├── Full preview
  │     │     ├── Metadata: uploaded by, date, dimensions, S3 path
  │     │     ├── Tags: editable
  │     │     ├── [Copy URL] → copies CDN URL
  │     │     └── [Delete] → soft-delete (sets archived = true)
  │     └── [+ Upload] button (top right)
  └── [+ Upload Assets]
        ├── Dropzone (drag-and-drop or file picker)
        ├── Multi-file: queue with progress per file
        ├── On complete: add tag(s), confirm → saves to `assets` table
        └── Accepts: JPG, PNG, WebP, SVG, GIF, MP4, woff2
```

### Upload Flow (frontend → S3)
```
1. User drops file
2. POST /api/assets/upload-url → { presignedUrl, assetId }  (server generates S3 presigned PUT)
3. Browser PUT directly to presignedUrl (bypasses server, no file goes through Next.js)
4. POST /api/assets/confirm { assetId } → server records final URL in `assets` table
```
This pattern keeps large file traffic off the Next.js process.

### API
```
POST /api/assets/upload-url   → { presignedUrl, assetId }
POST /api/assets/confirm      → asset record
GET  /api/assets?clientSlug=&type=&q=&page=
DELETE /api/assets/:id        → soft-delete (archived = true)
PATCH /api/assets/:id         → update tags, name
```

---

## 12. Feature: AI Generation

### 12a. Text-to-Image Generation

**UX:**
```
[AI Generate panel — accessible from Canvas Editor sidebar or as standalone]
  ├── Prompt textarea: "A luxury product shot of a leather belt on marble, soft lighting"
  ├── Style presets: Photorealistic | Illustration | Minimalist | Abstract
  ├── Dimensions: pull from active template size or custom input
  ├── [Generate] → streaming preview → accept | regenerate | cancel
  └── [Accept] → inserts into active image slot OR saves as new asset
```

**API:**
```
POST /api/ai/generate-image
Body: { prompt, style, width, height, clientSlug }
→ SSE stream: { status: 'processing' | 'complete', imageUrl?, progress? }

// Worker calls Replicate (Flux Schnell):
const output = await replicate.run("black-forest-labs/flux-schnell", {
  prompt,
  width,
  height,
  num_outputs: 1,
  output_format: "webp"
});
```

### 12b. AI Copywriting

**UX:**
```
[Headline / CTA generator — text slot in SlotFillEditor or BatchVariationTable]
  ├── Context input: "Peter Millar belt, luxury menswear, holiday gift campaign"
  ├── Tone: Professional | Urgent | Playful | Minimal
  ├── Count: 1 | 3 | 5 alternatives
  ├── [Generate] → streams suggestions
  └── [Use this] per suggestion → fills the text slot
```

**API:**
```
POST /api/ai/generate-copy
Body: { context, tone, count, slotType: 'headline' | 'cta' | 'body', clientSlug }
→ { suggestions: string[] }

// Backend uses Claude API:
const response = await anthropic.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 512,
  messages: [{
    role: "user",
    content: `Generate ${count} ad ${slotType}s for: ${context}. Tone: ${tone}. 
              Return as JSON array of strings. Max 80 chars each.`
  }]
});
```

### 12c. Background Removal

**UX:**
```
[Background Removal — image slot context menu or standalone tool]
  ├── Source: any image slot or uploaded image
  ├── [Remove Background] → processing indicator → preview with checkerboard
  ├── Refine edges: slider (0–100)
  └── [Apply] → saves transparent PNG to asset library, fills slot
```

**API:**
```
POST /api/ai/remove-background
Body: { imageUrl, clientSlug }
→ { resultUrl }   (transparent PNG in S3)

// Backend: Remove.bg API or self-hosted rembg
// rembg (self-hosted, preferred for cost): process with Python worker
// Remove.bg (hosted, simpler): POST to api.remove.bg
```

---

## 13. Render Pipeline & Job Queue

### Queue Architecture (BullMQ on Redis)

Three named queues — all share the same Redis instance:

```
redis:
  bull:resize-queue      → resize-worker.ts
  bull:render-queue      → render-worker.ts  (template/batch renders)
  bull:ai-gen-queue      → ai-worker.ts      (image gen, bg removal)
```

### Job payload shapes

**Resize job:**
```typescript
interface ResizeJobPayload {
  jobId: string;
  outputId: string;
  sourceImageUrl: string;
  targetWidth: number;
  targetHeight: number;
  clientSlug: string;
  seed?: string;           // for retry determinism
}
```

**Template render job:**
```typescript
interface RenderJobPayload {
  jobId: string;
  outputId: string;
  templateId: string;
  variantData: Record<string, string>;
  targetWidth: number;
  targetHeight: number;
  fonts: FontSpec[];       // resolved from brand kit
  clientSlug: string;
}
```

**Batch variation job:**
```typescript
interface BatchJobPayload {
  jobId: string;
  outputs: Array<{
    outputId: string;
    slotValues: Record<string, string>;
    targetWidth: number;
    targetHeight: number;
  }>;
  templateId: string;
  clientSlug: string;
}
```

### Worker pattern (all workers share this structure)

```typescript
// workers/resize-worker.ts
const resizeQueue = new Queue('resize-queue', { connection: redis });
const resizeWorker = new Worker('resize-queue', async (job: Job<ResizeJobPayload>) => {
  const { outputId, sourceImageUrl, targetWidth, targetHeight } = job.data;

  await db.updateOutputStatus(outputId, 'processing');
  await sseManager.emit(job.data.jobId, { outputId, status: 'processing' });

  try {
    const resultUrl = await callReplicateResize(sourceImageUrl, targetWidth, targetHeight);
    const s3Url = await uploadToS3(resultUrl, `generated/${job.data.jobId}/${outputId}.webp`);

    await db.updateOutputStatus(outputId, 'complete', { assetUrl: s3Url });
    await sseManager.emit(job.data.jobId, { outputId, status: 'complete', imageUrl: cdnUrl(s3Url) });
  } catch (err) {
    await db.updateOutputStatus(outputId, 'failed', { error: err.message });
    await sseManager.emit(job.data.jobId, { outputId, status: 'failed' });
  }
}, { connection: redis, concurrency: 5 });
```

### SSE Manager (server-side)

```typescript
// lib/sse-manager.ts
class SSEManager {
  private clients = new Map<string, Set<ServerResponse>>();

  subscribe(jobId: string, res: ServerResponse) {
    if (!this.clients.has(jobId)) this.clients.set(jobId, new Set());
    this.clients.get(jobId)!.add(res);
    res.on('close', () => this.clients.get(jobId)?.delete(res));
  }

  emit(jobId: string, data: object) {
    const clients = this.clients.get(jobId);
    if (!clients) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(res => res.write(payload));
  }
}
export const sseManager = new SSEManager();
```

### Render strategy: Puppeteer vs. Satori

| | Puppeteer | Satori |
|---|---|---|
| **Input** | Full HTML/CSS | JSX/React component tree |
| **Output** | PNG (screenshot) | SVG → PNG |
| **Fonts** | Loads any CSS font | Must pre-load font buffers |
| **Complex layouts** | Full CSS support | Limited CSS subset |
| **Speed** | ~1–2s per render | ~100–200ms per render |
| **Best for** | Template renders with rich CSS | Simple ad formats, batch at scale |

**Decision:** Use Satori for template renders where speed matters (batch generation). Fall back to Puppeteer for complex templates with advanced CSS. Both write to S3.

---

## 14. Feed Integration Layer

### Current flow (Resize Image app, implemented)

```
fetchDataSources({ clientSlug })
  → raw API response: [{ id, name: "client_feed_historical", type: "csv" }]
  → formatFeedName(name)  ← NEEDS IMPLEMENTING
  → display in FeedConnectScreen

fetchFeedSample({ clientSlug, feed })
  → { sampleData: Row[] }
  → detectImageColumns(sampleData)  ← exists, detects URL columns
  → feedToCreatives(sampleData, feedName, imageColumn)
  → MockCreative[]  → gallery
```

### `formatFeedName` — needs building

```typescript
// utils/formatFeedName.ts

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "client_feed_historical": "Historical Client Feed",
  "product_feed_v2_staging": "Product Feed",
  // Add more as discovered
};

const STRIP_SUFFIXES = ["_raw", "_v2", "_v3", "_staging", "_prod", "_historical", "_new"];

export function formatFeedName(systemName: string): string {
  // 1. Check override map first
  if (DISPLAY_NAME_OVERRIDES[systemName]) {
    return DISPLAY_NAME_OVERRIDES[systemName];
  }

  // 2. Strip known trailing qualifiers
  let name = systemName;
  for (const suffix of STRIP_SUFFIXES) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }

  // 3. Title-case remaining tokens
  return name
    .split("_")
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

// Usage: apply at fetch boundary, not at render time
// In FeedConnectScreen, after fetchDataSources():
const formattedFeeds = result.feeds.map(f => ({ ...f, displayName: formatFeedName(f.name) }));
```

**Open question before implementing:** Does `fetchDataSources` return a `label` or `display_name` field? If yes, use that directly and use `formatFeedName` only as a fallback.

### Feed → Creative mapping (`feedToCreatives`)

Already exists. Each feed row becomes a `MockCreative`:
```typescript
{
  id: `${feedName}-${rowIndex}`,
  name: row.name ?? row.product_name ?? row.title ?? `${feedName} #${rowIndex}`,
  thumbnailUrl: row[imageColumn],
  width: 0,  // unknown until image loads — resolve via Image element onLoad
  height: 0,
  fileType: detectFileType(row[imageColumn]),
  uploadedAt: row.created_at ?? row.updated_at ?? new Date().toISOString()
}
```

**Width/height resolution:** Feed rows don't have image dimensions. Options:
1. Resolve client-side via `new Image()` on thumbnail load (current approach — dimensions show as 0 until load)
2. Server-side: proxy image headers to extract dimensions before returning to client
3. Accept that dimensions are unknown for feed images and show "N/A" instead of 0×0

---

## 15. Platform Sizes & Output Spec

Required at launch — `sizes` array on every batch job:

| Size | Dimensions | Channel | Priority |
|---|---|---|---|
| Meta Feed Square | 1080×1080 | Social | 1 |
| Meta Stories/Reels | 1080×1920 | Social | 2 |
| Meta Link Ad | 1200×628 | Social | 3 |
| Pinterest Standard | 1000×1500 | Social | 4 |
| Display Banner | 300×250 | Programmatic | 5 |
| Leaderboard | 728×90 | Programmatic | 6 |
| Half Page | 300×600 | Programmatic | 7 |
| Digital Billboard | 1920×1080 | Digital Signage | 8 |

Channel data lives in `src/apps/ad-resizing/data/channels.ts` — the same config drives the ResizeConfigPanel UI and the render worker's output size array. Single source of truth.

---

## 16. Build Sequence & Phase Gates

### Phase 0 — Foundation (do before any other feature)
- [ ] DB schema (PostgreSQL): users, templates, creatives, render_jobs, assets, brand_kits
- [ ] S3 bucket setup: /uploads, /generated, /exports, /brand-assets
- [ ] Redis + BullMQ worker infra (even if workers are stubs)
- [ ] Auth: Clerk integration, JWT validation middleware on all API routes
- [ ] SSE endpoint: `/api/jobs/:jobId/stream`
- [ ] `formatFeedName` utility + apply to FeedConnectScreen

### Phase 1 — Resize Image (production wiring)
- [ ] Replace `simulateOutputCompletion` with real `POST /api/resize-jobs` + SSE stream
- [ ] `resize-worker.ts`: integrate Flux.1 Kontext via Replicate
- [ ] Creative record saved per output (with `parent_id` = source creative, `source = 'resize'`)
- [ ] Download generates real file from S3 (not placeholder URL)
- [ ] Feed image dimensions resolved properly (server-side header probe or client onLoad)

### Phase 2 — Template Builder
- [ ] Template JSON schema finalized
- [ ] 15–20 real client templates authored in JSON (sprint-0 content task — assign template author)
- [ ] Template gallery page + filtering
- [ ] SlotFillEditor: client-side Fabric.js preview + slot panel
- [ ] `render-worker.ts`: Satori render → S3 → creative record

### Phase 3 — Batch Variation Engine
- [ ] Variation table UI (slot columns × value rows)
- [ ] Combination computation (frontend, cartesian product + exclusion rules)
- [ ] Hypothesis tagging fields (stored on job record)
- [ ] Batch render job: single API call, multiple render-worker tasks
- [ ] Variation results grid: group by slot value toggle

### Phase 4 — Canvas Editor
- [ ] Fabric.js canvas integration
- [ ] Scene graph serialization / deserialization
- [ ] Properties panel (text, image, background)
- [ ] Undo/redo stack
- [ ] Save → new creative with parent lineage
- [ ] Export → render worker → download

### Phase 5 — Brand Kit + DAM
- [ ] Brand kit CRUD + UI
- [ ] Brand kit auto-fill in render workers (logo, color injection)
- [ ] DAM upload flow (presigned S3 PUT)
- [ ] Asset search + tag editor
- [ ] AssetPicker modal (used by SlotFillEditor + BatchVariationTable)

### Phase 6 — AI Features
- [ ] Background removal (rembg worker or Remove.bg API)
- [ ] AI copywriting (Claude API, streaming suggestions)
- [ ] Text-to-image (Replicate Flux Schnell)
- [ ] AI suggestions wired into BatchVariationTable (auto-generate slot value alternatives)

### Phase 7 — Performance Loop (post-launch)
- [ ] Creative IDs structured: `{clientSlug}-{templateId}-{slotHash}` (maps to platform naming)
- [ ] Status field on creative: draft | approved | rejected
- [ ] Approval workflow UI (approve/reject buttons on output tiles)
- [ ] Wire Alli performance data (CTR, conversions) back to creative records
- [ ] "Top performers" badge on batch results grid

---

---

## 17. Backend Implementation Reference

This section is written for backend engineers. It covers: project structure, Prisma schema, every API route with typed request/response, error handling conventions, environment config, and worker implementations.

### 17a. Project Structure

```
creative-alli-studio/
├── app/                          # Next.js 14 App Router
│   ├── api/
│   │   ├── auth/route.ts         # Clerk webhook handler (user.created)
│   │   ├── brand-kits/
│   │   │   └── [clientSlug]/route.ts
│   │   ├── assets/
│   │   │   ├── route.ts          # GET list, POST upload-url
│   │   │   ├── confirm/route.ts  # POST confirm after S3 upload
│   │   │   └── [id]/route.ts     # PATCH, DELETE
│   │   ├── templates/
│   │   │   ├── route.ts          # GET list, POST create
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET, PUT, DELETE
│   │   │       └── preview/route.ts  # POST generate preview PNG
│   │   ├── creatives/
│   │   │   ├── route.ts          # GET list, POST create
│   │   │   └── [id]/route.ts     # GET, PATCH
│   │   ├── jobs/
│   │   │   ├── resize/route.ts   # POST enqueue resize job
│   │   │   ├── render/route.ts   # POST enqueue template render
│   │   │   ├── batch/route.ts    # POST enqueue batch variation
│   │   │   └── [jobId]/
│   │   │       ├── route.ts      # GET job status
│   │   │       └── stream/route.ts  # GET SSE stream
│   │   ├── outputs/
│   │   │   └── [outputId]/
│   │   │       ├── retry/route.ts
│   │   │       └── approve/route.ts
│   │   └── ai/
│   │       ├── generate-image/route.ts
│   │       ├── generate-copy/route.ts
│   │       └── remove-background/route.ts
│   └── adlabs/[clientSlug]/      # Frontend pages (Next.js)
│
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   ├── redis.ts                  # ioredis singleton
│   ├── queues.ts                 # BullMQ queue instances
│   ├── s3.ts                     # S3/R2 client + helpers
│   ├── sse-manager.ts            # SSE connection manager
│   ├── auth.ts                   # Clerk server auth helper
│   └── alli-api.ts               # Alli API proxy functions
│
├── workers/
│   ├── index.ts                  # Starts all workers
│   ├── resize-worker.ts
│   ├── render-worker.ts
│   ├── ai-worker.ts
│   └── video-worker.ts
│
├── prisma/
│   └── schema.prisma
│
└── middleware.ts                 # Clerk auth middleware (protects /api/*)
```

### 17b. Prisma Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  clerkId   String   @unique @map("clerk_id")
  role      String   @default("member")
  createdAt DateTime @default(now()) @map("created_at")

  creatives   Creative[]
  renderJobs  RenderJob[]
  assets      Asset[]
}

model ClientBrandKit {
  id          String   @id @default(uuid())
  clientSlug  String   @unique @map("client_slug")
  logoUrl     String?  @map("logo_url")
  colors      Json     @default("[]")
  fonts       Json     @default("[]")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
}

model Template {
  id           String   @id @default(uuid())
  clientSlug   String?  @map("client_slug")  // null = global
  name         String
  thumbnailUrl String?  @map("thumbnail_url")
  scene        Json                           // SceneGraph
  manifest     Json                           // SlotManifest
  sizes        Json     @default("[]")        // SizeSpec[]
  tags         String[] @default([])
  status       String   @default("draft")     // draft | published
  createdBy    String?  @map("created_by")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  creatives    Creative[]
}

model Creative {
  id          String   @id @default(uuid())
  clientSlug  String   @map("client_slug")
  source      String                          // template | ai_gen | upload | feed_image | resize
  status      String   @default("draft")      // draft | approved | rejected | archived
  templateId  String?  @map("template_id")
  variantData Json     @default("{}")         // slot values
  assetUrl    String?  @map("asset_url")      // primary rendered file (S3)
  assetUrls   Json     @default("{}")         // { "1080x1080": "s3://..." }
  parentId    String?  @map("parent_id")
  feedRow     Json?    @map("feed_row")
  metadata    Json     @default("{}")
  createdBy   String?  @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  template    Template?   @relation(fields: [templateId], references: [id])
  creator     User?       @relation(fields: [createdBy], references: [id])
  parent      Creative?   @relation("Lineage", fields: [parentId], references: [id])
  children    Creative[]  @relation("Lineage")
  outputs     RenderOutput[]

  @@index([clientSlug])
  @@index([parentId])
  @@index([status])
}

model RenderJob {
  id          String   @id @default(uuid())
  clientSlug  String   @map("client_slug")
  type        String                          // resize | template_render | batch_variation | ai_gen
  status      String   @default("queued")     // queued | processing | complete | failed | cancelled
  input       Json
  error       String?
  workerId    String?  @map("worker_id")
  queuedAt    DateTime @default(now()) @map("queued_at")
  startedAt   DateTime? @map("started_at")
  completedAt DateTime? @map("completed_at")
  createdBy   String?  @map("created_by")

  creator     User?    @relation(fields: [createdBy], references: [id])
  outputs     RenderOutput[]

  @@index([status])
  @@index([clientSlug])
}

model RenderOutput {
  id          String   @id @default(uuid())
  jobId       String   @map("job_id")
  creativeId  String?  @map("creative_id")   // set when output is saved as a Creative
  status      String   @default("queued")     // queued | processing | complete | failed
  dimension   Json                            // { width, height, label, channelLabel }
  assetUrl    String?  @map("asset_url")
  error       String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  job         RenderJob  @relation(fields: [jobId], references: [id])
  creative    Creative?  @relation(fields: [creativeId], references: [id])

  @@index([jobId])
  @@index([status])
}

model Asset {
  id           String   @id @default(uuid())
  clientSlug   String   @map("client_slug")
  name         String
  url          String
  thumbnailUrl String?  @map("thumbnail_url")
  type         String                          // image | video | font | logo | icon
  mimeType     String?  @map("mime_type")
  width        Int?
  height       Int?
  fileSize     Int?     @map("file_size")
  tags         String[] @default([])
  archived     Boolean  @default(false)
  uploadedBy   String?  @map("uploaded_by")
  createdAt    DateTime @default(now()) @map("created_at")

  uploader     User?    @relation(fields: [uploadedBy], references: [id])

  @@index([clientSlug, type])
}
```

### 17c. Environment Variables

```bash
# .env.local

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/creative_studio"

# Redis (BullMQ + SSE)
REDIS_URL="redis://localhost:6379"

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# Storage (prefer R2 — no egress fees)
CLOUDFLARE_R2_ACCOUNT_ID=""
CLOUDFLARE_R2_ACCESS_KEY_ID=""
CLOUDFLARE_R2_SECRET_ACCESS_KEY=""
CLOUDFLARE_R2_BUCKET="creative-studio"
CLOUDFLARE_R2_PUBLIC_URL="https://assets.alli.io"  # CDN fronting the bucket

# AWS S3 fallback
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION="us-east-1"
AWS_S3_BUCKET="alli-creative-studio"
AWS_CLOUDFRONT_URL="https://d123.cloudfront.net"

# AI APIs
REPLICATE_API_TOKEN=""
ANTHROPIC_API_KEY=""
REMOVE_BG_API_KEY=""          # optional — use rembg worker instead

# Alli API
ALLI_API_BASE_URL="https://api.alli.io"
ALLI_API_KEY=""               # service account key for proxied feed calls

# Render
PUPPETEER_EXECUTABLE_PATH=""  # leave empty for local, set for prod (chromium path)

# Feature flags
ENABLE_VIDEO_WORKERS="false"
MAX_BATCH_SIZE="200"
```

### 17d. Auth Middleware

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
```

```typescript
// lib/auth.ts — helper for API routes
import { auth } from "@clerk/nextjs/server";
import { db } from "./db";

export async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("UNAUTHORIZED");
  return db.user.findUniqueOrThrow({ where: { clerkId } });
}
```

### 17e. API Route Implementations

#### `POST /api/jobs/resize`

```typescript
// app/api/jobs/resize/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resizeQueue } from "@/lib/queues";

const ResizeJobSchema = z.object({
  clientSlug: z.string(),
  sourceImageUrl: z.string().url(),
  sourceCreativeId: z.string().uuid().optional(),
  dimensions: z.array(z.object({
    id: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    label: z.string(),
    channelLabel: z.string(),
  })).min(1).max(50),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = ResizeJobSchema.parse(await req.json());

    // Create job record
    const job = await db.renderJob.create({
      data: {
        clientSlug: body.clientSlug,
        type: "resize",
        status: "queued",
        input: body,
        createdBy: user.id,
        outputs: {
          create: body.dimensions.map(dim => ({
            status: "queued",
            dimension: dim,
          })),
        },
      },
      include: { outputs: true },
    });

    // Enqueue one BullMQ task per output
    await Promise.all(
      job.outputs.map((output, i) =>
        resizeQueue.add(
          "resize",
          {
            jobId: job.id,
            outputId: output.id,
            sourceImageUrl: body.sourceImageUrl,
            targetWidth: (output.dimension as any).width,
            targetHeight: (output.dimension as any).height,
          },
          { delay: i * 200 }  // stagger slightly to avoid API rate limits
        )
      )
    );

    return NextResponse.json({
      data: {
        jobId: job.id,
        outputs: job.outputs.map(o => ({
          outputId: o.id,
          dimensionId: (o.dimension as any).id,
          status: o.status,
        })),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: err.errors } }, { status: 400 });
    }
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    console.error("[POST /api/jobs/resize]", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
```

#### `GET /api/jobs/[jobId]/stream` (SSE)

```typescript
// app/api/jobs/[jobId]/stream/route.ts
import { NextRequest } from "next/server";
import { sseManager } from "@/lib/sse-manager";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  await getCurrentUser();  // validates auth

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Send current state for all outputs immediately (client may have missed events)
      const job = await db.renderJob.findUniqueOrThrow({
        where: { id: params.jobId },
        include: { outputs: true },
      });

      for (const output of job.outputs) {
        const event = JSON.stringify({
          outputId: output.id,
          status: output.status,
          imageUrl: output.assetUrl ?? undefined,
        });
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
      }

      // 2. Subscribe to live updates from workers
      sseManager.subscribe(params.jobId, (data) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      });

      // Heartbeat to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return; }
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        sseManager.unsubscribe(params.jobId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

#### `POST /api/assets/upload-url`

```typescript
// app/api/assets/upload-url/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { s3 } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

const UploadUrlSchema = z.object({
  clientSlug: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int().positive().max(50_000_000), // 50MB max
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = UploadUrlSchema.parse(await req.json());

  const assetId = randomUUID();
  const ext = body.filename.split(".").pop();
  const s3Key = `uploads/${body.clientSlug}/${assetId}.${ext}`;

  // Generate presigned PUT URL (browser uploads directly to S3/R2)
  const presignedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
      Key: s3Key,
      ContentType: body.mimeType,
      ContentLength: body.fileSize,
    }),
    { expiresIn: 300 } // 5 minutes
  );

  // Pre-create asset record in "pending" state
  await db.asset.create({
    data: {
      id: assetId,
      clientSlug: body.clientSlug,
      name: body.filename,
      url: s3Key,  // confirmed on /confirm call
      type: inferAssetType(body.mimeType),
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      uploadedBy: user.id,
      archived: true,  // hidden until confirmed
    },
  });

  return NextResponse.json({ data: { presignedUrl, assetId } });
}

function inferAssetType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("font")) return "font";
  return "image";
}
```

#### `POST /api/assets/confirm`

```typescript
// app/api/assets/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { s3 } from "@/lib/s3";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { generateThumbnail } from "@/lib/thumbnail";

export async function POST(req: NextRequest) {
  const { assetId } = await req.json();

  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });

  // Verify the file actually landed in S3
  await s3.send(new HeadObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
    Key: asset.url,
  }));

  // Generate thumbnail for images
  let thumbnailUrl: string | undefined;
  if (asset.type === "image") {
    thumbnailUrl = await generateThumbnail(asset.url);
  }

  const updated = await db.asset.update({
    where: { id: assetId },
    data: {
      archived: false,  // now visible
      url: `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${asset.url}`,
      thumbnailUrl,
    },
  });

  return NextResponse.json({ data: updated });
}
```

#### `GET /api/templates`

```typescript
// app/api/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await getCurrentUser();
  const { searchParams } = new URL(req.url);

  const clientSlug = searchParams.get("clientSlug");
  const status = searchParams.get("status") ?? "published";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "24"), 50);

  const where = {
    status,
    ...(clientSlug ? {
      OR: [
        { clientSlug },            // client-specific templates
        { clientSlug: null },       // global templates
      ]
    } : {}),
  };

  const [templates, total] = await Promise.all([
    db.template.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, thumbnailUrl: true,
        sizes: true, tags: true, clientSlug: true, status: true, createdAt: true,
        // Exclude heavy scene/manifest from list view
      },
    }),
    db.template.count({ where }),
  ]);

  return NextResponse.json({
    data: templates,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}
```

#### `POST /api/ai/generate-copy`

```typescript
// app/api/ai/generate-copy/route.ts
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";

const client = new Anthropic();

const CopySchema = z.object({
  context: z.string().min(10).max(500),
  tone: z.enum(["professional", "urgent", "playful", "minimal"]),
  count: z.number().int().min(1).max(10),
  slotType: z.enum(["headline", "cta", "body"]),
  clientSlug: z.string(),
});

const MAX_CHARS: Record<string, number> = {
  headline: 80,
  cta: 30,
  body: 200,
};

export async function POST(req: NextRequest) {
  await getCurrentUser();
  const body = CopySchema.parse(await req.json());

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are an expert ad copywriter. Generate ${body.count} ad ${body.slotType}(s) for the following:

Context: ${body.context}
Tone: ${body.tone}
Max characters: ${MAX_CHARS[body.slotType]}

Rules:
- Each must be under ${MAX_CHARS[body.slotType]} characters
- Vary the approach across suggestions
- No em dashes
- Return ONLY a JSON array of strings, no explanation

Example format: ["Option 1", "Option 2", "Option 3"]`
    }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "[]";
  let suggestions: string[] = [];
  try {
    suggestions = JSON.parse(raw.match(/\[.*\]/s)?.[0] ?? "[]");
  } catch {
    suggestions = [];
  }

  return NextResponse.json({ data: { suggestions } });
}
```

### 17f. Worker Implementations

#### `workers/resize-worker.ts`

```typescript
import { Worker, Job } from "bullmq";
import Replicate from "replicate";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { sseManager } from "@/lib/sse-manager";
import { uploadStreamToS3, cdnUrl } from "@/lib/s3";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

interface ResizePayload {
  jobId: string;
  outputId: string;
  sourceImageUrl: string;
  targetWidth: number;
  targetHeight: number;
  seed?: string;
}

export const resizeWorker = new Worker<ResizePayload>(
  "resize-queue",
  async (job: Job<ResizePayload>) => {
    const { jobId, outputId, sourceImageUrl, targetWidth, targetHeight, seed } = job.data;

    await db.renderOutput.update({
      where: { id: outputId },
      data: { status: "processing" },
    });
    await sseManager.emit(jobId, { outputId, status: "processing" });

    // Call Flux.1 Kontext via Replicate for smart resize/recompose
    const [output] = await replicate.run(
      "black-forest-labs/flux-kontext-pro",
      {
        input: {
          prompt: `Professionally recompose this image to ${targetWidth}×${targetHeight} pixels. 
                   Maintain the subject as the focal point. 
                   If the aspect ratio changes significantly, expand the background naturally. 
                   Keep any logos or text elements at their original size and position.
                   Photorealistic output.`,
          image: sourceImageUrl,
          width: targetWidth,
          height: targetHeight,
          output_format: "webp",
          output_quality: 90,
          seed: seed ? parseInt(seed) : undefined,
        },
      }
    ) as string[];

    // Upload to S3/R2
    const s3Key = `generated/${jobId}/${outputId}.webp`;
    await uploadStreamToS3(output, s3Key, "image/webp");

    const finalUrl = cdnUrl(s3Key);

    await db.renderOutput.update({
      where: { id: outputId },
      data: { status: "complete", assetUrl: finalUrl },
    });

    await sseManager.emit(jobId, {
      outputId,
      status: "complete",
      imageUrl: finalUrl,
    });

    // Check if all outputs for this job are done → update job status
    const job_record = await db.renderJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { outputs: true },
    });
    const allDone = job_record.outputs.every(o => o.status === "complete" || o.status === "failed");
    if (allDone) {
      await db.renderJob.update({
        where: { id: jobId },
        data: { status: "complete", completedAt: new Date() },
      });
    }
  },
  {
    connection: redis,
    concurrency: 5,             // 5 parallel resize operations
    limiter: { max: 10, duration: 1000 },  // 10 jobs/sec rate limit (Replicate API)
  }
);

resizeWorker.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`[resize-worker] Failed job ${job.id}:`, err.message);
  await db.renderOutput.update({
    where: { id: job.data.outputId },
    data: { status: "failed", error: err.message },
  });
  await sseManager.emit(job.data.jobId, {
    outputId: job.data.outputId,
    status: "failed",
    error: err.message,
  });
});
```

#### `workers/render-worker.ts` (template renders via Satori)

```typescript
import { Worker, Job } from "bullmq";
import satori from "satori";
import sharp from "sharp";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { sseManager } from "@/lib/sse-manager";
import { uploadBufferToS3, cdnUrl } from "@/lib/s3";

interface RenderPayload {
  jobId: string;
  outputId: string;
  templateId: string;
  variantData: Record<string, string>;
  targetWidth: number;
  targetHeight: number;
  clientSlug: string;
}

export const renderWorker = new Worker<RenderPayload>(
  "render-queue",
  async (job: Job<RenderPayload>) => {
    const { jobId, outputId, templateId, variantData, targetWidth, targetHeight, clientSlug } = job.data;

    await db.renderOutput.update({ where: { id: outputId }, data: { status: "processing" } });
    await sseManager.emit(jobId, { outputId, status: "processing" });

    // Load template + brand kit
    const [template, brandKit] = await Promise.all([
      db.template.findUniqueOrThrow({ where: { id: templateId } }),
      db.clientBrandKit.findUnique({ where: { clientSlug } }),
    ]);

    // Merge brand kit values into variant data (brand kit fills logo/color slots)
    const resolvedData = { ...variantData };
    if (brandKit && !resolvedData.logo) {
      resolvedData.logo = brandKit.logoUrl ?? "";
    }

    // Build React element tree from scene graph for Satori
    const scene = template.scene as SceneGraph;
    const element = buildSatoriElement(scene, resolvedData, targetWidth, targetHeight);

    // Load fonts referenced in scene
    const fonts = await loadFonts(scene, brandKit);

    const svg = await satori(element, {
      width: targetWidth,
      height: targetHeight,
      fonts,
    });

    // Convert SVG → PNG via sharp
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    const s3Key = `generated/${jobId}/${outputId}.png`;
    await uploadBufferToS3(pngBuffer, s3Key, "image/png");

    const finalUrl = cdnUrl(s3Key);

    await db.renderOutput.update({
      where: { id: outputId },
      data: { status: "complete", assetUrl: finalUrl },
    });
    await sseManager.emit(jobId, { outputId, status: "complete", imageUrl: finalUrl });
  },
  { connection: redis, concurrency: 10 }
);
```

#### `lib/sse-manager.ts`

```typescript
type Listener = (data: object) => void;

class SSEManager {
  private channels = new Map<string, Set<Listener>>();

  subscribe(jobId: string, listener: Listener) {
    if (!this.channels.has(jobId)) {
      this.channels.set(jobId, new Set());
    }
    this.channels.get(jobId)!.add(listener);
  }

  unsubscribe(jobId: string, listener?: Listener) {
    if (!listener) {
      this.channels.delete(jobId);
      return;
    }
    this.channels.get(jobId)?.delete(listener);
    if (this.channels.get(jobId)?.size === 0) {
      this.channels.delete(jobId);
    }
  }

  emit(jobId: string, data: object) {
    const listeners = this.channels.get(jobId);
    if (!listeners) return;
    listeners.forEach(fn => fn(data));
  }
}

export const sseManager = new SSEManager();
```

**Note on SSE in production:** If the Next.js API server runs across multiple instances (common on Vercel/Railway), SSE listeners live in per-instance memory and workers on a different instance won't find them. Solution: use Redis pub/sub — workers publish to `sse:{jobId}` channel, each API instance subscribes via `SUBSCRIBE sse:*` and forwards to its local SSE clients.

```typescript
// Redis pub/sub bridge for multi-instance SSE
// In worker: redis.publish(`sse:${jobId}`, JSON.stringify(data))
// In SSE route server-side: subscribe via separate Redis connection
```

#### `lib/s3.ts`

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadBufferToS3(buffer: Buffer, key: string, contentType: string): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

export async function uploadStreamToS3(url: string, key: string, contentType: string): Promise<string> {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  return uploadBufferToS3(buffer, key, contentType);
}

export function cdnUrl(key: string): string {
  return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
}
```

### 17g. Error Code Reference

All API errors return `{ error: { code, message?, details? } }`:

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod parse failed. `details` = Zod error array. |
| 401 | `UNAUTHORIZED` | No valid Clerk session. |
| 403 | `FORBIDDEN` | User doesn't have access to this clientSlug. |
| 404 | `NOT_FOUND` | Record doesn't exist or doesn't belong to this client. |
| 409 | `CONFLICT` | Duplicate (e.g. brand kit already exists for slug). |
| 422 | `UNPROCESSABLE` | Business logic failure (e.g. template has no published sizes). |
| 429 | `RATE_LIMITED` | Too many requests (from Replicate or internal limit). |
| 500 | `INTERNAL_ERROR` | Unexpected server error. Check logs. |
| 503 | `AI_UNAVAILABLE` | Replicate / Claude API is down. Retry with backoff. |

### 17h. Frontend ↔ Backend Integration Checklist (Resize App)

The resize app frontend is built with simulated data. These are the exact swap points:

| Simulated | Real implementation |
|---|---|
| `simulateOutputCompletion()` timeout | `POST /api/jobs/resize` + SSE stream from `/api/jobs/:jobId/stream` |
| `picsum.photos/seed/...` image URLs | CDN URLs from S3/R2 (`cdnUrl(s3Key)`) |
| `MockCreative[]` from `feedToCreatives()` | Same — feed data remains client-side; only image processing moves to backend |
| `downloadImage(url, ...)` | Same — CDN URLs are public; browser fetches directly |
| In-memory `jobs[]` array | Session-only for now; add `POST /api/sessions/:id/jobs` to persist across refreshes later |

**Swap sequence (one output at a time, lowest risk):**
1. Add `POST /api/jobs/resize` route + DB records → returns jobId + outputIds
2. Replace `simulateOutputCompletion` with SSE subscription in `useEffect` (keyed to jobId)
3. On SSE `{outputId, status: 'complete', imageUrl}` → call `setJobs(...)` same as today
4. Frontend state shape doesn't change — only the data source does

### 17i. Clerk Webhook — User Sync

```typescript
// app/api/auth/route.ts
import { Webhook } from "svix";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  let event: any;
  try {
    event = wh.verify(payload, headers);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "user.created") {
    await db.user.upsert({
      where: { clerkId: event.data.id },
      update: {},
      create: {
        clerkId: event.data.id,
        email: event.data.email_addresses[0].email_address,
        name: `${event.data.first_name ?? ""} ${event.data.last_name ?? ""}`.trim(),
      },
    });
  }

  return new Response("OK");
}
```

---

## Appendix: Key Implementation Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Canvas library | Fabric.js | More mature, better browser compat, larger community than Konva |
| Backend | Next.js API routes | Colocation with frontend, Clerk middleware works natively |
| Job queue | BullMQ (Redis) | Node-native, excellent TypeScript support, built-in retry/backoff |
| Render (batch) | Satori | 10× faster than Puppeteer for simple ad formats |
| Render (complex) | Puppeteer | Full CSS support when needed |
| Image gen | Replicate (Flux Schnell) | Best quality/cost ratio; Flux.1 Kontext for image editing |
| Copywriting | Claude claude-opus-4-7 | Best instruction-following for structured ad copy output |
| Auth | Clerk | Native Next.js SDK, built-in PMG SSO support |
| Storage | S3 / Cloudflare R2 | R2 preferred (no egress fees); S3 fallback |
| State (global) | Zustand | Lightweight, no boilerplate, works with React Query |
| Data fetching | React Query (TanStack) | Cache invalidation, optimistic updates, SSE integration |
| DB | PostgreSQL via Prisma | Type-safe schema, migration support, Vercel Postgres compatible |
