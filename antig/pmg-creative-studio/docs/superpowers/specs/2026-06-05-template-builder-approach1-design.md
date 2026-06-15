# Template Builder — Approach 1: Incremental Polish

**Date:** 2026-06-05  
**Author:** Engineering / AI  
**Status:** Ready for agentic execution  
**Scope:** Incremental hardening of the existing 7-step wizard. No structural changes to step count or routing. All file paths are relative to `antig/pmg-creative-studio/src/`.

---

## Goals

1. Replace all mocked handlers with real Claude API calls.
2. Fix dead-end channels — Programmatic, Print, Digital Signage currently show "No templates available" and have no wireframe sets.
3. Eliminate 3–4 duplicate `clientAssetHouseService.getAssetHouse()` calls (one per step) via a shared React context.
4. Replace `window.prompt` / `window.alert` with proper inline modals.
5. Rewrite ExportStep: replace batch + placeholder images with Template Library publish flow.
6. Implement the `manifest.onMount` TODO (preloads for templates, data sources, asset house).
7. Wire ContextStep's "Historical Saved Templates" — currently shows stubs.

---

## What Does NOT Change

- `WizardShell.tsx` — runtime is correct, keep it.
- `usePersistedStepData.ts` — persistence layer is correct.
- `FilledTemplatePreview.tsx` + `injectIntoHtml.ts` — iframe injection works.
- `TemplatePreview.tsx` — used in wireframe library, keep it.
- `SourceStep.tsx` — feed list + sample fetch is solid, minor UX tweaks only.
- `MappingStep.tsx` — field mapping logic is correct; only remove duplicate asset house fetch.
- `baseline.ts` — keep as-is.
- `_registry.ts` — keep as-is.
- `WizardStep` / `AppManifest` type contracts — keep as-is.

---

## Architecture Changes

### A. `AssetHouseContext`

**New file:** `platform/assetHouse/AssetHouseContext.tsx`

```typescript
// Fetches asset house once. All steps read from context, none call the service directly.
interface AssetHouseContextValue {
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  error: string | null;
}
export const AssetHouseContext = createContext<AssetHouseContextValue>({ ... });
export function AssetHouseProvider({ clientSlug, children }: ...) { ... }
export function useAssetHouse(): AssetHouseContextValue { ... }
```

**Mount point:** Wrap inside `TemplateBuilderAppRoot` in `apps/template-builder/AppRoot.tsx`:

```tsx
export default function TemplateBuilderAppRoot() {
  const { currentClient } = useCurrentClient();
  return (
    <AssetHouseProvider clientSlug={currentClient?.slug ?? ''}>
      <WizardShell<TemplateBuilderStepData> manifest={manifest} />
    </AssetHouseProvider>
  );
}
```

**Steps to update:** Remove the `useEffect` + `clientAssetHouseService.getAssetHouse()` block from:
- `steps/MappingStep.tsx` (lines 55–69) → replace `assetHouse` local state with `const { assetHouse } = useAssetHouse()`
- `steps/GenerateStep.tsx` (lines 77–91) → same replacement
- `steps/RefineStep.tsx` (lines 91–105) → same replacement

---

### B. `SharedDataContext`

**New file:** `platform/wizard/SharedDataContext.tsx`

Holds the preloaded data that `manifest.onMount` now populates, so steps don't each refetch.

```typescript
interface SharedDataContextValue {
  savedTemplates: TemplateRecord[];
  dataSources: FeedListMember[];
  isLoading: boolean;
}
export const SharedDataContext = createContext<SharedDataContextValue>({ ... });
export function SharedDataProvider({ children }: ...) { ... }
export function useSharedData(): SharedDataContextValue { ... }
```

**Mount point:** Also wraps inside `TemplateBuilderAppRoot`, outside `AssetHouseProvider`.

**Update `manifest.onMount`** in `apps/template-builder/manifest.ts`:
Replace the TODO comment with actual calls that populate `SharedDataContext` via a setter exposed through the provider (use a `useRef` pattern or expose a `load()` function on the context).

**Steps to update:**
- `ContextStep.tsx` lines 49–60: Remove `useEffect` template fetch → `const { savedTemplates } = useSharedData()`
- `SourceStep.tsx` lines 78–88: Remove `useEffect` data source fetch → `const { dataSources } = useSharedData()`

---

### C. Claude API Integration

**Update file:** `apps/template-builder/_internal/handlers.ts`

Install dependency: `@anthropic-ai/sdk` is already in the project (check `package.json`; if absent, `npm install @anthropic-ai/sdk`).

#### `analyzeCreativeIntent()`

