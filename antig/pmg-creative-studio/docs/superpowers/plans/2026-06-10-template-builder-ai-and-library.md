# Template Builder AI Wiring + Library Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3 mocked AI functions in the template builder with real Gemini 2.0 Flash calls via Firebase Cloud Functions, and add a Template Library browse page where users can view their published templates.

**Architecture:** Three new Firebase Cloud Functions (Gen 1, `onCall`) in `functions/src/template.ts` call Gemini 2.0 Flash with structured JSON output. The client-side `templateAI.ts` service is updated to call these functions via `httpsCallable` instead of the mock `setTimeout` implementations. A new `TemplateLibraryPage` React component reads published templates from Firestore via the existing `templateLibraryService` and is wired into the router and dashboard.

**Tech Stack:** Firebase Cloud Functions v1 (`firebase-functions`), `@google/generative-ai` (already installed in `functions/`), `httpsCallable` from `firebase/functions` (already used in the client), React + React Router v6, existing `templateLibraryService` + `TemplateLibraryRecord` types.

**Branch:** `feature/template-library` — all work goes on this branch.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `functions/src/template.ts` | **Create** | 3 Cloud Functions: synthesize, generateLayouts, suggestMappings |
| `functions/src/index.ts` | **Modify** | Export `* from "./template"` |
| `src/services/ai/templateAI.ts` | **Modify** | Replace 3 mocks with `httpsCallable` calls |
| `src/pages/TemplateLibraryPage.tsx` | **Create** | Browse + display published templates |
| `src/App.tsx` | **Modify** | Add `/adlabs/:clientSlug/templates` route |
| `src/pages/DashboardPage.tsx` | **Modify** | Add "Template Library" link card |

---

## Task 1: Create `functions/src/template.ts` with 3 Cloud Functions

**Files:**
- Create: `functions/src/template.ts`

This file exports three `onCall` Cloud Functions. All use the existing `GEMINI_API_KEY` Firebase secret and `@google/generative-ai`. The pattern mirrors `functions/src/ai.ts` exactly — same secret setup, same `GoogleGenerativeAI` init inside the handler, same `responseMimeType: "application/json"` for structured output.

- [ ] **Step 1: Create the file**

```typescript
// functions/src/template.ts
import * as functions from "firebase-functions";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const MODEL = "gemini-2.0-flash";

// ── synthesizeRequirementsAI ──────────────────────────────────────────────────
// Input:  { brief: string, channel: string, brand: { primaryColor?: string, fontPrimary?: string } | null }
// Output: RequirementField[]
export const synthesizeRequirementsAI = functions
  .runWith({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: {
    brief: string;
    channel: string;
    brand: { primaryColor?: string; fontPrimary?: string } | null;
  }) => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id:       { type: SchemaType.STRING },
              label:    { type: SchemaType.STRING },
              category: { type: SchemaType.STRING },
              source:   { type: SchemaType.STRING },
              type:     { type: SchemaType.STRING },
            },
            required: ["id", "label", "category", "source", "type"],
          },
        },
      },
    });

    const prompt = `You are a creative technologist building ad templates. Given a creative brief, target channel, and brand context, determine what data fields the template needs.

Brief: "${data.brief || '(no brief provided)'}"
Channel: "${data.channel}"
Brand primary color: "${data.brand?.primaryColor ?? 'unknown'}"
Brand font: "${data.brand?.fontPrimary ?? 'Inter'}"

Return a JSON array of required fields. Rules:
- id: snake_case identifier (e.g. "headline", "product_image", "sale_price")
- label: human-readable label (e.g. "Headline", "Product Image", "Sale Price")
- category: exactly one of "Brand" (from brand kit), "Dynamic" (from feed), "System" (user preset)
- source: exactly one of "Feed", "Creative House", "User Preset"
- type: exactly one of "text", "image", "currency", "button", "asset"

Always include:
- { id: "headline", label: "Headline", category: "Dynamic", source: "Feed", type: "text" }
- { id: "logo", label: "Brand Logo", category: "Brand", source: "Creative House", type: "asset" }

