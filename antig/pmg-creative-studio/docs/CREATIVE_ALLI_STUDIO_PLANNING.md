# Creative Alli Studio — Planning Notes

**Source:** Handwritten notebook notes (Annie Nguyen, 2026-05)
**Status:** Living document — updated as decisions are made and product evolves

---

## Overview

Building a Canva-like creative editor for PMG teams (media, strategy — non-creatives). Full replacement of the current Firebase wizard app. Stays connected to Alli data (brand profiles, client data).

**Inspiration / competitive reference:**
- Canva + LLM → input (text, context, brand info) → visual assets
- Creatify (video)
- AdCreative.AI (static)
- All converge on: templates + AI + visual editor

---

## Current Process (Joshua, SWE on Alli Creative Studio)

Understanding what exists today to inform what we're replacing. Goal is NOT to recreate their product — build something better if possible.

**Old process (step by step):**
1. Creative team works in Photoshop → creates template bases (given by client or from client website research)
2. Creative team builds Figma file of potentially dynamic ads (currently static, moving to dynamic)
3. Client approves Figma
4. Ads handed to CRM team (Email Marketing team — now also supporting creative process)
5. CRM converts Figma → HTML using Google Web Designer (JS injections make ads dynamic)
6. JS injections connect to Excel sheets (key-value pair data feed → product feed)
7. Excel sheet → HTML file rendered
8. Puppeteer takes screenshot → uploads to S3 (indexed HTML + screenshot)
9. Marketplace app converts to S3 images in Alli → QA → delivery
10. Feed team shapes content per platform (Pinterest vs Facebook have different shapes, headers, formats)
11. Media team A/B tests on platform

**Pain points:**
- CRM team is the bottleneck (Figma→HTML conversion is manual)
- Google Web Designer is the intermediary we want to eliminate
- Platform-specific feed management is manual
- Render process is slow and manual (open HTML → screenshot → render)
- End date issue: no rendering if past date → wasted resources; delivery not yet configured

**Template elements:** Key-value pair mapping done with data feed. OG mapping done by CRM. Template bases created by CRM team.

**Goal:** Eliminate CRM intermediary. Creative/media team picks template → fills variant data → system renders → delivers to platform. CRM and media team own end-to-end.

---

## Core Components (7)

### 1. The Editor (UI Layer)
- Drag, drop, type, resize elements
- Fabric.js or Konva.js (canvas)
- Photoshop-like: select, drag, layers, transform

### 2. Template Engine
- Prebuilt designs stored as JSON → recipe
- JSON scene graph: positioned elements with named slots
  - Text at [x, y], image at [x, y], color, font, type...
- Manifest: slot types, validation, defaults
- Render strategy: convert to image
- Swap fonts, maintain design system
- Pick template → upload assets (logos) → re-render (load JSON, swap vars)
- Dynamic template → future PR (template authoring UI for designers/admin)

### 3. AI Generation Layer
- Text → image → generate variations
- Background removal
- AI copywriting (ad headlines, descriptions)

### 4. Asset Management
- Brand assets, fonts, icons
- Searchable with metadata

### 5. Brand Kit System
- Store logos, colors, fonts per client
- DB table per client: logo files, hex codes, font choices
- Default DB fallback

### 6. Export / Render Pipeline
- Editor JSON → final PNG / MP4 / PDF at resolution
- Unified job queue — inputs: template, variant data, output sizes, fonts
- Same queue, different worker types:
  - HTML → img
  - AI img gen
  - Video edit
  - Video gen
- Worker process: pick batch calls → call AI → render final img → save to storage

### 7. Batch Variation Engine
- 1 template → generate N versions
- Variation slots defined: headline text, bg, CTA, img button, product photo
- Plug different values → render ALL combos
- Example: 5 headlines × 3 CTAs × 4 images = 60 versions
- Templates + smart defaults + AI → ai-generated content stitching

---

