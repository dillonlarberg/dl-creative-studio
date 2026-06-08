# Template Builder — Approach 2: Redesigned 3-Step Flow

**Date:** 2026-06-05  
**Author:** Engineering / AI  
**Status:** Ready for agentic execution  
**Scope:** Ground-up redesign of the template builder from 7 steps → 3 steps. Mirrors adcreative.ai's workflow. All channels supported. Unified AI path. Output is a published Template Library record. All file paths are relative to `antig/pmg-creative-studio/src/`.

---

## Overview

Today's 7-step wizard has two diverging paths (wireframe vs. AI candidates), three duplicate asset house fetches, and an Export step that produces placeholder images. The user journey is too long and the "magic" steps (Intent, Generate) are mocked.

This redesign collapses to **3 steps**:

```
Setup  →  Design & Map  →  Publish
```

- **Setup**: Brand auto-loads, user picks channel + sizes + feed + writes a brief. Claude synthesizes field requirements silently as the user fills the form — no separate "Intent" step.
- **Design & Map**: Split-screen editor. Left panel: field mapping (Claude auto-suggests column → field matches). Right panel: live AI-generated candidate carousel with real-time `FilledTemplatePreview`. All brand overrides available inline.
- **Publish**: Template naming, preview thumbnail, publish to Template Library. This creates a record users can later instantiate to run batches.

---

## New Step Architecture

### Step 1: `setup`

**File:** `apps/template-builder/steps/SetupStep.tsx`  
**URL:** `/{clientSlug}/template-builder/setup`  
**Goal:** Collect all context; trigger AI + feed sample in the background before navigating to step 2.

**UI Layout (single column, top-to-bottom sections):**

```
[ Template Name Input ]        ← pre-filled: "Untitled Template – {date}"
[ Channel Selector ]           ← 4 tiles: Social | Programmatic | Print | Digital Signage
[ Size / Ratio Multi-Select ]  ← chips populated by channel selection
[ Feed Selector ]              ← dropdown or card list of client's data sources (from Alli)
[ Creative Brief Textarea ]    ← optional: "Describe the aesthetic and purpose of this ad"
```

**`onEnter`:** none  
**`validate()`:** requires `templateName`, `channel`, at least one `ratio`, and `selectedFeedId`.  
**`onLeave` (= "Continue" pressed, fires before navigating):**
1. Call `fetchFeedSample({ clientSlug, feed: selectedFeed })` → merge `feedSampleData`, `feedMetadata`, `stressMap` into stepData.
2. Call `synthesizeRequirements({ brief, channel, brand: assetHouse })` via Claude → merge `requirements` into stepData.
3. Both calls run in parallel via `Promise.all`.
4. Show a loading overlay on the step while these run (not a separate loading step).

**`next()`:** always `'design'`

**Key implementation detail:** The feed selection in SetupStep replaces SourceStep entirely. Display the feed list exactly as SourceStep does (card list with CircleStackIcon, name, type). The sample fetch happens on `onLeave`, not immediately on feed selection — avoids a slow UI during browsing.

---

### Step 2: `design`

**File:** `apps/template-builder/steps/DesignStep.tsx`  
**URL:** `/{clientSlug}/template-builder/design`  
**Goal:** AI generates layout candidates; user picks one and maps fields. Live preview updates in real time.

**UI Layout (split screen):**

```
Left Panel (40%)                     Right Panel (60%)
────────────────────────             ────────────────────────────────
[ Candidate Selector ]               [ Live Preview — FilledTemplatePreview ]
  3 cards, clickable                   Real-data iframe preview, updates on
  Shows name + description             every field mapping change
  
[ Field Mapping ]                    [ Candidate Carousel ]
  Per-requirement row:                 Click through candidate cards
    - Field label + type badge         Highlight selected with blue ring
    - Mode toggle: Feed | Upload
    - Feed: <select> with auto-
      suggested column pre-selected
    - Upload: URL input + file drop

[ Brand Overrides ]
  Background color swatches
  Accent color swatches  
  Text color swatches
  Font selector (from asset house)
  Logo variant: Primary / Inverse
```

**`onEnter`:**
1. If `stepData.candidates` is empty, call `generateLayouts({ requirements, channel, brand })` → merge `candidates` into stepData.
2. If `stepData.feedMappings` is empty, call `suggestMappings({ requirements, feedColumns })` → pre-fill `feedMappings`.
3. Both depend on `requirements` and `feedSampleData` from SetupStep — these must exist before reaching DesignStep.

**`validate()`:** all Dynamic-category requirements must have a mapping in `feedMappings`.

**`next()`:** always `'publish'`