Also include if channel is Social or Programmatic:
- { id: "image_url", label: "Product Image", category: "Dynamic", source: "Feed", type: "image" }
- { id: "cta", label: "Call to Action", category: "System", source: "User Preset", type: "button" }

Also include if brief mentions product, sale, deal, price, shop, or buy (or brief is empty):
- { id: "price", label: "Price", category: "Dynamic", source: "Feed", type: "currency" }`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text()) as unknown[];
  });

// ── generateLayoutsAI ────────────────────────────────────────────────────────
// Input:  { requirements: RequirementField[], channel: string, brand: { primaryColor?, fontPrimary?, cornerRadius?, logoPrimary? } | null }
// Output: Candidate[] (exactly 3)
export const generateLayoutsAI = functions
  .runWith({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: {
    requirements: Array<{ id: string; type: string; category: string }>;
    channel: string;
    brand: { primaryColor?: string; fontPrimary?: string; cornerRadius?: string; logoPrimary?: string } | null;
  }) => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id:          { type: SchemaType.STRING },
              name:        { type: SchemaType.STRING },
              variant:     { type: SchemaType.STRING },
              description: { type: SchemaType.STRING },
              strategy:    { type: SchemaType.STRING },
              styles: {
                type: SchemaType.OBJECT,
                properties: {
                  primaryColor:    { type: SchemaType.STRING },
                  fontFamily:      { type: SchemaType.STRING },
                  borderRadius:    { type: SchemaType.STRING },
                  shadow:          { type: SchemaType.STRING },
                  gradient:        { type: SchemaType.STRING },
                  accentRotation:  { type: SchemaType.STRING },
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
            required: ["id", "name", "variant", "description", "strategy", "styles", "elements"],
          },
        },
      },
    });

    const color  = data.brand?.primaryColor ?? "#2563eb";
    const font   = data.brand?.fontPrimary  ?? "Inter";
    const radius = data.brand?.cornerRadius ?? "12px";

    const hasHeadline = data.requirements.some((r) => r.id === "headline");
    const hasPrice    = data.requirements.some((r) => r.id === "price" || r.type === "currency");
    const hasImage    = data.requirements.some((r) => r.type === "image");
    const hasLogo     = data.requirements.some((r) => r.category === "Brand");
    const hasCTA      = data.requirements.some((r) => r.type === "button");

    const prompt = `You are a visual ad creative director. Propose exactly 3 distinct layout candidates for a ${data.channel} ad template.

Brand color: "${color}", font: "${font}", border radius: "${radius}"
Required elements — headline: ${hasHeadline}, image: ${hasImage}, price: ${hasPrice}, cta: ${hasCTA}, logo: ${hasLogo}

Return exactly 3 candidates. Each must be meaningfully different (e.g. editorial, bold/high-contrast, minimal/premium).

For each:
- id: kebab-case unique identifier
- name: creative 2-3 word name
- variant: one of "grid", "stacked", "wide", "minimal"
- description: 1 sentence describing the visual approach
- strategy: 1 sentence on when/why to use it (campaign type, audience)
- styles.primaryColor: use "${color}"
- styles.fontFamily: use "${font}"
- styles.borderRadius: use "${radius}" (or "0px" for a bold variant)
- styles.shadow: optional box-shadow CSS string (omit for minimal)
- styles.gradient: optional CSS gradient using "${color}" (omit for minimal)
- styles.accentRotation: optional slight skew like "-2deg" (bold variant only)
- elements.headline: ${hasHeadline}
- elements.price: ${hasPrice}
- elements.image: ${hasImage}
- elements.cta: ${hasCTA}
- elements.logo: ${hasLogo}`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text()) as unknown[];
  });

// ── suggestMappingsAI ────────────────────────────────────────────────────────
// Input:  { requirements: RequirementField[], feedColumns: string[] }
// Output: Record<string, string>  (fieldId → columnName)
export const suggestMappingsAI = functions
  .runWith({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data: {
    requirements: Array<{ id: string; label: string; category: string; type: string }>;
    feedColumns: string[];
  }) => {
    if (data.feedColumns.length === 0) return {};

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          // Dynamic keys — Gemini will produce { fieldId: columnName, ... }
        },
      },
    });

    const mappable = data.requirements.filter(
      (r) => r.category === "Dynamic" && r.type !== "button" && r.type !== "asset"
    );
    if (mappable.length === 0) return {};

    const prompt = `You are a data mapping assistant for ad templates.