## Features / Tool Breakdown

### Templates (current: HTML)
- Standard (JSON): describe element position, size, font, color, type
- Pick template → upload assets (logos) → re-render (load JSON, swap vars)
- Dynamic template → PR dev (future)

### Batch Ad Variation
- 1 template → generate N versions
- Variation slots: headline text, bg, CTA img button, product photo
- Variation slots defined → plug diff values → render ALL combos
- 5 headlines × 3 CTAs × 4 IMG → 60 versions
- → Flux for image generation

### Text → Image Generation
- Prompt → Alli img API

### Resize (Magic Resize)
- NO simple scale
- Rule-based:
  - Aspect ratio changes → reposition text to top
  - Expand background image
  - Keep logo at fixed size
- AI for background expansion

### Background Removal
- AI models
- rembg (self-hosted) or Remove.bg API

### Brand Kit
- DB table per client
- Stores: logo files, hex color codes, font choices
- Default DB fallback

### AI Copywriting
- Ad headlines / descriptions
- LLM call → parse result

### Smart Cropping
- (To be defined)

---

## AI Models & Implementation

### Stable Diffusion
- Open-source family of image generation models
- Text → image, cheaper
- Versions: SD 1.5, SDXL + thousands of variants on HuggingFace
- Requires model file + GPU to run
- Options: run yourself OR hosted API (Replicate, fai.ai)

### Flux (Black Forest Labs)
- Better results than SD
- Better text rendering + photorealistic output (readable text in images)
- Flux Schnell 9B
- Flux.1 Kontext → image editing

### ComfyUI
- Node-based interface to run models
- Visual programming language
- Load model → apply prompt → upscale → save image
- Configure complex generation pipelines
- Use to determine which pipeline produces best results

### Canva + AI (reference / competitive)
- Image editor + AI features bolted in
- Magic Write: LLM
- Magic Edit: image inpainting model
- Magic Erase: segmentation model

---

## MVP Plan (9 Steps)

1. **Use case in scope** — define the goal
2. **Basic canvas editor** → library: Fabric.js / Konva.js
   - Add text
   - Upload image
   - Drag things
3. **Create JSON template**
   - Template defined by: text positions, text styles, image slots
   - Populate slots
4. **Add AI copywriting** → LLM API button (Generate Headline)
   - Product description → return headline
5. **Add text-to-image** via hosted API
   - Replicate / fai.ai
   - Generate background
6. **Implement export** — render canvas → PNG → let users download
   - Canvas libraries have built-in export
7. **Users save design** — store JSON in DB
8. **Batch generation** — input 5 headlines → generate 5 diff versions in one click
9. **Brand kit**

---

## Tech Stack

### Frontend (Editor)
- React.js / Next.js — routing, auth, API routes
- Fabric.js (preferred, more mature) or Konva.js — canvas itself (select, drag, layers, transform)
- Tailwind CSS
- Zustand or Redux — state management

### Backend
- Node.js with Next.js API routes OR Python (FastAPI)
- PostgreSQL — DB for: users, designs (JSON), templates, brand kits
- Redis — cache / batch generators / job queues
- S3 or Cloudflare R2 — store image uploads, generated images, exports

### AI Image Creation
- Replicate / fai.ai — hosted image generation
- OpenAI DALL-E 3 — alternative
- Claude API / OpenAI API — LLM for copywriting
- Remove.bg API or self-hosted rembg — background removal

### Batch Generation
- BullMQ (Node) or Celery (Python) → job queues
  - Submit jobs → process in background → notify
- Render: Puppeteer or Satori

### Auth
- Clerk or Auth0

---

## Architecture

### System Diagram

