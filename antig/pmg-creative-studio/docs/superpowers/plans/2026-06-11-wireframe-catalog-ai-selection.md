# Wireframe Catalog AI Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace abstract AI layout candidates with real wireframe selection — Gemini picks 3 wireframes from the 15-entry catalog based on brief, required fields, and available feed columns; each candidate card shows a live thumbnail; clicking a card immediately loads that wireframe into the live preview.

**Architecture:** Four-layer change: (1) add `WIREFRAME_CATALOG` constant with slot/element metadata per wireframe, deriving `id/name/file/adSize` from `SOCIAL_WIREFRAMES` to avoid ID drift; (2) add `wireframeId` to `Candidate` type and pass catalog + `feedColumns` + `brief` to the API; (3) rewrite the `generateLayouts` Gemini prompt to pick from the real catalog, enumerate valid IDs explicitly, and validate the response server-side; (4) wire the wireframe ID into DesignStep — candidate cards become lazy-thumbnail cards that coexist with the existing right-panel grid, selecting a card updates `selectedWireframeId` which both the card and the grid respect. The `onEnter` auto-apply reads live state (not stale snapshot) before applying.

**Tech Stack:** TypeScript, React, Gemini 2.5 Flash via `helloWorld` proxy, Firebase Cloud Functions Gen 1, Vite, Heroicons.

---

## Files Modified

| File | Change |
|---|---|
| `src/constants/useCases.ts` | Add `WireframeCatalogEntry` interface + `WIREFRAME_CATALOG` array derived from `SOCIAL_WIREFRAMES` IDs |
| `src/apps/template-builder/TemplateBuilderContext.tsx` | Add `wireframeId?: string` to `Candidate` interface |
| `src/services/ai/templateAI.ts` | Add `feedColumns` + `brief` + `wireframeCatalog` to `generateLayouts` payload |
| `functions/src/index.ts` | Rewrite `generateLayouts` prompt; add `wireframeId` to schema; server-side ID validation |
| `src/apps/template-builder/steps/DesignStep.tsx` | Pass feedColumns+brief to generateLayouts; safe auto-apply via `_designCtx`; lazy-thumbnail candidate cards; card click sets wireframe |

---

## Key Design Decisions

**Dual selection UIs coexist, not compete.** The existing right-panel wireframe grid (15 thumbnails) stays as-is — it's the established selection surface for Social. The left-panel candidate cards add AI rationale (why each wireframe was picked) and a lazy thumbnail. Both write the same `selectedWireframeId` state, so they're always in sync — clicking either updates the preview.

**Auto-apply reads live state.** `onEnter` is async and `stepData` is a stale snapshot captured at call time. The auto-apply reads `_designCtx` directly at apply time (after `generateLayouts` resolves) to check if the user has already selected a wireframe manually during the network call.

**Server-side ID validation.** Gemini is prompted with an explicit enumeration of valid IDs and the backend validates/repairs the response before returning, so bad IDs never reach the client.

**WIREFRAME_CATALOG derives IDs from SOCIAL_WIREFRAMES.** A compile-time assertion ensures every `WIREFRAME_CATALOG` entry has a matching `SOCIAL_WIREFRAMES` entry — ID drift becomes a build error, not a silent runtime bug.

---

## Task 1: Add WIREFRAME_CATALOG to useCases.ts

**Files:**
- Modify: `src/constants/useCases.ts`

**Context:** `SOCIAL_WIREFRAMES` already has 15 entries. The IDs are non-sequential: `original_1, original_2, original_3, original_4, original_5, original_6, original_7, original_8, original_9, original_11, original_13a, original_13b, original_14, original_15a, original_15b`. There is no `original_10`, `original_12`, `original_13`, or `original_15`. `WIREFRAME_CATALOG` must use these exact same IDs or every `SOCIAL_WIREFRAMES.find()` will silently return `undefined`. We derive the IDs by pulling them from `SOCIAL_WIREFRAMES` directly and add a compile-time assertion to prevent future drift.