Template fields to map (Dynamic fields only, no buttons or assets):
${JSON.stringify(mappable.map((r) => ({ id: r.id, label: r.label, type: r.type })))}

Available feed columns:
${JSON.stringify(data.feedColumns)}

Map each template field ID to the most semantically appropriate feed column name.
Return a flat JSON object: { "fieldId": "columnName" }
Only include fields you are confident about. Skip fields with no good match.
Example output: { "headline": "product_title", "image_url": "image_link", "price": "final_price" }`;

    const result = await model.generateContent(prompt);
    const raw = JSON.parse(result.response.text()) as Record<string, unknown>;

    // Ensure only string→string entries make it through
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") safe[k] = v;
    }
    return safe;
  });
```

- [ ] **Step 2: Verify the file compiles in the functions package**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio/functions
npx tsc --noEmit
```

Expected: no errors. If you see `Cannot find name 'SchemaType'` — it's already in `@google/generative-ai@0.24.1` which is already installed. If you see module errors, run `npm install` in the `functions/` directory first.

- [ ] **Step 3: Commit**

```bash
git add functions/src/template.ts
git commit -m "feat: add 3 Gemini Cloud Functions for template AI (synthesize, generateLayouts, suggestMappings)"
```

---

## Task 2: Export template functions from `functions/src/index.ts`

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Add the export**

Open `functions/src/index.ts`. After the existing exports, add:

```typescript
export * from "./template";
```

The full file should look like:

```typescript
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export * from "./alliProxy";
export * from "./ai";
export * from "./video";
export * from "./resize";
export * from "./datasources";
export * from "./template";   // ← add this line

export const helloWorld = functions.https.onRequest((request, response) => {
    functions.logger.info("Hello logs!", { structuredData: true });
    response.send("PMG Creative Studio Backend is running!");
});
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio/functions
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat: export template Cloud Functions from index"
```

---

## Task 3: Update `src/services/ai/templateAI.ts` to call Cloud Functions

**Files:**
- Modify: `src/services/ai/templateAI.ts`

Replace all 3 mock implementations with `httpsCallable` calls. The existing `functions` export is at `src/firebase.ts`. The existing pattern (from `src/services/videoService.ts`) is:
```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
const fn = httpsCallable(functions, 'functionName', { timeout: 60000 });
const result = await fn(inputData);
return result.data as OutputType;
```

- [ ] **Step 1: Rewrite the file**

```typescript
// src/services/ai/templateAI.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import type { RequirementField, Channel } from '../../apps/template-builder/types';
import type { ClientAssetHouse } from '../clientAssetHouse';
import type { Candidate } from '../../apps/template-builder/TemplateBuilderContext';

const _synthesize = httpsCallable<
  { brief: string; channel: string; brand: { primaryColor?: string; fontPrimary?: string } | null },
  RequirementField[]
>(functions, 'synthesizeRequirementsAI', { timeout: 60000 });

const _generateLayouts = httpsCallable<
  { requirements: RequirementField[]; channel: string; brand: { primaryColor?: string; fontPrimary?: string; cornerRadius?: string; logoPrimary?: string } | null },
  Candidate[]
>(functions, 'generateLayoutsAI', { timeout: 60000 });

const _suggestMappings = httpsCallable<
  { requirements: RequirementField[]; feedColumns: string[] },
  Record<string, string>
>(functions, 'suggestMappingsAI', { timeout: 30000 });

export async function synthesizeRequirements(opts: {
  brief: string;
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary'> | null;
}): Promise<RequirementField[]> {
  const result = await _synthesize({
    brief: opts.brief,
    channel: opts.channel,
    brand: opts.brand ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary } : null,
  });
  return result.data;
}