```
USER (browser, web app)
         ↓
FRONTEND
├── Canvas Editor (Fabric.js)
├── Template Picker
└── Brand Kit UI
     Next.js / React / Tailwind
         ↓
BACKEND
├── Auth (Clerk)
├── Design CRUD
└── Job Queue (Redis)
     Next.js API / FastAPI
         ↓                    ↓                         ↓
PostgreSQL              Object Storage              AI APIs
- users                 (S3 / R2)                  - Replicate / fai.ai (img gen)
- design (JSON)         - uploads                  - Claude / GPT (copywriting)
- templates             - generated images         - Remove.bg
- brand kits            - exports                        ↓
                                               Worker Process
                                               - pick batch calls
                                               - call AI
                                               - render final img
                                               - save to storage
```

### Render Pipeline (detail)
- Unified job queue — inputs: template, variant data, output sizes, fonts
- Same queue, different worker types:
  - HTML → img
  - AI img gen
  - Video edit
  - Video gen

### User Flow
1. Open app → pick template → edit in canvas
2. Frontend holds design as JSON object in memory
3. User clicks "Generate AI background" → frontend hits backend → backend calls Anthropic / Replicate

---

## 3-Layer Architecture (Creative Engine)

### Layer 1: Creative Object Model (foundational — build first)

**Creative = core entity with fields:**
- `source` — creation method
- `template_binding` — template + variant data
- `asset` — actual image/video file
- `lineage` — parent creative
- `metadata` — size, format, brand, tags, campaign

**Versioning (no mutation):**
- Creative #47 → spawns #49 (parent = #47)
- No in-place mutation — new creative created for each version

### Layer 2: Template + Variant System

**JSON Scene → Template:**
- Scene graph: positioned elements with named slots
- Manifest: slot types, validation, defaults
- Render strategy: convert to image

**HTML render path** → stored in Creative Object Model

**Variant sources:**
- Process product feed: variant feed → product feed → different variant source

### Layer 3: Workflow Layer

All 8 workflows call shared services:

| Workflow | Implementation |
|----------|---------------|
| Resize images | Re-render with template |
| Edit existing image | 1) Creative exposes existing variant data → 2) slot positions in editor → 3) new creative saved with parent lineage |
| Generate new image | Pure AI integration — no template, raw asset |
| Dynamic template builder | Template authoring UI for designers/admin |
| Process product feed | Ingest feed + map |
| Video workflows | Same model, different renderer |

---

## Open Questions / Decisions To Make

- [ ] Fabric.js vs Konva.js — confirm canvas library choice
- [ ] Next.js API routes vs FastAPI — confirm backend
- [ ] Replicate vs fai.ai — confirm image gen provider
- [ ] BullMQ vs Celery — confirm job queue (depends on backend language choice)
- [ ] Puppeteer vs Satori — confirm render approach
- [ ] Clerk vs Auth0 — confirm auth provider
- [ ] How to handle platform-specific feed shapes (Pinterest vs Facebook) — out of MVP scope?
- [ ] Joshua: is this replacing the existing Alli Creative Studio or a parallel product?

---

## Decision Log

| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-05-04 | Full replacement of current Firebase app | Current app is a POC with no production users; rebuilding is cleaner than patching |
| 2026-05-04 | Stay connected to Alli data | Brand profiles are real; Alli API is the source of truth for client data |
| 2026-05-04 | Joshua = SWE on Alli, not a system name | Notes on Joshua's process inform what we're replacing, not what we're building |
| 2026-05-04 | Approval workflow + naming conventions are post-MVP | Leave room in infrastructure (status field on variant, structured variation ID pattern) but don't build the UI flows yet |
| 2026-05-04 | Platform-specific feed shapes (Pinterest vs Facebook) — NOT out of MVP scope | Multi-size output must be native to the render pipeline from day one; sizes array on every batch job |

---

## Strategic Review — Creative Strategy Perspective
**Reviewed: 2026-05-04**

### 1. Strategic Fit & Market Positioning

PMG has something no external competitor has: a live data layer with actual client brand profiles, campaign history, and performance signals already in Alli. That is a moat. No external tool will have it by default.