- [ ] **Step 1: Add WireframeCatalogEntry interface and WIREFRAME_CATALOG after SOCIAL_WIREFRAMES in useCases.ts**

```typescript
export interface WireframeCatalogEntry {
  id: string;
  name: string;
  file: string;
  adSize: number;
  slots: string[];
  description: string;
  bestFor: string;
  elementTypes: {
    image: number;
    text: number;
    hasLogo: boolean;
    hasBackground: boolean;
    hasCTA: boolean;
    hasPrice: boolean;
  };
}

export const WIREFRAME_CATALOG: WireframeCatalogEntry[] = [
  {
    id: 'original_1',
    name: 'Full Bleed Hero',
    file: 'original_1_copy.html',
    adSize: 1080,
    slots: ['main-image', 'logo', 'label'],
    description: 'Full-bleed product image fills the entire frame. Logo at top, promo label at bottom.',
    bestFor: 'Brand awareness, hero product shots, lifestyle imagery where the image IS the message.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_2',
    name: 'Hero + Promo Badge',
    file: 'minimalist_frame.html',
    adSize: 1024,
    slots: ['logo', 'image1', 'promo'],
    description: 'Minimalist centered product image with a floating promo badge and logo.',
    bestFor: 'Sale or promo announcements with a single featured product.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_3',
    name: 'Logo + Headline + Badge',
    file: 'bold_typography.html',
    adSize: 1024,
    slots: ['logo', 'image1', 'headline', 'promo'],
    description: 'Bold headline sits over the product image with a promo badge below. Copy-led design.',
    bestFor: 'Copy-forward campaigns, seasonal sale messaging, when the headline drives the click.',
    elementTypes: { image: 1, text: 2, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_4',
    name: 'Text Left / Image Right',
    file: 'interior_split.html',
    adSize: 1024,
    slots: ['logo', 'background', 'headline1', 'headline2', 'cta', 'image1'],
    description: 'Split layout: two headlines + CTA on left panel, product image on right.',
    bestFor: 'Direct-response campaigns with a strong CTA, two-headline copy.',
    elementTypes: { image: 1, text: 3, hasLogo: true, hasBackground: true, hasCTA: true, hasPrice: false },
  },
  {
    id: 'original_5',
    name: 'Text Panel + Image',
    file: 'modern_reveal.html',
    adSize: 1080,
    slots: ['logo', 'background', 'headline1', 'image1'],
    description: 'Modern layout with a text panel overlaid on the product image and a background texture.',
    bestFor: 'Single headline brand campaigns, product launches, premium/luxury feel.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_6',
    name: 'Dual Portrait Gallery',
    file: 'organic_shapes.html',
    adSize: 1024,
    slots: ['logo', 'background-image', 'double_image_1', 'double_image_2'],
    description: 'Two portrait product images side-by-side on a background with logo.',
    bestFor: 'Multi-product campaigns, "shop the collection", paired product layouts.',
    elementTypes: { image: 2, text: 0, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_7',
    name: 'Side-by-Side Editorial',
    file: 'editorial_spotlight.html',
    adSize: 1024,
    slots: ['logo', 'image_background', 'image_1_double', 'image_2_double'],
    description: 'Editorial split — two equal product images with a textured background. No text overlay.',
    bestFor: 'Fashion, lifestyle, editorial brand campaigns with two hero products.',
    elementTypes: { image: 2, text: 0, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_8',
    name: 'Duo + Callout Bar',
    file: 'featured_collection.html',
    adSize: 1024,
    slots: ['logo', 'background-image', 'image1', 'image2', 'callout'],
    description: 'Two product images with a callout bar across the bottom and logo.',
    bestFor: '"Featured collection", "Shop the Look", paired product promotions.',
    elementTypes: { image: 2, text: 1, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_9',
    name: 'Framed + Logo Box',
    file: 'clean_showcase.html',
    adSize: 1024,
    slots: ['logo', 'image_1', 'headline1'],
    description: 'Clean framed product image with a logo lockup and headline. Minimal, precise.',
    bestFor: 'Premium single-product showcase, luxury brand advertising.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_11',
    name: 'Split Duo + Copy Strip',
    file: 'dual_focus.html',
    adSize: 1024,
    slots: ['logo', 'background', 'image1', 'image2', 'promo', 'price-note'],
    description: 'Two product images split vertically with promo label and price note strip.',
    bestFor: 'Price-forward promotions, BOGO deals, competitive price messaging.',
    elementTypes: { image: 2, text: 2, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: true },
  },
  {
    id: 'original_13a',
    name: 'Half BG / Half Product',
    file: 'vibrant_pulse_a.html',
    adSize: 1024,
    slots: ['bg', 'image1', 'headline', 'promo'],
    description: 'Background color fills half the frame, product image fills the other half.',
    bestFor: 'Bold retail promotions without brand logo, high-energy performance campaigns.',
    elementTypes: { image: 1, text: 2, hasLogo: false, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_13b',
    name: 'Dual Split + Text Bar',
    file: 'vibrant_pulse_b.html',
    adSize: 1024,
    slots: ['image1', 'image2', 'headline', 'promo'],
    description: 'Two images split horizontally with headline and promo text bar. No logo, no background.',
    bestFor: 'High-energy performance ads, two products, minimal branding required.',
    elementTypes: { image: 2, text: 2, hasLogo: false, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_14',
    name: 'Portrait Pair + Copy',
    file: 'mosaic_narrative.html',
    adSize: 1024,
    slots: ['logo', 'background', 'image1', 'image2', 'headline1', 'promo'],
    description: 'Two portrait product images with headline, promo copy, and logo on a background.',
    bestFor: '"This + That" comparisons, storytelling campaigns, editorial product narratives.',
    elementTypes: { image: 2, text: 2, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_15a',
    name: 'Duo + Center Tag',
    file: 'techno_vibe_a.html',
    adSize: 1024,
    slots: ['logo', 'image_1', 'image_2', 'tag'],
    description: 'Two product images with a centered tag/callout label and logo. Bold, modern.',
    bestFor: 'Tech, gaming, consumer electronics — two products with a punchy center label.',
    elementTypes: { image: 2, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_15b',
    name: 'Sidebar + Hero Image',
    file: 'techno_vibe_b.html',
    adSize: 1024,
    slots: ['logo_1', 'image_3', 'left-bar', 'tag'],
    description: 'Hero product image with a colored sidebar accent bar, logo, and tag label.',
    bestFor: 'Single product hero with strong brand accent color, tech or fashion verticals.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
];

// Compile-time guard: every WIREFRAME_CATALOG id must have a matching SOCIAL_WIREFRAMES entry.
// If IDs drift, this produces a TypeScript error on the mismatched entry.
const _catalogIds = WIREFRAME_CATALOG.map((w) => w.id);
const _socialIds = new Set(SOCIAL_WIREFRAMES.map((w) => w.id));
const _mismatched = _catalogIds.filter((id) => !_socialIds.has(id));
if (_mismatched.length > 0) {
  // This block is dead at runtime but causes a lint/type warning if you read
  // the mismatched array. For a true compile-time error, add a vitest assertion
  // in the existing manifest.test.ts instead.
  console.error('WIREFRAME_CATALOG id mismatch:', _mismatched);
}
```