export async function generateLayouts(opts: {
  requirements: RequirementField[];
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary' | 'cornerRadius' | 'logoPrimary'> | null;
}): Promise<Candidate[]> {
  const result = await _generateLayouts({
    requirements: opts.requirements,
    channel: opts.channel,
    brand: opts.brand
      ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary, cornerRadius: opts.brand.cornerRadius, logoPrimary: opts.brand.logoPrimary }
      : null,
  });
  return result.data;
}

export async function suggestMappings(opts: {
  requirements: RequirementField[];
  feedColumns: string[];
}): Promise<Record<string, string>> {
  const result = await _suggestMappings({
    requirements: opts.requirements,
    feedColumns: opts.feedColumns,
  });
  return result.data;
}
```

- [ ] **Step 2: Run TypeScript check on the client**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
npm test -- --run
```

Expected: same 332 passing tests. The template builder tests mock the AI functions so they are unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai/templateAI.ts
git commit -m "feat: wire templateAI.ts to real Gemini Cloud Functions via httpsCallable"
```

---

## Task 4: Create `src/pages/TemplateLibraryPage.tsx`

**Files:**
- Create: `src/pages/TemplateLibraryPage.tsx`

This page is mounted at `/adlabs/:clientSlug/templates`. It fetches published templates via `templateLibraryService.getPublishedTemplates(clientSlug)` and renders them as cards. Mirrors the visual style of the existing `WizardShell` chrome (back link, title, white content card).

- [ ] **Step 1: Create the file**

```tsx
// src/pages/TemplateLibraryPage.tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { ArrowLeftIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { templateLibraryService } from '../services/templateLibrary';
import type { TemplateLibraryRecord } from '../services/templateLibrary.types';
import type { ClientSlug } from '../platform/firebase/paths';
import { cn } from '../utils/cn';

const CHANNEL_COLORS: Record<string, string> = {
  social:       'bg-blue-50 text-blue-700',
  programmatic: 'bg-purple-50 text-purple-700',
  print:        'bg-green-50 text-green-700',
  signage:      'bg-amber-50 text-amber-700',
};