**Candidate selector interaction:** Clicking a candidate card updates `selectedCandidateIndex` and immediately re-renders `FilledTemplatePreview` with that candidate's layout tokens. No additional API call.

**Auto-suggest mapping UX:** When the step loads, `feedMappings` is pre-filled by `suggestMappings`. Each feed `<select>` shows the suggested column as selected. The user can see a small "AI suggested" badge on pre-filled rows, which disappears when the user manually changes the selection.

**Social channel only:** If `stepData.channel === 'Social'`, also show the wireframe library picker at the top of the right panel. Selecting a wireframe replaces the AI candidate in `selectedCandidateIndex = 0` and swaps the right panel preview to `FilledTemplatePreview` using that wireframe file. For non-Social, right panel shows the hand-composed preview (same as current RefineStep candidate path, promoted here).

---

### Step 3: `publish`

**File:** `apps/template-builder/steps/PublishStep.tsx`  
**URL:** `/{clientSlug}/template-builder/publish`  
**Goal:** Review the complete configured template; name it; publish to Template Library.

**UI Layout:**

```
Left (60%)                         Right (40%)
────────────────────────           ─────────────────────────
[ Template Preview ]               [ Publish Card ]
  FilledTemplatePreview of            Template Name (editable input)
  selected candidate + first          Channel badge
  feed row                            Sizes list
                                      Feed name
                                      Mapped fields count
                                      Created by (current user)
                                      
                                      [ Publish to Template Library ]
                                        Black CTA button
                                      
                                      [ Success State ]
                                        "Published! ✓"
                                        Link: "View in Template Library →"
```

**`validate()`:** always true (can always attempt to publish).

**`onLeave`:** none (Publish is the terminal step — no Continue button, just Publish action).

**Publish action:**
1. Call `templateLibraryService.publish(clientSlug, { ... })` with full config assembled from stepData + context.
2. On success: show inline success state. No navigation — user can go back or click "View in Library".
3. On failure: show inline error with retry.
4. No `window.alert` or `window.prompt` anywhere.

---

## New Manifest

**Rewrite file:** `apps/template-builder/manifest.ts`

```typescript
import type { AppManifest } from '../types';
import type { TemplateBuilderStepData } from './types';
import { setupStep } from './steps/SetupStep';
import { designStep } from './steps/DesignStep';
import { publishStep } from './steps/PublishStep';

const manifest: AppManifest<TemplateBuilderStepData> = {
  id: 'template-builder',
  basePath: 'template-builder',
  title: 'Template Builder',
  description: 'Build and publish dynamic ad templates for use across all channels.',
  status: 'live',
  requiresBrandStandards: true,
  steps: [setupStep, designStep, publishStep],

  onMount: async ({ client }) => {
    // Preloads run in parallel on mount. Results exposed via SharedDataContext.
    // See SharedDataContext.tsx for how onMount populates the provider.
  },

  initialStepData: () => ({
    templateName: `Untitled Template — ${new Date().toLocaleDateString()}`,
  }),
};

export default manifest;
```

---

## Architecture

### Providers

**`AssetHouseContext`** — same as Approach 1 (see Approach 1 spec, section A). Single fetch, all steps read from it.

**`SharedDataContext`** — same as Approach 1 (see Approach 1 spec, section B). Holds `dataSources` for SetupStep's feed selector.

**`TemplateBuilderContext`** — NEW, specific to Approach 2.

**New file:** `apps/template-builder/TemplateBuilderContext.tsx`

This context holds derived/computed state that is shared between DesignStep and PublishStep and is too complex for flat stepData:

```typescript
interface TemplateBuilderContextValue {
  // From SetupStep onLeave
  requirements: RequirementField[];
  feedSampleData: Array<Record<string, unknown>>;
  feedMetadata: unknown;
  stressMap?: { shortest: Record<string, unknown>; longest: Record<string, unknown> };

  // From DesignStep onEnter
  candidates: Candidate[];
  
  // Setters (called by steps)
  setRequirements: (r: RequirementField[]) => void;
  setFeedSample: (data: Array<Record<string, unknown>>, meta: unknown) => void;
  setCandidates: (c: Candidate[]) => void;
}
```

**Mount point:** Wrap `TemplateBuilderAppRoot` with all three providers:

```tsx
export default function TemplateBuilderAppRoot() {
  const { currentClient } = useCurrentClient();
  const slug = currentClient?.slug ?? '';
  return (
    <SharedDataProvider clientSlug={slug}>
      <AssetHouseProvider clientSlug={slug}>
        <TemplateBuilderProvider>
          <WizardShell<TemplateBuilderStepData> manifest={manifest} />
        </TemplateBuilderProvider>
      </AssetHouseProvider>
    </SharedDataProvider>
  );
}
```