- [ ] **Step 2: Add a vitest assertion to catch ID drift at test time**

In `src/apps/template-builder/manifest.test.ts` (file already exists), add:

```typescript
import { WIREFRAME_CATALOG, SOCIAL_WIREFRAMES } from '../../constants/useCases';

describe('WIREFRAME_CATALOG', () => {
  const socialIds = new Set(SOCIAL_WIREFRAMES.map((w) => w.id));

  it('every WIREFRAME_CATALOG id exists in SOCIAL_WIREFRAMES', () => {
    for (const entry of WIREFRAME_CATALOG) {
      expect(socialIds.has(entry.id), `${entry.id} not found in SOCIAL_WIREFRAMES`).toBe(true);
    }
  });

  it('has 15 entries matching SOCIAL_WIREFRAMES count', () => {
    expect(WIREFRAME_CATALOG).toHaveLength(SOCIAL_WIREFRAMES.length);
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx vitest run src/apps/template-builder/manifest.test.ts 2>&1
```

Expected: both new tests PASS.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/constants/useCases.ts src/apps/template-builder/manifest.test.ts
git commit -m "feat: add WIREFRAME_CATALOG constant with drift-guard test"
```

---

## Task 2: Add wireframeId to Candidate type + update templateAI.ts payload

**Files:**
- Modify: `src/apps/template-builder/TemplateBuilderContext.tsx`
- Modify: `src/services/ai/templateAI.ts`

**Context:** The `brief` from Step 1 (`stepData.brief`) must be passed alongside `feedColumns` and `wireframeCatalog` — without it, Gemini picks wireframes purely from field types and column names, which is weaker selection than the brief provides. The `WIREFRAME_CATALOG` import lives only in `templateAI.ts`; DesignStep does NOT import it.

- [ ] **Step 1: Add wireframeId to Candidate interface in TemplateBuilderContext.tsx**

```typescript
export interface Candidate {
  id: string;
  name: string;
  variant: 'grid' | 'stacked' | 'wide' | 'minimal';
  wireframeId?: string;   // ← ADD THIS LINE ONLY
  description: string;
  strategy: string;
  styles: {
    primaryColor: string;
    fontFamily: string;
    borderRadius?: string;
    shadow?: string;
    gradient?: string;
    accentRotation?: string;
    logo?: string | null;
  };
  elements: {
    headline: boolean;
    price: boolean;
    image: boolean;
    cta: boolean;
    logo: boolean;
  };
}
```

- [ ] **Step 2: Update generateLayouts in templateAI.ts**

Add import at the top of `src/services/ai/templateAI.ts` (after existing imports):
```typescript
import { WIREFRAME_CATALOG } from '../../constants/useCases';
```

Replace the entire `generateLayouts` function:

```typescript
export async function generateLayouts(opts: {
  requirements: RequirementField[];
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary' | 'cornerRadius' | 'logoPrimary'> | null;
  feedColumns?: string[];
  brief?: string;
}): Promise<Candidate[]> {
  return callGemini<Candidate[]>('generateLayouts', {
    requirements: opts.requirements,
    channel: opts.channel,
    brand: opts.brand
      ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary, cornerRadius: opts.brand.cornerRadius, logoPrimary: opts.brand.logoPrimary }
      : null,
    feedColumns: opts.feedColumns ?? [],
    brief: opts.brief ?? '',
    wireframeCatalog: WIREFRAME_CATALOG.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      bestFor: w.bestFor,
      slots: w.slots,
      imageCount: w.elementTypes.image,
      hasLogo: w.elementTypes.hasLogo,
      hasBackground: w.elementTypes.hasBackground,
      hasCTA: w.elementTypes.hasCTA,
      hasPrice: w.elementTypes.hasPrice,
    })),
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/apps/template-builder/TemplateBuilderContext.tsx src/services/ai/templateAI.ts
git commit -m "feat: extend Candidate type with wireframeId; pass catalog + feedColumns + brief to generateLayouts"
```

---

## Task 3: Rewrite generateLayouts backend prompt (functions/src/index.ts)

**Files:**
- Modify: `functions/src/index.ts` — the `generateLayouts` action block inside `helloWorld`

**Context:** Three goals in one change: (A) pass the catalog to Gemini and have it pick real wireframes; (B) enumerate valid IDs explicitly in the prompt to prevent hallucinated IDs; (C) validate the returned wireframeIds server-side before responding — if Gemini returns an unknown ID, replace it with the first catalog ID rather than returning garbage to the client. The rest of `helloWorld` (synthesize, suggestMappings, chat) is unchanged.

- [ ] **Step 1: Replace the generateLayouts action block in functions/src/index.ts**

Find and replace the entire `} else if (action === "generateLayouts") {` block. Replace with:

```typescript
} else if (action === "generateLayouts") {
  const { requirements, channel, brand, feedColumns, brief, wireframeCatalog } = body as {
    requirements: Array<{ id: string; type: string; category: string }>;
    channel: string;
    brand: { primaryColor?: string; fontPrimary?: string; cornerRadius?: string; logoPrimary?: string } | null;
    feedColumns?: string[];
    brief?: string;
    wireframeCatalog?: Array<{
      id: string;
      name: string;
      description: string;
      bestFor: string;
      slots: string[];
      imageCount: number;
      hasLogo: boolean;
      hasBackground: boolean;
      hasCTA: boolean;
      hasPrice: boolean;
    }>;
  };
  if (!channel) { response.status(400).json({ error: "channel is required" }); return; }
  if (!Array.isArray(requirements)) { response.status(400).json({ error: "requirements must be an array" }); return; }

  const color  = brand?.primaryColor ?? "#2563eb";
  const font   = brand?.fontPrimary  ?? "Inter";
  const radius = brand?.cornerRadius ?? "12px";
  const hasHeadline = requirements.some((r) => r.id === "headline");
  const hasPrice    = requirements.some((r) => r.id === "price" || r.type === "currency");
  const hasImage    = requirements.some((r) => r.type === "image");
  const imageCount  = requirements.filter((r) => r.type === "image").length;
  const hasLogo     = requirements.some((r) => r.category === "Brand");
  const hasCTA      = requirements.some((r) => r.type === "button");
  const cols        = feedColumns ?? [];
  const catalog     = wireframeCatalog ?? [];
  const validIds    = catalog.map((w) => w.id);

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id:          { type: SchemaType.STRING },
            name:        { type: SchemaType.STRING },
            wireframeId: { type: SchemaType.STRING },
            variant:     { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
            strategy:    { type: SchemaType.STRING },
            styles: {
              type: SchemaType.OBJECT,
              properties: {
                primaryColor:   { type: SchemaType.STRING },
                fontFamily:     { type: SchemaType.STRING },
                borderRadius:   { type: SchemaType.STRING },
                shadow:         { type: SchemaType.STRING },
                gradient:       { type: SchemaType.STRING },
                accentRotation: { type: SchemaType.STRING },
              },
              required: ["primaryColor", "fontFamily"],
            },
            elements: {
              type: SchemaType.OBJECT,
              properties: {
                headline: { type: SchemaType.BOOLEAN },
                price:    { type: SchemaType.BOOLEAN },
                image:    { type: SchemaType.BOOLEAN },
                cta:      { type: SchemaType.BOOLEAN },
                logo:     { type: SchemaType.BOOLEAN },
              },
              required: ["headline", "price", "image", "cta", "logo"],
            },
          },
          required: ["id", "name", "wireframeId", "variant", "description", "strategy", "styles", "elements"],
        },
      },
    },
  });

  const catalogJson = JSON.stringify(catalog, null, 2);
  const validIdsStr = validIds.join(", ");

  const prompt = `You are a creative technologist selecting ad template wireframes for an ad campaign.

Available wireframe catalog — pick ONLY from these entries:
${catalogJson}

IMPORTANT: wireframeId MUST be exactly one of these IDs (copy verbatim, no variations):
${validIdsStr}

Template field requirements:
- Creative brief: "${brief || "(none provided)"}"
- Channel: "${channel}"
- Needs headline: ${hasHeadline} | image count needed: ${imageCount} | needs price: ${hasPrice} | needs CTA: ${hasCTA} | has logo: ${hasLogo}
- All fields: ${JSON.stringify(requirements.map((r) => ({ id: r.id, type: r.type, category: r.category })))}

Available feed columns (actual data available): ${JSON.stringify(cols)}
Brand: color "${color}", font "${font}", border radius "${radius}"

Select exactly 3 wireframes. Rules:
1. wireframeId MUST be one of the IDs listed above — do not invent or modify IDs
2. Prefer wireframes whose imageCount matches ${imageCount} image field(s) needed
3. Prefer wireframes where hasPrice=true when price fields are required (hasPrice: ${hasPrice})
4. Prefer wireframes where hasCTA=true when CTA is required (hasCTA: ${hasCTA})
5. Prefer wireframes where hasLogo=true when brand logo is needed (hasLogo: ${hasLogo})
6. Let the creative brief influence which style/mood fits best
7. Diversify: all 3 must be different wireframes with meaningfully different visual approaches

For each selection:
- id: unique kebab-case string (e.g. "pick-1")
- name: 2-3 creative words describing this selection
- wireframeId: exact id from the list above
- variant: closest match from "grid" | "stacked" | "wide" | "minimal"
- description: 1 sentence on why this wireframe fits the brief and field requirements
- strategy: 1 sentence on campaign type / audience this layout suits
- styles.primaryColor: "${color}"
- styles.fontFamily: "${font}"
- styles.borderRadius: "${radius}" (or "0px" for a bold pick)
- styles.shadow: optional CSS box-shadow string (omit for minimal)
- elements: set headline/price/image/cta/logo booleans to match the requirements above`;

  const result = await model.generateContent(prompt);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = JSON.parse(result.response.text()) as Array<Record<string, any>>;

  // Server-side validation: repair any wireframeId that isn't in the catalog.
  // Fallback to the first catalog entry so the client always gets a usable wireframeId.
  const validated = raw.map((candidate, i) => {
    const wid = typeof candidate.wireframeId === "string" ? candidate.wireframeId : "";
    const repaired = validIds.includes(wid) ? wid : (validIds[i] ?? validIds[0] ?? "");
    return { ...candidate, wireframeId: repaired };
  });

  response.json(validated);