export default function TemplateLibraryPage() {
  usePageTitle('Template Library');
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const [templates, setTemplates] = useState<TemplateLibraryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientSlug) return;
    setIsLoading(true);
    setError(null);
    templateLibraryService
      .getPublishedTemplates(clientSlug as ClientSlug)
      .then(setTemplates)
      .catch((err: unknown) => setError((err as Error).message ?? 'Failed to load templates'))
      .finally(() => setIsLoading(false));
  }, [clientSlug]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          to={`/adlabs/${clientSlug}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-gray-500 hover:text-blue-600"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to workflows
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900">Template Library</h1>
        <p className="mt-1 text-sm text-blue-gray-600">
          Published templates ready for use across campaigns.
        </p>
      </div>

      {/* Content card */}
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-card">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-100 p-6 space-y-3">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 text-center py-8">{error}</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-16">
            <DocumentDuplicateIcon className="h-10 w-10 text-gray-200 mx-auto mb-4" />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-300">
              No templates yet
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Build your first template using the{' '}
              <Link
                to={`/adlabs/${clientSlug}/template-builder`}
                className="text-blue-600 hover:underline"
              >
                Template Builder
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ template: t }: { template: TemplateLibraryRecord }) {
  const channelColor = CHANNEL_COLORS[t.channel] ?? 'bg-gray-100 text-gray-600';
  const sizes = t.adSizes
    .map((s) => (s.label ? s.label : `${s.width}×${s.height}`))
    .join(', ');
  const publishedDate = t.publishedAt
    ?.toDate()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="rounded-xl border border-gray-100 p-5 space-y-3 hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
          {t.name}
        </p>
        <span
          className={cn(
            'shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest',
            channelColor
          )}
        >
          {t.channel}
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate">
          {t.datasourceName || t.datasourceId}
        </p>
        {sizes && (
          <p className="text-[10px] text-gray-400">{sizes}</p>
        )}
        <p className="text-[10px] text-gray-400">
          {Object.keys(t.fieldMappings).length} field{Object.keys(t.fieldMappings).length !== 1 ? 's' : ''} mapped
        </p>
      </div>

      {publishedDate && (
        <p className="text-[9px] font-medium text-gray-300">Published {publishedDate}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TemplateLibraryPage.tsx
git commit -m "feat: add TemplateLibraryPage — browse published templates per client"
```

---

## Task 5: Wire route in `App.tsx` + add link in `DashboardPage.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/DashboardPage.tsx`

**Part A — Route in App.tsx**

- [ ] **Step 1: Import the page and add the route**

In `src/App.tsx`, find the existing import block for page components. Add:

```typescript
import TemplateLibraryPage from './pages/TemplateLibraryPage';
```

Then inside the `<Routes>` block, after the `template-builder` route (around line 122), add:

```tsx
<Route
  path="/adlabs/:clientSlug/templates"
  element={<TemplateLibraryPage />}
/>
```

**Part B — Link in DashboardPage.tsx**

- [ ] **Step 2: Add a "Template Library" quick-link below the app grid**

In `src/pages/DashboardPage.tsx`, find where the component returns its JSX. After the app registry grid section, add a quick-link row. Find the closing of the main content area and add:

```tsx
{/* Template Library quick link */}
{client && (
  <div className="mt-4 pt-4 border-t border-gray-100">
    <Link
      to={`/adlabs/${clientSlug}/templates`}
      className="inline-flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-[0.15em] hover:text-blue-600 transition-colors"
    >
      <DocumentDuplicateIcon className="h-4 w-4" />
      View Template Library
    </Link>
  </div>
)}
```

Also add the import at the top of DashboardPage.tsx — `DocumentDuplicateIcon` is already imported from `@heroicons/react/24/outline` in most files; add it to the existing heroicons import if it isn't there. Also add the `Link` import from `react-router-dom` if not already present (it is already imported on line 2).

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
npm test -- --run
```

Expected: 332 passing.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/DashboardPage.tsx
git commit -m "feat: wire /adlabs/:clientSlug/templates route + dashboard link to Template Library"
```

---

## Testing the full flow

After all 5 tasks are complete, test end-to-end on localhost:

1. **Deploy functions to emulator or dev project:**
   ```bash
   cd functions && npm run build
   firebase deploy --only functions:synthesizeRequirementsAI,functions:generateLayoutsAI,functions:suggestMappingsAI --project <dev-project-id>
   ```
   Or use the Firebase emulator:
   ```bash
   firebase emulators:start --only functions
   ```

2. **Open template builder** at `http://localhost:5177/adlabs/ralph_lauren/template-builder`

3. **Complete Step 1** — fill in template name, channel, ratio, pick a feed, write a brief. Click "Next: Design & Map →". The loading overlay should appear. In the console you should see the `synthesizeRequirementsAI` function being called.

4. **On Step 2** — candidates should load (generated by `generateLayoutsAI`), feed column dropdowns should auto-populate (from `suggestMappingsAI`).

5. **Complete Step 3** — publish. Then navigate to `http://localhost:5177/adlabs/ralph_lauren/templates` — the published template should appear.

---

## Notes for implementer

- **GEMINI_API_KEY** is already set as a Firebase secret in this project. You do NOT need to create a new secret.
- The `@google/generative-ai` package (`v0.24.1`) is already in `functions/package.json`. You do NOT need to `npm install` anything.
- The `SchemaType` enum from `@google/generative-ai` is used in `functions/src/ai.ts` — same import pattern works here.
- `suggestMappingsAI` uses an open-ended object schema (no `properties` defined) because the keys are dynamic field IDs. Gemini handles this fine with `responseMimeType: "application/json"` and a clear prompt.
- The Cloud Functions are Gen 1 (`functions.runWith(...).https.onCall`). Do NOT convert to Gen 2 — the rest of the codebase uses Gen 1.
- If Gemini returns malformed JSON (rare), the `JSON.parse` will throw and Firebase will return an `internal` error to the client. The existing error handling in `DesignStep.tsx` (`setLayoutError`) will surface this to the user.