---

### AI Service Layer

**New file:** `services/ai/templateAI.ts`

All Claude API calls for the template builder live here, isolated from the step components.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { RequirementField } from '../../apps/template-builder/types';
import type { ClientAssetHouse } from '../clientAssetHouse';

const client = new Anthropic();

// ── synthesizeRequirements ──────────────────────────────────────────
export async function synthesizeRequirements(opts: {
  brief: string;
  channel: string;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary'> | null;
}): Promise<RequirementField[]> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYNTHESIZE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Channel: ${opts.channel}\nBrand: ${JSON.stringify(opts.brand)}\nBrief: ${opts.brief}`,
    }],
  });
  const text = message.content[0].type === 'text' ? message.content[0].text : '[]';
  return JSON.parse(text) as RequirementField[];
}

const SYNTHESIZE_SYSTEM_PROMPT = `You are a creative requirements analyst for PMG, a media agency.
Given a channel and creative brief, identify the dynamic data fields required for an ad template.
Return ONLY valid JSON — an array of RequirementField objects. No explanation, markdown, or wrapping.
RequirementField shape: { id: string (snake_case), label: string, category: "Brand"|"Dynamic"|"System", source: "Feed"|"Creative House"|"User Preset"|"Locked", type: "text"|"image"|"currency"|"button"|"asset" }
Include at minimum: headline (text/Dynamic/Feed), image (image/Dynamic/Feed), logo (asset/Brand/Creative House).
Add price, cta, promo only if contextually appropriate.`;

// ── generateLayouts ─────────────────────────────────────────────────
export interface Candidate {
  id: string;
  name: string;
  variant: 'grid' | 'stacked' | 'wide' | 'minimal';
  description: string;
  strategy: string;
  styles: {
    primaryColor: string;
    fontFamily: string;
    borderRadius?: string;
    shadow?: string;
    gradient?: string;
    accentRotation?: string;
  };
  elements: {
    headline: boolean;
    price: boolean;
    image: boolean;
    cta: boolean;
    logo: boolean;
  };
}

export async function generateLayouts(opts: {
  requirements: RequirementField[];
  channel: string;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary' | 'cornerRadius'> | null;
}): Promise<Candidate[]> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: LAYOUT_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        channel: opts.channel,
        requirements: opts.requirements,
        brand: {
          primaryColor: opts.brand?.primaryColor || '#2563eb',
          fontFamily: opts.brand?.fontPrimary || 'Inter',
          borderRadius: opts.brand?.cornerRadius || '12px',
        },
      }),
    }],
  });
  const text = message.content[0].type === 'text' ? message.content[0].text : '[]';
  return JSON.parse(text) as Candidate[];
}

const LAYOUT_SYSTEM_PROMPT = `You are a senior creative director at PMG, a performance media agency.
Given field requirements, channel, and brand tokens, generate exactly 3 ad layout candidates optimized for performance.
Return ONLY valid JSON array of Candidate objects. No explanation, markdown, or wrapping.
Candidate shape: { id, name (2–3 words, evocative), variant ("grid"|"stacked"|"wide"|"minimal"), description (1 sentence), strategy (1 sentence on performance rationale), styles: { primaryColor, fontFamily, borderRadius?, shadow?, gradient?, accentRotation? }, elements: { headline, price, image, cta, logo } (booleans matching requirements) }
Make the 3 variants meaningfully different: one safe/editorial, one bold/high-contrast, one minimal/clean.`;

// ── suggestMappings ─────────────────────────────────────────────────
export async function suggestMappings(opts: {
  requirements: RequirementField[];
  feedColumns: string[];
}): Promise<Record<string, string>> {
  if (opts.feedColumns.length === 0) return {};
  
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: MAPPING_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        fields: opts.requirements.map((r) => ({ id: r.id, label: r.label, type: r.type })),
        columns: opts.feedColumns,
      }),
    }],
  });
  const text = message.content[0].type === 'text' ? message.content[0].text : '{}';
  return JSON.parse(text) as Record<string, string>;
}

const MAPPING_SYSTEM_PROMPT = `You are a data integration specialist.
Given a list of template field requirements (id, label, type) and a list of feed column names,
return a JSON object mapping each field id to the most semantically similar feed column name.
Only include mappings you are confident about. Skip image fields unless a column clearly contains image URLs.
Return ONLY valid JSON. Example: { "headline": "product_title", "price": "sale_price" }`;
```