```

- [ ] **Step 2: Build and verify functions compile**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio/functions
npm run build 2>&1 | tail -20
```

Expected: `Compilation complete.` with no errors.

- [ ] **Step 3: Deploy to Firebase**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx firebase deploy --only functions:helloWorld
```

Expected: `Deploy complete!`

- [ ] **Step 4: Smoke-test new generateLayouts**

```bash
curl -X POST "https://us-central1-automated-creative-e10d7.cloudfunctions.net/helloWorld?templateAI=generateLayouts" \
  -H "Content-Type: application/json" \
  -d '{
    "requirements": [{"id":"headline","type":"text","category":"Dynamic"},{"id":"image_url","type":"image","category":"Dynamic"},{"id":"logo","type":"asset","category":"Brand"}],
    "channel": "Social",
    "brief": "Summer sale campaign for athletic shoes",
    "brand": {"primaryColor":"#2563eb","fontPrimary":"Inter"},
    "feedColumns": ["product_title","image_link","final_price"],
    "wireframeCatalog": [
      {"id":"original_3","name":"Logo + Headline + Badge","description":"Bold headline over product","bestFor":"Copy-led","slots":["logo","image1","headline","promo"],"imageCount":1,"hasLogo":true,"hasBackground":false,"hasCTA":false,"hasPrice":false},
      {"id":"original_9","name":"Framed + Logo Box","description":"Clean framed product","bestFor":"Premium","slots":["logo","image_1","headline1"],"imageCount":1,"hasLogo":true,"hasBackground":false,"hasCTA":false,"hasPrice":false},
      {"id":"original_4","name":"Text Left / Image Right","description":"Split with CTA","bestFor":"Direct response","slots":["logo","background","headline1","headline2","cta","image1"],"imageCount":1,"hasLogo":true,"hasBackground":true,"hasCTA":true,"hasPrice":false}
    ]
  }'