- **Canva** — generic design tool, no connection to media buy, no path to the ad server
- **AdCreative.ai** — inconsistent output, no client brand data unless manually uploaded every time
- **Celtra/Flashtalking** — enterprise DCO, six-figure contracts, require developer resources; this is where PMG's CRM team was spending its time
- **Creatify** — video-first, not a serious threat for static

**The unique PMG angle:** This is not "Canva for PMG." It's a closed-loop creative production system that connects brief → rendered asset → live campaign, with brand data already loaded and a direct path into Alli. That is a fundamentally different product category — **a performance creative automation platform**, not a design tool.

---

### 2. Creative Strategy Assessment

**The 5×3×4=60 model is directionally right but operationally incomplete.**

The batch editor UI showing "5 × 3 × 4 = 60 variants" is genuinely excellent UX. But what's missing:

- **No hypothesis tagging.** Experienced strategists test with a theory attached ("Headline A = urgency vs. Headline B = value"). Without annotation, performance data comes back and no one knows what was actually being tested.
- **No exclusion rules.** Not all combinations are worth rendering. A luxury headline should never pair with a sale-focused product image. The engine generates every permutation without logic.
- **No audience-level variation axis.** Same creative, three audience segments, different UTM/landing pages — a layer the tool completely omits today.

**The missing feedback loop is the biggest strategic gap.** Alli already has performance data (CTR, conversions) from platform APIs. The creative ID from the Creative Object Model needs to match back to performance records — surfacing winning combinations, auto-badging top performers in the batch grid, and seeding new batches from winners. Without this, the tool is a production machine, not a creative intelligence platform.

---

### 3. Workflow Critique

The old process has three pain points. The new tool solves two clearly.

- ✅ **CRM bottleneck (Figma→HTML)** — Solved completely. Highest-leverage win.
- ✅ **Manual Puppeteer rendering** — Solved. The batch editor's done/running/queued UI is exactly right.
- ❌ **Platform-specific feed shaping** — Originally listed as "out of MVP scope." Reversed: this is the delivery mechanism. If media teams still need to manually produce Pinterest 1000×1500 after generating 60 Facebook variants, the problem has been moved, not eliminated.

**Workflow gaps to leave room for (post-MVP infrastructure):**
- Approval workflow — add a `status` field (draft | approved | rejected) on every variant record now; build the UI flows later
- Naming conventions — generate variation IDs from a structured pattern (client + template + slot values), not a dumb auto-increment, so it maps to real platform naming conventions when needed

---

### 4. MVP Scope — Reprioritized Sequence

Creative/media teams won't use a canvas editor with no client-specific templates. The demo must be: "load a real template → fill real variant data → get a real output."