**Error handling for all three functions:** wrap in try/catch at the call site in the step's `onLeave` / `onEnter`. On failure: set an error state in the step, show an inline retry button. Never navigate forward on failure.

---

### Updated `TemplateBuilderStepData`

**Rewrite file:** `apps/template-builder/types.ts`

Approach 2 uses a cleaner, flatter stepData. The context holds derived/heavy data; stepData holds user selections only.

```typescript
export type Channel = 'Social' | 'Programmatic' | 'Print' | 'Digital Signage';
export type LogoVariant = 'primary' | 'inverse';

export interface TemplateBuilderStepData {
  // ── setup step ────────────────────────────────────────────────────
  templateName?: string;
  channel?: Channel;
  ratios?: string[];
  selectedFeedId?: string;
  selectedFeedName?: string;
  brief?: string;

  // ── design step ───────────────────────────────────────────────────
  selectedCandidateIndex?: number | null;
  feedMappings?: Record<string, string>;         // fieldId → columnName
  uploadValues?: Record<string, string>;         // fieldId → dataURL or URL
  logoVariant?: LogoVariant;
  backgroundColor?: string;
  accentColor?: string;
  textColor?: string;
  fontFamily?: string;

  // ── wireframe (Social channel only) ───────────────────────────────
  selectedWireframeId?: string;
  wireframeFile?: string;

  // index signature — required by WizardStep<S> constraint
  [k: string]: unknown;
}
```

**Note:** `requirements`, `feedSampleData`, `candidates` live in `TemplateBuilderContext`, NOT in stepData. They are too large and too frequently updated for the stepData persistence layer.

---

### Template Library Service

Same implementation as Approach 1, section F. Use the same `services/templateLibrary.ts` file.

---

### Channel Support

**New file:** `constants/channelWireframes.ts` — same as Approach 1, section D.

**In DesignStep:**
- Social: show wireframe library picker (same SOCIAL_WIREFRAMES from existing constants) + AI candidates.
- Programmatic: AI candidates only. Right panel shows hand-composed preview scaled to selected size.
- Print/Digital Signage: AI candidates only. Right panel shows aspect-ratio-correct preview frame.

For non-Social channels, `FilledTemplatePreview` cannot be used (no HTML template file). Use the hand-composed React preview from the existing `RefineStep.tsx` candidate path — extract it into a shared `CandidatePreview.tsx` component.

**New file:** `apps/template-builder/_internal/CandidatePreview.tsx`

```typescript
// Extracted from RefineStep.tsx lines 246–342 (the candidate render path).
// Props: candidate, feedSampleData, feedMappings, assetHouse, ratio, accentColor, activeFont, logoScale, logoVariant
export function CandidatePreview(props: CandidatePreviewProps) { ... }
```

This component is used by DesignStep (non-Social) and can optionally be reused by Approach 1's RefineStep to reduce duplication.

---

### Modal + Toast

Same implementation as Approach 1, section E. `components/ui/Modal.tsx` and `components/ui/Toast.tsx`.

---

## Files to Delete (after Approach 2 is complete)

| File | Reason |
|------|--------|
| `steps/ContextStep.tsx` | Replaced by SetupStep |
| `steps/IntentStep.tsx` | Intent synthesis moved into SetupStep onLeave |
| `steps/SourceStep.tsx` | Feed selection moved into SetupStep |
| `steps/MappingStep.tsx` | Mapping moved into DesignStep |
| `steps/GenerateStep.tsx` | Candidate generation moved into DesignStep onEnter |
| `steps/RefineStep.tsx` | Refinement merged into DesignStep |
| `steps/ExportStep.tsx` | Replaced by PublishStep |
| `steps.ts` | Barrel file, replace with new barrel for 3 steps |

**Do not delete:**
- `_internal/FilledTemplatePreview.tsx` — used in DesignStep + PublishStep
- `_internal/injectIntoHtml.ts` — used by FilledTemplatePreview
- `_internal/TemplatePreview.tsx` — used in DesignStep wireframe library
- `_internal/baseline.ts` — keep for wireframe baseline assets
- `_internal/handlers.ts` — port `analyzeCreativeIntent` (wireframe path) to `templateAI.ts`, then delete handlers.ts
- `types.ts` — rewrite in place
- `manifest.ts` — rewrite in place
- `AppRoot.tsx` — rewrite in place

---

## Implementation Order