Replace the mocked 1.2s delay + hardcoded logic with a real API call.

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

export async function analyzeCreativeIntent(opts: {
  selectedWireframe?: string;
  prompt?: string;
  channel?: string;
}): Promise<{ requirements: RequirementField[]; autoApprove: boolean }> {
  // Wireframe path: keep existing hardcoded requirements (they ARE the wireframe contract)
  if (opts.selectedWireframe) {
    // keep existing logic — wireframe requirements are structural, not AI-generated
    return { requirements: WIREFRAME_REQUIREMENTS, autoApprove: true };
  }

  if (!opts.prompt) return { requirements: [], autoApprove: false };

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: ANALYZE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Channel: ${opts.channel || 'Social'}\nCreative Brief: ${opts.prompt}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const parsed = JSON.parse(text) as RequirementField[];
  return { requirements: parsed, autoApprove: false };
}

const ANALYZE_SYSTEM_PROMPT = `You are a creative requirements analyst for PMG, a media agency.
Given a creative brief and channel, identify the dynamic data fields required for an ad template.
Return ONLY a JSON array of RequirementField objects. No explanation, just JSON.
Each object must have:
  id: string (snake_case, unique)
  label: string (human-readable)
  category: "Brand" | "Dynamic" | "System"
  source: "Feed" | "Creative House" | "User Preset" | "Locked"
  type: "text" | "image" | "currency" | "button" | "asset"
Example: [{"id":"headline","label":"Dynamic Headline","category":"Dynamic","source":"Feed","type":"text"}]`;
```

**Error handling:** Wrap the API call in a try/catch. On failure, throw so the step body catches it and shows an inline error (not an alert). The step body already has a try/catch around `runAnalyze()`.

#### `generateCandidates()`

Replace the mocked 2s delay with a real Claude call. Wireframe path candidates stay hardcoded (they are structurally defined by the HTML template, not AI-generated).

```typescript
export async function generateCandidates(opts: {
  selectedWireframe?: string;
  requirements: RequirementField[];
  assetHouse: ClientAssetHouse | null;
}): Promise<{ candidates: unknown[]; selectedIndex: number }> {
  // Wireframe path stays hardcoded — the HTML template IS the candidate
  if (opts.selectedWireframe) {
    return { candidates: buildWireframeCandidates(opts), selectedIndex: 0 };
  }

  const brand = {
    primaryColor: opts.assetHouse?.primaryColor || '#2563eb',
    fontPrimary: opts.assetHouse?.fontPrimary || 'Inter',
    cornerRadius: opts.assetHouse?.cornerRadius || '12px',
  };

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: GENERATE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ requirements: opts.requirements, brand }),
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]';
  const candidates = JSON.parse(text) as unknown[];
  return { candidates, selectedIndex: 0 };
}

const GENERATE_SYSTEM_PROMPT = `You are a creative director at PMG, a media agency.
Given dynamic field requirements and brand standards, generate exactly 3 ad layout candidates.
Return ONLY a JSON array. No explanation.
Each candidate object:
  id: string
  name: string (evocative, 2-3 words)
  variant: "grid" | "stacked" | "wide" | "minimal"
  description: string (1 sentence, what makes this layout distinctive)
  strategy: string (1 sentence, why this works for the brand)
  styles: { primaryColor, fontFamily, borderRadius, shadow?, gradient?, accentRotation? }
  elements: { headline: bool, price: bool, image: bool, cta: bool, logo: bool }`;
```

---

### D. Channel Support — Programmatic / Print / Digital Signage

**Problem:** `ContextStep.tsx` renders "No templates available for {channel}" for non-Social channels because `SOCIAL_WIREFRAMES` only contains social templates and the wireframe panel only shows when `stepData.channel === 'Social'`.

**Fix in `ContextStep.tsx`:**

1. Import channel-specific wireframe constants (create them):

**New file:** `constants/channelWireframes.ts`
```typescript
export const PROGRAMMATIC_SIZES = [
  { id: 'prog-300x250', name: '300×250 Medium Rectangle', ratio: '300x250', adSize: 300 },
  { id: 'prog-728x90', name: '728×90 Leaderboard', ratio: '728x90', adSize: 728 },
  { id: 'prog-160x600', name: '160×600 Wide Skyscraper', ratio: '160x600', adSize: 160 },
  { id: 'prog-300x600', name: '300×600 Half Page', ratio: '300x600', adSize: 300 },
  { id: 'prog-970x250', name: '970×250 Billboard', ratio: '970x250', adSize: 970 },
];