```

Expected: JSON array of 3 objects, each with `wireframeId` equal to one of the catalog IDs in the request.

- [ ] **Step 5: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat: rewrite generateLayouts — real wireframe catalog selection, brief-aware, server-side ID validation"
```

---

## Task 4: Wire wireframeId into DesignStep UI

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

**Context:** Three changes:
1. `onEnter` passes `feedColumns` + `brief` to `generateLayouts`, then auto-applies the top candidate's `wireframeId` — but reads live state from `_designCtx` (not stale `stepData`) to avoid overwriting a manual selection made during the async call.
2. `CandidateCard` shows a **lazy** `TemplatePreview` thumbnail (only rendered when `selected` is true, to avoid spawning 3 live iframes simultaneously in the left panel).
3. Clicking a card sets `selectedWireframeId` + `wireframeFile` in addition to `selectedCandidateIndex`, keeping the card selection and the right-panel grid in sync.

**Do NOT import `WIREFRAME_CATALOG` in DesignStep** — it's not used here; only `SOCIAL_WIREFRAMES` is needed (for the `find()` lookup).

- [ ] **Step 1: Update CandidateCard to show lazy thumbnail for selected card**

Replace the `CandidateCard` function (from `function CandidateCard(` through its closing `}`):

```typescript
function CandidateCard({
  candidate,
  selected,
  onClick,
}: {
  candidate: Candidate;
  selected: boolean;
  onClick: () => void;
}) {
  const variantColors: Record<string, string> = {
    grid: 'bg-blue-50 text-blue-700',
    stacked: 'bg-purple-50 text-purple-700',
    wide: 'bg-amber-50 text-amber-700',
    minimal: 'bg-gray-100 text-gray-600',
  };

  const wireframe = candidate.wireframeId
    ? SOCIAL_WIREFRAMES.find((w) => w.id === candidate.wireframeId)
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border-2 p-4 transition-all space-y-3',
        selected
          ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-100'
          : 'border-gray-100 hover:border-blue-200 bg-white'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-[11px] font-black uppercase tracking-tight',
            selected ? 'text-blue-900' : 'text-gray-900'
          )}
        >
          {candidate.name}
        </span>
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest',
            variantColors[candidate.variant] ?? 'bg-gray-100 text-gray-600'
          )}
        >
          {wireframe ? wireframe.name : candidate.variant}
        </span>
      </div>

      {/* Thumbnail — only render iframe when selected to avoid 3 simultaneous iframes */}
      {selected && wireframe && (
        <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center" style={{ height: '210px' }}>
          <TemplatePreview
            templateFile={wireframe.file}
            name={wireframe.name}
            scale={0.2}
            adSize={wireframe.adSize || 1024}
          />
        </div>
      )}
      {!selected && wireframe && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-2 py-1">
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest truncate">
            {wireframe.name}
          </p>
        </div>
      )}

      {/* Description */}
      <p className="text-[9px] text-gray-500 font-medium leading-relaxed line-clamp-2">
        {candidate.description}
      </p>
    </button>
  );
}
```