| # | Task | File(s) | Depends on |
|---|------|---------|------------|
| 1 | Create `AssetHouseContext` | `platform/assetHouse/AssetHouseContext.tsx` | — |
| 2 | Create `SharedDataContext` | `platform/wizard/SharedDataContext.tsx` | — |
| 3 | Create `TemplateBuilderContext` | `apps/template-builder/TemplateBuilderContext.tsx` | — |
| 4 | Rewrite `AppRoot.tsx` with providers | `apps/template-builder/AppRoot.tsx` | 1, 2, 3 |
| 5 | Create AI service layer | `services/ai/templateAI.ts` | — |
| 6 | Create `templateLibraryService` | `services/templateLibrary.ts` | — |
| 7 | Create `Modal.tsx` + `Toast.tsx` | `components/ui/` | — |
| 8 | Create `channelWireframes.ts` | `constants/channelWireframes.ts` | — |
| 9 | Extract `CandidatePreview.tsx` | `apps/template-builder/_internal/CandidatePreview.tsx` | — |
| 10 | Rewrite `types.ts` | `apps/template-builder/types.ts` | — |
| 11 | Build `SetupStep` | `apps/template-builder/steps/SetupStep.tsx` | 1, 2, 5, 8, 10 |
| 12 | Build `DesignStep` | `apps/template-builder/steps/DesignStep.tsx` | 1, 3, 5, 7, 8, 9, 10 |
| 13 | Build `PublishStep` | `apps/template-builder/steps/PublishStep.tsx` | 3, 6, 7, 10 |
| 14 | Rewrite `manifest.ts` | `apps/template-builder/manifest.ts` | 11, 12, 13 |
| 15 | Update `steps.ts` barrel | `apps/template-builder/steps.ts` | 11, 12, 13 |
| 16 | Add Firestore security rules | `firestore.rules` | 6 |
| 17 | Delete old step files | 7 files (see above) | 14 |
| 18 | Update manifest.test.ts | `apps/template-builder/manifest.test.ts` | 14 |
| 19 | Write E2E test: full 3-step flow | Playwright | 14 |

---

## Routing

No routing changes needed. The existing `WizardShell` handles step URL segments. Steps are now `setup`, `design`, `publish` instead of `context`, `intent`, `source`, `mapping`, `generate`, `refine`, `export`.

If users have bookmarked old step URLs (e.g., `/acme/template-builder/context`), they will land on step 0 (`setup`) because WizardShell's `findIndex()` returns 0 for unknown step IDs. This is acceptable behavior.

---

## Comparison with adcreative.ai

| adcreative.ai | Approach 2 Equivalent |
|--------------|----------------------|
| Brand kit setup (colors, fonts, logo) | `AssetHouseContext` pre-loaded from Alli asset house |
| Ad format / size picker | Channel + ratio multi-select in SetupStep |
| Product feed / catalog connect | Feed selector in SetupStep; sample on onLeave |
| AI generates creatives | `generateLayouts()` → Claude candidates in DesignStep |
| User picks + edits | Candidate carousel + field mapping in DesignStep |
| Download / export | Publish to Template Library in PublishStep |

---

## Environment Variables Required

```
ANTHROPIC_API_KEY=sk-ant-...
```

Same security note as Approach 1: proxy through a backend endpoint for production. Do not expose raw API key in VITE_ env for a shipped product.

---

## Testing

- Unit: `synthesizeRequirements`, `generateLayouts`, `suggestMappings` — mock Anthropic client, assert output shape.
- Unit: `templateLibraryService.publish()` — Firestore emulator.
- Unit: `SetupStep` validate logic — channel + feed required.
- Unit: `DesignStep` validate — all Dynamic requirements mapped.
- Integration: Full 3-step wizard Playwright test — Social channel with wireframe, publish creates Firestore record with correct shape.
- Integration: Non-Social channel (Programmatic) — full flow without wireframe, verify candidate-based preview renders.
- Regression: `WizardShell.test.tsx` — run unmodified; if it breaks, the WizardShell contract changed unintentionally.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| `TemplateBuilderContext` + WizardShell stepData become out of sync | Context is source of truth for derived data; stepData is source of truth for user input. Never write the same key to both. Document this invariant in the context file. |
| `suggestMappings` makes a wrong suggestion and user misses it | Show "AI suggested" badge on auto-filled rows. Provide 1-click "Clear all suggestions" action. |
| `onLeave` async (SetupStep) takes too long, user gets stuck | Show loading overlay with progress indicators: "Fetching feed... Analyzing brief..." with individual step completion checkmarks. |
| Old step bookmarks break | Acceptable: WizardShell resets to step 0. No data loss (stepData persisted separately). |
| Claude returns malformed JSON | Wrap all JSON.parse() in try/catch. On failure: surface inline error with retry; log the raw Claude response for debugging. |
| Template Library grows large, no pagination | Add `limit(50)` to initial `templateLibrary.list()` query; add "Load more" in the library view. |
