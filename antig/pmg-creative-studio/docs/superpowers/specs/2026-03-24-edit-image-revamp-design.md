# Edit Image Revamp — Design Spec

**Date:** 2026-03-24
**Branch:** `new_layers`
**Type:** Prototype/Pitch (not production)

## Goal

Transform the edit-image workflow from a dumb sequential editor into an AI-guided creative decision tool. Inject real creative analysis data from Alli's platform and generate actionable recommendations that guide users toward better creative decisions.

## Data Layer

### Source A — Alli `creative_insights_data_export` (existing, no new proxy)

**Two-query flow:**

1. **Grid population** (existing) — `getCreativeAssets()` fetches the asset list with `ci_ad_id`, `url`, `creative_type`, `platform`. Already implemented and cached.

2. **Analysis fetch** (new, on image selection) — call `alliService.executeQuery()` with the selected asset's `ci_ad_id`:

```typescript
const result = await alliService.executeQuery(clientSlug, 'creative_insights_data_export', {
  dimensions: [
    'ci_ad_id', 'image_vision_analysis', 'brand_visuals',
    'call_to_action_text', 'fatigue_status'
  ],
  measures: ['ctr', 'cpm'],
  limit: 50
});
// Client-side filter to match selected asset
const match = result.results.find(r => r.ci_ad_id === selectedAssetId);
```

Note: `executeQuery()` does not support server-side filters. We fetch a batch (limit 50) and filter client-side by `ci_ad_id`. For the prototype this is acceptable.

**Data parsing requirements:**

- `image_vision_analysis` arrives as a **JSON string** (e.g., `"{\"text\":[...],\"colors\":[...]}"`) and must be parsed via `JSON.parse()` to produce an `ImageAnalysis` object.
- Scorecard values are **string literals**, not native types: `"false"` not `false`, `"null"` not `null`. Parse with: `val === 'true'` for booleans, `val === 'null' ? null : parseFloat(val)` for measures.

### Source B — `ClientAssetHouse` (existing)

Brand colors, fonts, and logos already stored per client. Used to cross-reference against the image's dominant colors for brand alignment analysis. The brand logo (`assetHouse.logoPrimary`) is displayed in the Selected Image Panel.

### Recommendation Translator — Replicate (cheap text model)

- Client-side fetch to Replicate's HTTP API: `POST https://api.replicate.com/v1/predictions`
- **CORS note:** Replicate API does not allow browser-origin CORS requests. Use a dedicated Vite dev proxy at `/replicate-recommend` (separate from the existing `/replicate-api` used by SAM segmentation, for debuggability)
- Auth: `VITE_REPLICATE_API_TOKEN` env var, sent as `Authorization: Bearer <token>`
- Model: `meta/llama-3.1-8b-instruct` or similar cheap/fast text model (no vision needed — we already have structured data)

**Prompt template:**

```
You are a creative strategist analyzing an advertising image. Based on the data below, provide exactly 3 recommendations as a JSON array.

IMAGE ANALYSIS:
- Dominant colors: {colors with hex and percentage}
- Detected objects: {objects}
- Detected labels: {labels}
- Text found: {text}
- Has brand visuals: {brand_visuals}
- Has call-to-action text: {call_to_action_text}
- Fatigue status: {fatigue_status}
- CTR: {ctr or "not available"}
- CPM: {cpm or "not available"}

BRAND STANDARDS:
- Brand colors: {hex values from ClientAssetHouse}
- Brand name: {client name}

Respond ONLY with a JSON array of 3 objects, each with:
{ "category": "hero-text"|"visuals-background"|"brand-alignment", "title": "short title", "description": "2-3 sentence recommendation", "confidence": "high"|"medium"|"low", "dataChips": ["relevant data points"], "actionType": "background"|"text"|"colors", "isTopRecommendation": true|false }

Set isTopRecommendation: true for exactly one recommendation (the most impactful).
Set confidence based on how much supporting data exists for the recommendation.
```