**Recommended MVP sequence:**
1. Template loader from JSON (real client template)
2. Brand kit connection (pull colors, fonts, logo from Alli)
3. Slot-fill interface (single variant)
4. Render to PNG and export
5. Batch generation with 3–5 variants (prove the core value prop)
6. Canvas editor for fine-tuning (now it matters because there's something to edit)
7. AI copywriting
8. Save/load design state
9. Text-to-image generation

**Over-engineered for MVP:** The full 3-layer Creative Object Model with lineage, immutability, and versioning is architecturally correct long-term but premature. Ship flat, add lineage after real users are creating real things.

**Missing from MVP that matters:** A basic template authoring interface. Without it, every new client template requires engineering time. Even "upload Figma export, define slot positions" unblocks the creative team entirely.

---

### 5. Platform Sizes — Required at Launch

**Supported sizes, in priority order:**
1. 1080×1080 — Meta Feed (square)
2. 1080×1920 — Meta Stories/Reels (vertical)
3. 1200×628 — Meta Link Ad (horizontal)
4. 1000×1500 — Pinterest standard
5. 300×250 — Display (if display is in scope)

Add a `sizes` array to every batch job spec. 20 variants × 3 sizes = 60 files, automatically. This is the feature that will make media teams prefer this over every manual alternative.

---

### 6. Risk Flags

1. **Template library is empty at launch** — 8 placeholder templates won't get real usage. Need 15–20 real client templates loaded before any internal launch. Start this now — it's a content problem, not an engineering problem.
2. **Render quality doesn't match existing output** — If the new tool renders even slightly differently from client-approved ads, it won't get sign-off to switch. Test against real approved ads early.
3. **Batch engine generates nonsense combinations** — Without exclusion rules, media teams will see obvious bad pairings, manually curate down to usable ones, and decide the tool created work instead of saving it.
4. **No designated template author** — CRM team built templates before. Who owns this now? If it defaults to engineering, template production stalls.
5. **The feedback loop never gets built** — Without performance data connected to creative output, this competes with Canva (a production tool) rather than a full creative intelligence platform.

---

### 7. Top 5 Recommendations (Priority Order)

1. **Build the template library before the canvas editor.** Commission 20 real client templates in JSON slot format as a sprint-0 requirement. Designate a template author role permanently.
2. **Make multi-size output native to the render pipeline from day one.** `sizes: [1080x1080, 1080x1920, 1200x628]` on every batch job. Non-negotiable.
3. **Add hypothesis tagging and exclusion rules to the batch editor.** Free-text "test hypothesis" field per slot + simple pairing rules. The difference between a render machine and a creative testing tool.
4. **Wire Alli performance data to creative output within 90 days of launch.** Even a manual "paste your CTR here" field on a variant card closes the loop conceptually and builds the data model before automation.
5. **Map the full approval and trafficking workflow before building the export step** — but implement as infrastructure only for MVP (status field, structured IDs), not full UI flows.

---

## Resize Image App — Build Roadmap

**Last updated:** 2026-05-07

### Current state (as built)
Gallery-first UX. User selects a creative from a static mock library, chooses target channels and sizes, and generates resized variants with a simulated AI backend. Variants tab shows outputs with filter/sort, per-tile format download (PNG/JPG/WebP), and a single-image modal with reiterate input.

### Phase 1 — Option A: Feed data wiring (next)
Keep the gallery-first UX exactly as-is. Add a lightweight feed connection step that gates the gallery — same `fetchDataSources` / `fetchFeedSample` infrastructure already used by the Dynamic Template Builder. We detect image URL columns in the feed automatically and map feed rows into the `MockCreative` shape so nothing downstream changes.

**Flow:**
```
Connect feed (once) → gallery populates with real client images → select → resize config → variants
```

**Source of creatives:** Image URL columns from the Alli Data Explorer feed (e.g. `hero_image_url`, `product_image`). Not the DAM — that's a separate integration.

**Key constraint:** Feed images are raw product/campaign images, not finished ad files. This is intentional for Phase 1 — the resize tool produces the finished sizes from these source images.

### Phase 2 — Option B: Multi-step flow (later)
As the tool matures, the implicit steps become explicit navigable stages:

```
Step 1: Select source (feed / DAM upload / manual upload)
Step 2: Browse + select creative(s)
Step 3: Configure resize channels + sizes
Step 4: Variants — review, filter, download
```

The gallery built in Option A becomes Step 2. Nothing gets thrown away — steps are added around it.

**When to make this move:** When users need to select from multiple source types (DAM vs. feed vs. upload) or when batch multi-select across sessions becomes a requirement.

### Inheritance model (Variants tab)
Original creative → N resized variants. The Variants tab label was chosen deliberately to support a future folder/grouped view:

```
Fall Campaign — Hero (1920×1080)
  └── 1:1 Social (1080×1080)
  └── 9:16 Stories (1080×1920)
  └── 300×250 Programmatic
```

When multiple jobs have run, group by source creative. This is a display-layer change only — the data model already supports it (`job.sourceCreative` + `job.outputs`).