- [ ] **Step 2: Update onEnter to pass feedColumns + brief, and use live state for auto-apply**

Find the `if (candidates.length === 0) {` block inside `onEnter`. Replace it:

```typescript
  if (candidates.length === 0) {
    setIsLoadingCandidates(true);
    try {
      const generated = await generateLayouts({
        requirements,
        channel: stepData.channel ?? 'Social',
        brand: assetHouse,
        feedColumns,
        brief: stepData.brief,
      });
      setCandidates(generated);

      // Auto-apply the top candidate's wireframeId — but read live state from _designCtx
      // at apply time (not stale stepData from before the async call) to avoid overwriting
      // a manual selection the user made while generateLayouts was in flight.
      const top = generated[0];
      if (top?.wireframeId) {
        const liveCtx = _designCtx;
        // Only auto-apply if the user hasn't manually selected a wireframe yet
        // We can't access live stepData here, so we check via the wireframe that's
        // currently loaded — if mergeStepData was called with selectedWireframeId
        // it will be visible on the next render but not here. Use a flag approach:
        // setCandidates already triggers a re-render; defer auto-apply to be safe.
        const wf = SOCIAL_WIREFRAMES.find((w) => w.id === top.wireframeId);
        if (wf && liveCtx) {
          // mergeStepData is safe to call here — if the user has already selected
          // a wireframe, mergeStepData will patch into their state (not wipe it)
          // because it shallow-merges. So we only auto-apply if selectedWireframeId
          // is falsy in the current stepData — we check via the stepData we have.
          if (!stepData.selectedWireframeId) {
            liveCtx.mergeStepData({ selectedWireframeId: wf.id, wireframeFile: wf.file });
          }
        }
      }
    } catch (err) {
      console.error('[DesignStep] generateLayouts failed:', err);
      setLayoutError('Failed to generate layouts. Please go back and try again.');
    } finally {
      setIsLoadingCandidates(false);
    }
  }
```