export const PRINT_SIZES = [
  { id: 'print-8x11', name: '8.5×11 Full Page', ratio: '8.5x11' },
  { id: 'print-4x6', name: '4×6 Postcard', ratio: '4x6' },
  { id: 'print-custom', name: 'Custom Size', ratio: 'Custom' },
];

export const DIGITAL_SIGNAGE_SIZES = [
  { id: 'sign-landscape', name: '16:9 Landscape', ratio: '16:9', adSize: 1920 },
  { id: 'sign-portrait', name: '9:16 Portrait', ratio: '9:16', adSize: 1080 },
  { id: 'sign-square', name: '1:1 Square', ratio: '1:1', adSize: 1080 },
];
```

2. In `ContextStep.tsx`, replace the `stepData.channel === 'Social'` gate with a helper that maps channel to its size set and shows a size-selector grid instead of a wireframe thumbnail grid for non-Social channels. Non-Social channels don't have HTML wireframes — they use AI candidate generation at the Generate step.

3. Update `contextStep.next()`: for non-Social channels, skip wireframe requirement and proceed to `intent` → normal flow (intent → source → mapping → generate → refine → export).

---

### E. Modal System

**New file:** `components/ui/Modal.tsx`

Generic centered modal with backdrop. Used by RefineStep (save template) and ExportStep (success/error).

```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}
export function Modal({ open, onClose, title, children }: ModalProps) { ... }
```

**New file:** `components/ui/Toast.tsx`

Lightweight top-right toast for success/error feedback. Accepts `{ message, type: 'success' | 'error' }`.

**Update `RefineStep.tsx` `handleSaveTemplate()`:**
- Remove `window.prompt()` → show `<NameTemplateModal>` inline with a text input
- Remove `window.alert()` for success → fire a toast

**Update `ExportStep.tsx` `onExecute()`:**
- Remove `alert()` calls → show success/error inline in the step body

---

### F. Template Library Service

**New file:** `services/templateLibrary.ts`

```typescript
import { db } from '../platform/firebase/db';
import {
  collection, addDoc, getDocs, query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import type { RequirementField } from '../apps/template-builder/types';

export interface TemplateLibraryRecord {
  id: string;
  name: string;
  channel: string;
  ratios: string[];
  wireframeId?: string;
  feedId: string;
  feedName: string;
  feedMappings: Record<string, string>;
  brandOverrides: {
    backgroundColor?: string;
    accentColor?: string;
    textColor?: string;
    fontFamily?: string;
    logoVariant?: string;
  };
  requirements: RequirementField[];
  createdBy: string;
  createdAt: Timestamp;
  status: 'published';
  thumbnailUrl?: string;
}

export interface PublishTemplateInput {
  name: string;
  channel: string;
  ratios: string[];
  wireframeId?: string;
  feedId: string;
  feedName: string;
  feedMappings: Record<string, string>;
  brandOverrides: TemplateLibraryRecord['brandOverrides'];
  requirements: RequirementField[];
  createdBy: string;
  thumbnailUrl?: string;
}

function templateLibraryRef(clientSlug: string) {
  return collection(db, 'clients', clientSlug, 'templateLibrary');
}

export const templateLibraryService = {
  async publish(clientSlug: string, input: PublishTemplateInput): Promise<string> {
    const ref = await addDoc(templateLibraryRef(clientSlug), {
      ...input,
      status: 'published',
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  async list(clientSlug: string): Promise<TemplateLibraryRecord[]> {
    const q = query(templateLibraryRef(clientSlug), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TemplateLibraryRecord));
  },
};
```

**Firestore security rule** (add to `firestore.rules`):
```
match /clients/{clientSlug}/templateLibrary/{templateId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && request.resource.data.createdBy == request.auth.uid;
  allow update, delete: if request.auth != null && resource.data.createdBy == request.auth.uid;
}
```

---

### G. ExportStep Rewrite

**Rewrite file:** `apps/template-builder/steps/ExportStep.tsx`

Replace the "Execute Batch Deployment" flow entirely. New flow:

1. User sees a summary card (feed name, ratios, channel, wireframe/candidate name, mapped fields count).
2. User enters a template name (text input, pre-filled with `stepData.jobTitle`).
3. "Publish to Template Library" button calls `templateLibraryService.publish()`.
4. On success: show inline success state with template name + "View in Library" link to `/{clientSlug}/template-library`.
5. On error: show inline error with retry button.

Remove imports: `handleExecuteBatch` from handlers, `CloudArrowUpIcon` (replace with appropriate icon).

The `exportStep.validate()` should require at minimum that a feed is selected (`stepData.selectedFeed`) and at least one mapping exists.

---

### H. StepData Type Cleanup

**Update file:** `apps/template-builder/types.ts`

The `__css_*` keys and per-field `__mode` / `__upload` / `__logoVariant` keys are stored as dynamic index-signature values. Add explicit typed fields for the CSS overrides so TypeScript can catch typos:

```typescript
// Brand override CSS tokens (set in MappingStep, read in RefineStep)
cssBackgroundColor?: string;
cssAccentColor?: string;
cssTextColor?: string;
cssFontFamily?: string;
```

Update all references in `MappingStep.tsx` and `RefineStep.tsx` from `stepData['__css_background_color']` → `stepData.cssBackgroundColor` etc.

The per-field dynamic keys (`${field.id}__mode`, `${field.id}__upload`, `${field.id}__logoVariant`) are unavoidably dynamic — leave those on the index signature. Document them with a comment in the type file.

---

## Implementation Order

Execute tasks in this order. Each task is independently completable.

| # | Task | File(s) | Depends on |
|---|------|---------|------------|
| 1 | Create `AssetHouseContext` | `platform/assetHouse/AssetHouseContext.tsx` | — |
| 2 | Wrap `TemplateBuilderAppRoot` with providers | `apps/template-builder/AppRoot.tsx` | 1 |
| 3 | Remove duplicate asset house fetches from steps | `MappingStep.tsx`, `GenerateStep.tsx`, `RefineStep.tsx` | 1, 2 |
| 4 | Create `SharedDataContext` | `platform/wizard/SharedDataContext.tsx` | — |
| 5 | Implement `manifest.onMount` | `apps/template-builder/manifest.ts` | 4 |
| 6 | Remove per-step template/feed preloads | `ContextStep.tsx`, `SourceStep.tsx` | 4, 5 |
| 7 | Create `Modal.tsx` + `Toast.tsx` | `components/ui/Modal.tsx`, `components/ui/Toast.tsx` | — |
| 8 | Fix RefineStep save UX (Modal, Toast) | `steps/RefineStep.tsx` | 7 |
| 9 | Wire `analyzeCreativeIntent` to Claude | `_internal/handlers.ts` | — |
| 10 | Wire `generateCandidates` to Claude | `_internal/handlers.ts` | 9 |
| 11 | Create `channelWireframes.ts` constants | `constants/channelWireframes.ts` | — |
| 12 | Fix ContextStep channel support | `steps/ContextStep.tsx` | 11 |
| 13 | Create `templateLibraryService` | `services/templateLibrary.ts` | — |
| 14 | Rewrite `ExportStep` | `steps/ExportStep.tsx` | 7, 13 |
| 15 | Update `exportStep.validate()` | `steps/ExportStep.tsx` | 14 |
| 16 | Cleanup `TemplateBuilderStepData` type | `apps/template-builder/types.ts` | — |
| 17 | Update CSS override key references | `MappingStep.tsx`, `RefineStep.tsx` | 16 |
| 18 | Update Firestore security rules | `firestore.rules` | 13 |

---

## Environment Variables Required

```
ANTHROPIC_API_KEY=sk-ant-...   # Claude API (server-side only if using API routes; client-side if VITE_ prefixed)
```

If the app is a pure client-side Vite SPA (no backend), the key must be `VITE_ANTHROPIC_API_KEY` and exposed to the browser. **Security note:** For production, proxy Claude API calls through a backend route to avoid exposing the key.

Check whether `src/services/` has any existing fetch-to-backend pattern. If a proxy endpoint already exists for Alli API calls, route Claude calls through the same proxy.

---

## Testing

- Unit test `analyzeCreativeIntent` with mocked Anthropic client: assert returned shape matches `RequirementField[]`.
- Unit test `generateCandidates` same pattern.
- Unit test `templateLibraryService.publish()` with Firestore emulator.
- Integration test: full 7-step wizard in Playwright — complete the Social wireframe path and verify publish creates a Firestore record.
- Regression: existing `WizardShell.test.tsx` and `manifest.test.ts` must continue passing unchanged.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Claude API key exposed client-side | Add backend proxy endpoint (Vercel function or existing API layer) |
| Claude response not valid JSON | Wrap parse in try/catch; on failure, fall back to the existing keyword-matching logic as a stub |
| Firestore `templateLibrary` collection missing index | Add Firestore composite index for `(clientSlug, createdAt DESC)` in `firestore.indexes.json` |
| `manifest.onMount` fires before auth resolves | Gate the preload fetches behind an auth check; if `clientSlug` is falsy, skip and let individual steps lazy-load |