- 5-second timeout; fallback to template-based recommendations built from raw Alli data
- **JSON extraction:** LLMs may wrap JSON in markdown code fences or add preamble. Use an `extractJSON()` helper that strips fences and finds the first `[` to `]` match before parsing
- Called once per image selection, result cached in `stepData`

### No new backend required

No new Firebase proxy functions for Alli. Replicate CORS may require a Vite proxy rule or small Firebase function (see above). No changes to auth flow.

## Step Consolidation

### Current Flow (6 steps)
Select Image -> Edit Type -> Canvas -> New Background -> Preview -> Save

### Revamped Flow (5 steps)

```typescript
// Updated WIZARD_STEPS['edit-image'] in UseCaseWizardPage.tsx
'edit-image': [
  { id: 'select-analyze', name: 'Select & Analyze' },
  { id: 'canvas', name: 'Canvas' },
  { id: 'new-background', name: 'New Background' },
  { id: 'preview', name: 'Preview' },
  { id: 'approve', name: 'Save' },
]
```

**Step validation for `select-analyze`:** requires both `imageUrl` AND `editType` before advancing (combines the two previous step validations).

**Routing:** The `EditImageWizard` switch statement gets a new `'select-analyze'` case that renders the merged `SelectAnalyzeStep` component, replacing both `SelectImageStep` and `ChooseEditTypeStep`.

## UI Components

### Step 1: Select & Analyze

**Layout:**
- Two-column top section: image grid (left ~60%), selected image + brand example (right ~40%)
- Full-width AI Recommendations section below

**Image Grid:**
- Tabs: "Alli Library" / "Upload"
- Static image guard: filter to `creative_type === 'image'` only (existing proxy already excludes `creative_type === 'thumbnail'` at line 833 of UseCaseWizardPage.tsx — no duplicate filtering needed)
- Existing pagination and search

**Selected Image Panel:**
- Large preview with image name and platform badge
- Brand logo (`assetHouse.logoPrimary`) from `ClientAssetHouse` displayed below the preview

**Upload path (no Alli data):**
- When a user uploads an image (no `ci_ad_id`), skip the AI Recommendations section entirely
- Show only the Edit Type Cards — user picks manually
- No Alli query, no Replicate call

**AI Recommendations Section (3 cards, full width — Alli images only):**
- Loading: skeleton cards with pulse animation (~2-3s)
- Each card has:
  - Category icon + title (Hero Text / Visuals & Background / Brand Alignment)
  - 2-3 sentence natural language recommendation
  - Data chips (e.g., dominant color swatches, detected labels)
  - Action button: "Apply" — sets `editType` in stepData to the card's `actionType` and auto-advances to the Canvas step
- Top recommendation: purple border ring + "AI Recommends" pill badge

**Edit Type Cards (secondary row):**
- Same 3 cards: Background / Text / Colors
- Text and Colors show "Coming Soon" badge
- AI-recommended card gets matching purple ring treatment
- User can ignore AI and pick any card manually — clicking sets `editType` and advances

**Action button behavior:** Clicking "Apply" on a recommendation card OR clicking an Edit Type card both: (1) set `stepData.editType` to the corresponding type, (2) auto-advance to Canvas step (increment `currentStep`). The user does NOT need to separately click "Next".

### Step 3: New Background (enhanced)

**New top section — "Recommended for You":**
- Color swatches: cross-reference image dominant colors with brand palette
- Hex values displayed below each swatch
- 2-3 recommended background thumbnails — for the prototype, hardcoded per demo client or pulled from top Alli library images with complementary dominant colors
- Attribution line: "Based on brand standards and creative analysis"

**Existing sections remain unchanged:**
- Brand Colors (from `ClientAssetHouse`)
- Background Image (browse Alli / upload)

## Types