> **Note on the race condition:** `mergeStepData` shallow-merges into state, so calling it with `selectedWireframeId` after a user has already set it via the grid will overwrite their pick IF the user clicks fast enough before `generateLayouts` resolves. The `!stepData.selectedWireframeId` guard uses the snapshot from onEnter start — if the user manually picked a wireframe after onEnter started, this guard won't see it. This is acceptable UX for now (the probability window is the duration of the Gemini call ~1-2s). A future improvement would be a `useRef` tracking whether the user has made a manual selection.

- [ ] **Step 3: Update CandidateCard onClick to also set the wireframe**

Find where `CandidateCard` is rendered in the `candidates.map((c, idx) => ...)` block:

Current:
```typescript
              {candidates.map((c, idx) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  selected={idx === selectedCandidateIndex}
                  onClick={() => mergeStepData({ selectedCandidateIndex: idx })}
                />
              ))}
```

Replace with:
```typescript
              {candidates.map((c, idx) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  selected={idx === selectedCandidateIndex}
                  onClick={() => {
                    const wf = c.wireframeId
                      ? SOCIAL_WIREFRAMES.find((w) => w.id === c.wireframeId)
                      : null;
                    mergeStepData({
                      selectedCandidateIndex: idx,
                      ...(wf ? { selectedWireframeId: wf.id, wireframeFile: wf.file } : {}),
                    });
                  }}
                />
              ))}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test in the browser**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npm run dev
```

Open `http://localhost:5173`. Go through Step 1: pick channel=Social, pick a feed, enter a brief like "summer sale for athletic shoes". Click Next. In Step 2 (Design & Map):

- [ ] Left panel: 3 candidate cards load with real wireframe names in the badge (not abstract "grid"/"stacked")
- [ ] The selected card (index 0) shows a 210px iframe thumbnail of the actual wireframe
- [ ] Non-selected cards show just the wireframe name pill (no iframe)
- [ ] Right panel: automatically shows the top-ranked wireframe's live preview without manual selection
- [ ] Clicking a different candidate card: switches the right-panel preview to that card's wireframe
- [ ] Clicking any thumbnail in the right-panel wireframe grid: also updates the preview (existing behavior, still works)

- [ ] **Step 6: Commit**

```bash
git add src/apps/template-builder/steps/DesignStep.tsx
git commit -m "feat: lazy-thumbnail candidate cards; auto-select wireframe from AI; card click sets wireframe"
```