```typescript
interface ImageAnalysis {
  colors: { hexColor: string; imagePercentage: number }[];
  labels: string[];
  objects: string[];
  text: string[];
  faces: { joyLikelihood: string; angerLikelihood: string; sorrowLikelihood: string; surpriseLikelihood: string }[];
  links: string[];
}

interface CreativeRecommendation {
  category: 'hero-text' | 'visuals-background' | 'brand-alignment';
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  dataChips: string[];
  actionType: 'background' | 'text' | 'colors';
  isTopRecommendation: boolean;
}
```

**Updates to `EditImageStepData` (in `src/components/edit-image/types.ts`):**

```typescript
// New fields for Select & Analyze step
imageAnalysis?: ImageAnalysis;
recommendations?: CreativeRecommendation[];
scorecardData?: {
  brandVisuals: boolean;
  callToActionText: boolean;
  fatigueStatus: string | null;
  ctr: number | null;
  cpm: number | null;
};
```

**Confidence derivation (for prototype):** Determined by the LLM based on how much supporting data exists. If using template fallback, default to `'medium'` for all.

## Template Fallback Recommendations

If Replicate fails or times out, generate recommendations from raw Alli data:

```typescript
function buildFallbackRecommendations(analysis: ImageAnalysis, scorecard, brandColors: string[]): CreativeRecommendation[] {
  return [
    {
      category: 'hero-text',
      title: scorecard.callToActionText ? 'CTA Detected' : 'Missing Call-to-Action',
      description: scorecard.callToActionText
        ? `Your image includes text: "${analysis.text.slice(0, 5).join(', ')}". Consider whether it aligns with campaign goals.`
        : 'No call-to-action text detected. Adding a CTA could improve engagement.',
      confidence: 'medium',
      dataChips: analysis.text.slice(0, 3),
      actionType: 'text',
      isTopRecommendation: false,
    },
    {
      category: 'visuals-background',
      title: 'Background Opportunity',
      description: `Dominant colors are ${analysis.colors.slice(0, 2).map(c => c.hexColor).join(', ')}. ${brandColors.length ? `Your brand palette includes ${brandColors.slice(0, 2).join(', ')} — consider aligning.` : ''}`,
      confidence: 'medium',
      dataChips: analysis.colors.slice(0, 3).map(c => c.hexColor),
      actionType: 'background',
      isTopRecommendation: true,
    },
    {
      category: 'brand-alignment',
      title: scorecard.brandVisuals ? 'Brand Visuals Present' : 'Brand Visuals Missing',
      description: scorecard.brandVisuals
        ? 'Brand elements are detected in this creative. Maintaining consistency across campaigns.'
        : 'No brand visuals detected. Consider adding brand colors or logo to strengthen recognition.',
      confidence: 'medium',
      dataChips: scorecard.brandVisuals ? ['Brand detected'] : ['No brand elements'],
      actionType: 'colors',
      isTopRecommendation: false,
    },
  ];
}
```

## Scope Boundaries

**In scope:**
- `SelectAnalyzeStep` merged component with AI recommendations
- Enhanced New Background step with recommended colors/images
- Replicate integration for recommendation narrative (with Vite proxy or Firebase function for CORS)
- Static image filtering
- Background edit flow end-to-end

**Out of scope (skeleton only):**
- Hero Text edit flow (visible card, "Coming Soon")
- Colors edit flow (visible card, "Coming Soon")
- Performance-based recommendations (only if `ctr`/`cpm` are non-null)

**Unchanged:**
- Canvas step / MaskEditorModal
- Preview step
- Save step
- Firebase functions (unless Replicate CORS requires one)
- Auth flow
- Other use cases

## Reference Materials

- Hand-drawn sketches: `docs/referances/edit-image-revamp/revamp-sketch-01.png`, `revamp-sketch-02.png`
- Production UI screenshots: `docs/referances/edit-image-revamp/production-ui-flow/`
- Current prototype screenshots: `docs/referances/edit-image-revamp/prototype-ui-flow/`
- Alli API query output: `docs/referances/edit-image-revamp/query-03-out.txt`
