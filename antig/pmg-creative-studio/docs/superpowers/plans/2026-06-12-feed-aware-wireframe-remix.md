# Feed-Aware Wireframe Selection + AI Auto-Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI-suggested wireframe candidates in DesignStep are selected and pre-styled based on first-row feed sample values — expanding selection from 15 to 45 catalogued wireframes and auto-filling per-zone font/color styles that users can override.

**Architecture:** A Node.js cataloging script extracts zone IDs from the 30 uncatalogued HTML wireframes; the Gemini prompt is extended with feed sample row values and returns `suggestedZoneStylesJson` (a JSON string); a `userHasEditedStyles` flag in DesignStep guards auto-apply so manual edits are never overwritten.

**Tech Stack:** TypeScript/React (frontend), Firebase Cloud Functions (Gemini 2.5 Flash backend), Vitest (tests), Node.js ESM (catalog script)

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| CREATE | `tools/catalog-wireframes.mjs` | One-shot Node.js script: parses HTML → extracts known zone IDs → prints catalog entries |
| MODIFY | `src/constants/useCases.ts` | Add 30 new entries to both `SOCIAL_WIREFRAMES` and `WIREFRAME_CATALOG` |
| MODIFY | `src/apps/template-builder/manifest.test.ts` | Update count description to reflect 45 entries |
| MODIFY | `src/apps/template-builder/TemplateBuilderContext.tsx` | Add `suggestedZoneStyles?: Record<string, ZoneStyle>` to `Candidate` |
| MODIFY | `src/services/ai/templateAI.ts` | Add `feedSampleRow` param; add `bestSampleRow()` helper |
| MODIFY | `src/apps/template-builder/steps/DesignStep.tsx` | `userHasEditedStyles` state; pass feedSampleRow; auto-apply on candidate click |
| MODIFY | `functions/src/index.ts` | Accept feedSampleRow; extend Gemini schema/prompt; post-process suggestedZoneStylesJson |
| CREATE | `src/apps/template-builder/steps/__tests__/designStep.zoneStyles.test.ts` | Unit tests for auto-apply logic and server-side filter |

---

## Task 1: Catalog Script

Write a Node.js script that reads all 45 HTML files in `public/template_examples/social/`, extracts element IDs that match known zone targets from `FIELD_ID_MAP`, and prints ready-to-paste `SOCIAL_WIREFRAMES` and `WIREFRAME_CATALOG` entries for review.

**Files:**
- Create: `tools/catalog-wireframes.mjs`

- [ ] **Step 1: Create the script file**

```javascript
// tools/catalog-wireframes.mjs
// Usage: node tools/catalog-wireframes.mjs
// Reads public/template_examples/social/*.html, extracts known zone IDs,
// prints SOCIAL_WIREFRAMES and WIREFRAME_CATALOG entries ready to paste into
// src/constants/useCases.ts.

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIREFRAMES_DIR = resolve(__dirname, '../public/template_examples/social');

// All known zone target IDs from FIELD_ID_MAP in injectIntoHtml.ts
const KNOWN_TARGETS = new Set([
  // image fields
  'image1', 'image_1', 'singe-image-1', 'image_1_single', 'double_image_1',
  'image_1_double', 'main-image', 'image_3', 'image2', 'image_2',
  'double_image_2', 'image_2_double', 'background-image', 'image_background',
  'background_image', 'bg', 'background_asset', 'background_test', 'background',
  'logo', 'logo_1', 'logo_2', 'fbg-logo',
  // text fields
  'headline', 'headline1', 'headline2', 'headline_1', 'headline_2',
  'tag', 'callout', 'promo', 'label', 'cta', 'price', 'price-note',
  'callout_text', 'tag_callout', 'promo_label', 'callout-container',
  'left-bar',
]);

// IDs that are structural containers — skip even if they match known targets
const SKIP_IDS = new Set(['ad', 'base', 'background', 'bg', 'body', 'ad-container', 'wrapper']);

// Already-catalogued file names — we print these too for reference but mark as existing
const CATALOGUED_FILES = new Set([
  'original_1_copy.html', 'minimalist_frame.html', 'bold_typography.html',
  'interior_split.html', 'modern_reveal.html', 'organic_shapes.html',
  'editorial_spotlight.html', 'featured_collection.html', 'clean_showcase.html',
  'dual_focus.html', 'vibrant_pulse_a.html', 'vibrant_pulse_b.html',
  'mosaic_narrative.html', 'techno_vibe_a.html', 'techno_vibe_b.html',
]);

function extractIds(html) {
  const ids = new Set();
  const regex = /\sid="([^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1].trim();
    if (KNOWN_TARGETS.has(id) && !SKIP_IDS.has(id)) ids.add(id);
  }
  return [...ids].sort();
}

function toIdSlug(filename) {
  return filename.replace('.html', '').replace(/_copy$/, '').replace(/-/g, '_');
}

function deriveAdSize(html) {
  // Look for width/height in the GWD meta or body style
  const m = html.match(/width[:\s]*(\d{3,4})px/i);
  return m ? parseInt(m[1]) : 1024;
}

function countType(slots, type) {
  if (type === 'image') {
    return slots.filter(s =>
      s.includes('image') || s.includes('background') || s === 'logo' || s === 'bg'
    ).length;
  }
  return slots.filter(s =>
    ['headline', 'headline1', 'headline2', 'callout', 'promo', 'label', 'tag', 'cta', 'price'].includes(s)
  ).length;
}

const files = readdirSync(WIREFRAMES_DIR).filter(f => f.endsWith('.html')).sort();
const newFiles = files.filter(f => !CATALOGUED_FILES.has(f));

console.log(`\n=== REVIEW TABLE (${newFiles.length} new files) ===\n`);
console.log('File'.padEnd(40), 'Detected zone IDs');
console.log('-'.repeat(80));

const socialEntries = [];
const catalogEntries = [];

for (const file of newFiles) {
  const html = readFileSync(resolve(WIREFRAMES_DIR, file), 'utf-8');
  const slots = extractIds(html);
  const adSize = deriveAdSize(html);
  const slug = toIdSlug(file);
  const hasLogo = slots.some(s => s.startsWith('logo') || s === 'fbg-logo');
  const hasBg = slots.some(s => s.includes('background') || s === 'bg');
  const hasCTA = slots.includes('cta');
  const hasPrice = slots.includes('price') || slots.includes('price-note');
  const imgCount = slots.filter(s => s.includes('image') || s.includes('double_image')).length;
  const txtCount = countType(slots, 'text');

  console.log(file.padEnd(40), slots.join(', ') || '(none found)');

  socialEntries.push(
    `  { id: '${slug}', name: '${slug}', file: '${file}', adSize: ${adSize}, minRequirements: [${
      [...new Set([
        hasLogo ? "'Logo'" : null,
        imgCount > 0 ? "'Image'" : null,
        slots.includes('headline') || slots.includes('headline1') ? "'Headline'" : null,
      ]).filter(Boolean).join(', ')
    }] },`
  );

  catalogEntries.push(`  {
    id: '${slug}',
    name: 'TODO: Give a human-readable name',
    file: '${file}',
    adSize: ${adSize},
    slots: [${slots.map(s => `'${s}'`).join(', ')}],
    description: 'TODO: One sentence describing the layout.',
    bestFor: 'TODO: When to use this wireframe.',
    elementTypes: { image: ${imgCount}, text: ${txtCount}, hasLogo: ${hasLogo}, hasBackground: ${hasBg}, hasCTA: ${hasCTA}, hasPrice: ${hasPrice} },
  },`);
}

console.log('\n=== PASTE INTO SOCIAL_WIREFRAMES ===\n');
socialEntries.forEach(e => console.log(e));

console.log('\n=== PASTE INTO WIREFRAME_CATALOG ===\n');
catalogEntries.forEach(e => console.log(e));

console.log(`\nDone. ${newFiles.length} new entries. Update TODO fields in WIREFRAME_CATALOG before committing.`);
```

- [ ] **Step 2: Run the script and review the output**

```bash
cd antig/pmg-creative-studio
node tools/catalog-wireframes.mjs 2>&1 | tee /tmp/wireframe-catalog-output.txt
```

Expected: A review table showing each new file and the zone IDs the script found. Skim the table — if a file shows `(none found)`, inspect it manually to check whether it uses non-standard IDs.

- [ ] **Step 3: Commit the script**

```bash
git add tools/catalog-wireframes.mjs
git commit -m "tools: add wireframe catalog extraction script"
```

---

## Task 2: Expand Catalog

Use the script output to write all 30 missing entries into `useCases.ts`, then update the manifest test description.

**Files:**
- Modify: `src/constants/useCases.ts`
- Modify: `src/apps/template-builder/manifest.test.ts`

- [ ] **Step 1: Write the failing test first**

Open `src/apps/template-builder/manifest.test.ts`. The existing test at line 76 says:

```typescript
it('has 15 entries matching SOCIAL_WIREFRAMES count', () => {
  expect(WIREFRAME_CATALOG).toHaveLength(SOCIAL_WIREFRAMES.length);
});
```

Update its description to be count-agnostic (the logic already checks parity, just the description is stale):

```typescript
it('WIREFRAME_CATALOG and SOCIAL_WIREFRAMES have the same count', () => {
  expect(WIREFRAME_CATALOG).toHaveLength(SOCIAL_WIREFRAMES.length);
});
```

Now add a new test below it that will FAIL until the catalog is expanded:

```typescript
it('has entries for all 45 wireframe HTML files', () => {
  const catalogFiles = new Set(WIREFRAME_CATALOG.map((w) => w.file));
  // All 45 files must be represented (either directly or as canonical variants)
  expect(WIREFRAME_CATALOG.length).toBeGreaterThanOrEqual(45);
  // Every entry must have a non-empty slots array
  for (const entry of WIREFRAME_CATALOG) {
    expect(entry.slots.length, `${entry.id} has no slots`).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd antig/pmg-creative-studio
npx vitest run src/apps/template-builder/manifest.test.ts 2>&1
```

Expected: FAIL — "expected 15 to be greater than or equal to 45"

- [ ] **Step 3: Paste script output into `useCases.ts`**

For `SOCIAL_WIREFRAMES`: append the new entries from the script's "PASTE INTO SOCIAL_WIREFRAMES" section. Each entry follows the existing shape:

```typescript
// Example — exact values come from the script output
{ id: 'bold_typography_quick', name: 'Bold Type Quick', file: 'bold_typography_quick.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Headline'] },
{ id: 'classic_social_retail', name: 'Classic Retail', file: 'classic_social_retail.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Headline', 'Promo'] },
// ... (all 30 new entries from script output)
```

For `WIREFRAME_CATALOG`: append the new entries. Fill in the `TODO` fields — `name`, `description`, `bestFor` — by opening each HTML file and looking at its visual layout. Use the existing 15 entries as style reference:

```typescript
// Example — exact slots come from script output, name/description/bestFor need human eyes
{
  id: 'bold_typography_quick',
  name: 'Headline + Quick Badge',
  file: 'bold_typography_quick.html',
  adSize: 1024,
  slots: ['logo', 'image1', 'headline', 'tag'],  // from script output
  description: 'Large bold headline with a compact callout tag below the product image.',
  bestFor: 'Time-sensitive promotions, flash sales, single-message urgency.',
  elementTypes: { image: 1, text: 2, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
},
// ... (all 30 new entries)
```

> **Note:** The `slots` array must contain ONLY IDs from `FIELD_ID_MAP` targets (the script filters this). The `name`, `description`, `bestFor` fields are for Gemini to use when selecting — be specific about visual layout and use case.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/apps/template-builder/manifest.test.ts 2>&1
```

Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add src/constants/useCases.ts src/apps/template-builder/manifest.test.ts
git commit -m "feat(catalog): expand wireframe catalog from 15 to 45 entries"
```

---

## Task 3: Extend Candidate Type

Add `suggestedZoneStyles` to the `Candidate` interface in `TemplateBuilderContext.tsx`. This is what the Cloud Function will return and what DesignStep will apply.

**Files:**
- Modify: `src/apps/template-builder/TemplateBuilderContext.tsx`

`ZoneStyle` lives in `src/apps/template-builder/types.ts`:
```typescript
export interface ZoneStyle {
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  fontWeight?: 'bold' | 'normal';
  fontStyle?: 'italic' | 'normal';
  textDecoration?: 'underline' | 'none';
}
```

- [ ] **Step 1: Add import and extend Candidate**

In `src/apps/template-builder/TemplateBuilderContext.tsx`, add the import and the new field:

```typescript
import type { RequirementField } from './types';
import type { ZoneStyle } from './types';  // ADD THIS LINE

export interface Candidate {
  id: string;
  name: string;
  variant: 'grid' | 'stacked' | 'wide' | 'minimal';
  wireframeId?: string;
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
  suggestedZoneStyles?: Record<string, ZoneStyle>;  // ADD THIS LINE
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd antig/pmg-creative-studio
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors (0 type errors)

- [ ] **Step 3: Commit**

```bash
git add src/apps/template-builder/TemplateBuilderContext.tsx
git commit -m "feat(types): add suggestedZoneStyles to Candidate"
```

---

## Task 4: Best-Sample-Row Helper + Client Param Extension

Add a `bestSampleRow()` helper and extend `generateLayouts` to accept and forward `feedSampleRow`.

**Files:**
- Modify: `src/services/ai/templateAI.ts`

Current `templateAI.ts` signature for `generateLayouts`:
```typescript
export async function generateLayouts(opts: {
  requirements: RequirementField[];
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary' | 'cornerRadius' | 'logoPrimary'> | null;
  feedColumns?: string[];
  brief?: string;
}): Promise<Candidate[]>
```

- [ ] **Step 1: Write the failing test**

Create `src/services/ai/__tests__/templateAI.bestSampleRow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { bestSampleRow } from '../templateAI';

describe('bestSampleRow', () => {
  it('returns first row when it has enough non-empty values', () => {
    const rows = [
      { title: 'Product A', price: '$10', desc: 'Great item', extra: '' },
      { title: 'Product B', price: '$20', desc: 'Also great', extra: '' },
    ];
    const result = bestSampleRow(rows);
    expect(result?.title).toBe('Product A');
  });

  it('skips row 0 when it has fewer than 3 non-empty values', () => {
    const rows = [
      { title: '', price: '', desc: '' },
      { title: 'Product B', price: '$20', desc: 'Also great', extra: 'yes' },
    ];
    const result = bestSampleRow(rows);
    expect(result?.title).toBe('Product B');
  });

  it('falls back to row 0 when all 5 rows have fewer than 3 non-empty values', () => {
    const rows = [{ title: '', price: '' }, { a: '' }, { b: '' }];
    const result = bestSampleRow(rows);
    expect(result).toBe(rows[0]);
  });

  it('truncates values longer than 80 characters', () => {
    const longVal = 'A'.repeat(100);
    const rows = [{ title: longVal, price: '$10', desc: 'Short', extra: 'ok' }];
    const result = bestSampleRow(rows);
    expect(result?.title.length).toBe(80);
  });

  it('returns undefined for empty array', () => {
    expect(bestSampleRow([])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd antig/pmg-creative-studio
npx vitest run src/services/ai/__tests__/templateAI.bestSampleRow.test.ts 2>&1
```

Expected: FAIL — "bestSampleRow is not a function"

- [ ] **Step 3: Add the helper and extend `generateLayouts`**

In `src/services/ai/templateAI.ts`:

```typescript
import type { RequirementField, Channel } from '../../apps/template-builder/types';
import type { ClientAssetHouse } from '../clientAssetHouse';
import type { Candidate } from '../../apps/template-builder/TemplateBuilderContext';
import { WIREFRAME_CATALOG } from '../../constants/useCases';

const PROXY = '/api/helloWorld';

async function callGemini<T>(action: string, payload: object): Promise<T> {
  const res = await fetch(`${PROXY}?templateAI=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Template AI error (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Scans the first 5 rows of feed sample data and returns the first row
 * where at least 3 values are non-empty strings, with each value truncated
 * to 80 chars. Falls back to row 0 if no qualifying row is found.
 */
export function bestSampleRow(
  rows: Array<Record<string, unknown>>
): Record<string, string> | undefined {
  if (rows.length === 0) return undefined;

  const qualify = (row: Record<string, unknown>): boolean => {
    const nonEmpty = Object.values(row).filter(
      (v) => typeof v === 'string' && v.trim().length > 0
    );
    return nonEmpty.length >= 3;
  };

  const truncate = (row: Record<string, unknown>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = String(v ?? '').slice(0, 80);
    }
    return out;
  };

  const candidates = rows.slice(0, 5);
  const best = candidates.find(qualify) ?? candidates[0];
  return truncate(best);
}

export async function synthesizeRequirements(opts: {
  brief: string;
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary'> | null;
}): Promise<RequirementField[]> {
  return callGemini<RequirementField[]>('synthesize', {
    brief: opts.brief,
    channel: opts.channel,
    brand: opts.brand ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary } : null,
  });
}

export async function generateLayouts(opts: {
  requirements: RequirementField[];
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary' | 'cornerRadius' | 'logoPrimary'> | null;
  feedColumns?: string[];
  feedSampleRow?: Record<string, string>;  // NEW
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
    feedSampleRow: opts.feedSampleRow ?? null,  // NEW
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

export async function suggestMappings(opts: {
  requirements: RequirementField[];
  feedColumns: string[];
}): Promise<Record<string, string>> {
  return callGemini<Record<string, string>>('suggestMappings', {
    requirements: opts.requirements,
    feedColumns: opts.feedColumns,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/services/ai/__tests__/templateAI.bestSampleRow.test.ts 2>&1
```

Expected: PASS — all 5 tests green

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/templateAI.ts src/services/ai/__tests__/templateAI.bestSampleRow.test.ts
git commit -m "feat(templateAI): add bestSampleRow helper + feedSampleRow param to generateLayouts"
```

---

## Task 5: Extend Cloud Function

Update `functions/src/index.ts` to accept `feedSampleRow`, extend the Gemini schema with `suggestedZoneStylesJson`, update the prompt, and post-process the result to filter zone IDs and attach `suggestedZoneStyles` to each candidate.

**Files:**
- Modify: `functions/src/index.ts` (lines 110–260, the `generateLayouts` action block)

- [ ] **Step 1: Locate the exact lines to change**

Open `functions/src/index.ts`. Find the `generateLayouts` action block starting at line 110. The changes touch:
1. The destructured `body` (line 111) — add `feedSampleRow`
2. The Gemini response schema (lines 152–193) — add `suggestedZoneStylesJson`
3. The prompt string (lines 198–235) — add feed sample section
4. The post-processing block (lines 250–257) — parse JSON, filter, log, attach

- [ ] **Step 2: Update the destructured body**

Change line 111:
```typescript
// BEFORE:
const { requirements, channel, brand, feedColumns, brief, wireframeCatalog } = body as {
  // ...existing fields...
};

// AFTER:
const { requirements, channel, brand, feedColumns, feedSampleRow, brief, wireframeCatalog } = body as {
  requirements: Array<{ id: string; type: string; category: string }>;
  channel: string;
  brand: { primaryColor?: string; fontPrimary?: string; cornerRadius?: string; logoPrimary?: string } | null;
  feedColumns?: string[];
  feedSampleRow?: Record<string, string> | null;  // NEW
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
```

- [ ] **Step 3: Add `suggestedZoneStylesJson` to the response schema**

Find the `responseSchema` object inside the `generateLayouts` model config. In the `items.properties` object, add:

```typescript
// Inside the properties object of the items schema, after the existing 'elements' property:
suggestedZoneStylesJson: { type: SchemaType.STRING },
```

The full `required` array stays the same — `suggestedZoneStylesJson` is intentionally NOT required so Gemini can omit it without error.

- [ ] **Step 4: Update the prompt string**

After the existing `Brand: color "${color}", font "${font}", border radius "${radius}"` line in the prompt, add:

```typescript
const sampleSection = feedSampleRow && Object.keys(feedSampleRow).length > 0
  ? `\nFeed sample data (representative row — use to understand content type and text length):\n${JSON.stringify(feedSampleRow, null, 2)}`
  : '';
```

Then in the prompt template string, append after the `Brand:` line:

```
${sampleSection}

For each of the 3 wireframe candidates you select, also return suggestedZoneStylesJson: a JSON string
mapping zone slot IDs to style hints. Use ONLY zone IDs from that wireframe's slots list.
Style rules:
- Text field value > 40 chars → fontSize: 14-16
- Text field value < 20 chars → fontSize: 20-24
- Field is price or price-note → color: "#e11d48", fontWeight: "bold"
- Field is headline or headline1 or headline2 → fontFamily: "${font}"
- Omit any zone that needs no special styling
Return valid minified JSON string. Example: {"headline":{"fontSize":16,"fontFamily":"Inter"},"price":{"color":"#e11d48","fontWeight":"bold"}}
If no special styles needed, return: "{}"
```

- [ ] **Step 5: Update the post-processing block**

Find lines 250–257 (the `validated` map block). Replace the entire block:

```typescript
// Build a lookup map: wireframeId → slots from catalog
const catalogSlotMap = new Map<string, Set<string>>();
for (const entry of catalog) {
  catalogSlotMap.set(entry.id, new Set(entry.slots));
}

// Server-side validation + zone style parsing
const validated = raw.map((candidate, i) => {
  // Repair wireframeId if Gemini hallucinated
  const wid = typeof candidate.wireframeId === 'string' ? candidate.wireframeId : '';
  const repairedWid = validIds.includes(wid) ? wid : (validIds[i] ?? validIds[0] ?? '');

  // Parse and filter suggestedZoneStyles
  let suggestedZoneStyles: Record<string, unknown> = {};
  const rawJson = typeof candidate.suggestedZoneStylesJson === 'string'
    ? candidate.suggestedZoneStylesJson.trim()
    : '{}';
  try {
    const parsed = JSON.parse(rawJson || '{}') as Record<string, unknown>;
    const knownSlots = catalogSlotMap.get(repairedWid) ?? new Set<string>();
    const dropped: string[] = [];
    for (const [key, val] of Object.entries(parsed)) {
      if (knownSlots.has(key)) {
        suggestedZoneStyles[key] = val;
      } else {
        dropped.push(key);
      }
    }
    if (dropped.length > 0) {
      functions.logger.debug('[generateLayouts] filtered zone IDs not in catalog', {
        wireframeId: repairedWid,
        dropped,
      });
    }
  } catch {
    // Invalid JSON — use empty styles silently
  }

  return { ...candidate, wireframeId: repairedWid, suggestedZoneStyles };
});

response.json(validated);
```

- [ ] **Step 6: Verify TypeScript compiles in functions**

```bash
cd antig/pmg-creative-studio/functions
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(functions): extend generateLayouts with feedSampleRow + suggestedZoneStyles"
```

---

## Task 6: Wire DesignStep

Pass `feedSampleRow` to `generateLayouts`, add `userHasEditedStyles` state, and auto-apply `suggestedZoneStyles` on candidate click.

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

There are **three** `generateLayouts` call sites in DesignStep — the mount `useEffect` (line 363), the Regenerate button (line 595), and potentially a third if added later. All three need `feedSampleRow`.

- [ ] **Step 1: Write the failing test**

Create `src/apps/template-builder/steps/__tests__/designStep.zoneStyles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Pure logic tests — no React rendering needed.
// These test the guard logic we will add to DesignStep.

/** Mirror of the bestSampleRow logic used in the component */
function bestSampleRow(rows: Array<Record<string, unknown>>): Record<string, string> | undefined {
  if (rows.length === 0) return undefined;
  const qualify = (r: Record<string, unknown>) =>
    Object.values(r).filter((v) => typeof v === 'string' && (v as string).trim().length > 0).length >= 3;
  const truncate = (r: Record<string, unknown>): Record<string, string> =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '').slice(0, 80)]));
  return truncate(rows.slice(0, 5).find(qualify) ?? rows[0]);
}

/** Mirror of the auto-apply guard logic */
function shouldApplyZoneStyles(
  suggestedZoneStyles: Record<string, unknown> | undefined,
  userHasEditedStyles: boolean
): boolean {
  if (userHasEditedStyles) return false;
  if (!suggestedZoneStyles || Object.keys(suggestedZoneStyles).length === 0) return false;
  return true;
}

describe('shouldApplyZoneStyles', () => {
  it('applies when no manual edits and styles exist', () => {
    expect(shouldApplyZoneStyles({ headline: { fontSize: 18 } }, false)).toBe(true);
  });

  it('skips when user has edited manually', () => {
    expect(shouldApplyZoneStyles({ headline: { fontSize: 18 } }, true)).toBe(false);
  });

  it('skips when suggestedZoneStyles is empty', () => {
    expect(shouldApplyZoneStyles({}, false)).toBe(false);
  });

  it('skips when suggestedZoneStyles is undefined', () => {
    expect(shouldApplyZoneStyles(undefined, false)).toBe(false);
  });

  it('skips re-open case (userHasEditedStyles=true from mount)', () => {
    // Re-open: stepData.zoneStyles non-empty on mount → userHasEditedStyles = true
    expect(shouldApplyZoneStyles({ price: { color: '#e11d48' } }, true)).toBe(false);
  });
});

describe('userHasEditedStyles initialization', () => {
  it('should be false for new session (zoneStyles empty on mount)', () => {
    const zoneStyles = undefined;
    const initialUserHasEditedStyles = Boolean(zoneStyles && Object.keys(zoneStyles).length > 0);
    expect(initialUserHasEditedStyles).toBe(false);
  });

  it('should be true for re-open (zoneStyles non-empty on mount)', () => {
    const zoneStyles = { headline: { fontSize: 16 } };
    const initialUserHasEditedStyles = Boolean(zoneStyles && Object.keys(zoneStyles).length > 0);
    expect(initialUserHasEditedStyles).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd antig/pmg-creative-studio
npx vitest run src/apps/template-builder/steps/__tests__/designStep.zoneStyles.test.ts 2>&1
```

Expected: PASS immediately (pure logic tests, no implementation needed) — but the real feature is tested by running the app end-to-end in Task 10.

- [ ] **Step 3: Add imports to DesignStep**

At the top of `DesignStep.tsx`, `bestSampleRow` from `templateAI` is already importable since we added it as an export in Task 4. Add it to the existing import:

```typescript
// Find this line:
import { generateLayouts, suggestMappings } from '../../../services/ai/templateAI';

// Replace with:
import { generateLayouts, suggestMappings, bestSampleRow } from '../../../services/ai/templateAI';
```

- [ ] **Step 4: Add `userHasEditedStyles` state**

In `DesignStepBody`, find the existing state declarations (around line 325). Add after the existing states:

```typescript
const [zoneCoverageStyleSlot, setZoneCoverageStyleSlot] = useState<string | null>(null);
const [feedRowIndex, setFeedRowIndex] = useState(0);

// true when user has manually edited any zone style via ZoneStyleToolbar.
// Initialized to true if stepData.zoneStyles is non-empty (re-open existing template).
// Once set to true, AI-suggested zone styles will never overwrite user edits.
const [userHasEditedStyles, setUserHasEditedStyles] = useState<boolean>(
  Boolean(stepData.zoneStyles && Object.keys(stepData.zoneStyles).length > 0)
);
```

- [ ] **Step 5: Set `userHasEditedStyles = true` in handleZoneStyleChange**

Find `handleZoneStyleChange` (around line 337):

```typescript
function handleZoneStyleChange(slotId: string, partial: Partial<ZoneStyle>) {
  setUserHasEditedStyles(true);  // ADD THIS LINE — first edit locks out AI auto-apply
  const next = {
    ...(stepData.zoneStyles ?? {}),
    [slotId]: { ...(stepData.zoneStyles?.[slotId] ?? {}), ...partial },
  };
  if (zoneStyleDebounceRef.current) clearTimeout(zoneStyleDebounceRef.current);
  zoneStyleDebounceRef.current = setTimeout(() => {
    mergeStepData({ zoneStyles: next });
  }, 150);
}
```

- [ ] **Step 6: Pass `feedSampleRow` to generateLayouts in the mount useEffect**

Find the mount `useEffect` (around line 358). Update the `generateLayouts` call:

```typescript
const generated = await generateLayouts({
  requirements,
  channel: stepData.channel ?? 'Social',
  brand: assetHouse,
  feedColumns,
  feedSampleRow: bestSampleRow(feedSampleData),  // ADD THIS LINE
  brief: stepData.brief,
});
```

- [ ] **Step 7: Pass `feedSampleRow` to the Regenerate button's generateLayouts call**

Find the Regenerate button onClick handler (around line 591). Update the same way:

```typescript
const generated = await generateLayouts({
  requirements,
  channel: stepData.channel ?? 'Social',
  brand: assetHouse,
  feedColumns,
  feedSampleRow: bestSampleRow(feedSampleData),  // ADD THIS LINE
  brief: stepData.brief,
});
```

- [ ] **Step 8: Auto-apply suggestedZoneStyles in the candidate click handler**

Find the `CandidateCard` onClick (around line 576):

```typescript
onClick={() => {
  const wf = c.wireframeId
    ? SOCIAL_WIREFRAMES.find((w) => w.id === c.wireframeId)
    : null;

  // Build the update payload
  const update: Partial<TemplateBuilderStepData> = {
    selectedCandidateIndex: idx,
    ...(wf ? { selectedWireframeId: wf.id, wireframeFile: wf.file } : {}),
  };

  // Auto-apply AI-suggested zone styles only if user hasn't manually edited
  if (
    !userHasEditedStyles &&
    c.suggestedZoneStyles &&
    Object.keys(c.suggestedZoneStyles).length > 0
  ) {
    update.zoneStyles = c.suggestedZoneStyles;
  }

  mergeStepData(update);
}}
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd antig/pmg-creative-studio
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors

- [ ] **Step 10: Run all tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: All existing tests pass (no regressions)

- [ ] **Step 11: Commit**

```bash
git add src/apps/template-builder/steps/DesignStep.tsx src/apps/template-builder/steps/__tests__/designStep.zoneStyles.test.ts
git commit -m "feat(design-step): feed-aware candidate selection + AI auto-style on click"
```

---

## Task 7: Deploy Cloud Function

Deploy only the `helloWorld` function — the shared Firebase project cannot use bare `firebase deploy --only functions`.

**Files:**
- No code changes — deploy only

- [ ] **Step 1: Build the functions**

```bash
cd antig/pmg-creative-studio/functions
npm run build 2>&1
```

Expected: No TypeScript errors, `lib/` directory updated

- [ ] **Step 2: Deploy**

```bash
cd antig/pmg-creative-studio
firebase deploy --only functions:helloWorld --project automated-creative-e10d7 2>&1
```

Expected: `✔  functions[helloWorld(us-central1)]: Successful update operation.`

> **IMPORTANT:** Do NOT use bare `firebase deploy --only functions` — the project is shared with other repos and that would delete functions belonging to other apps.

- [ ] **Step 3: Verify deploy health**

```bash
firebase functions:log --only helloWorld --project automated-creative-e10d7 2>&1 | tail -10
```

Expected: Recent log entries with no ERROR level entries from the new code

---

## Task 8: End-to-End Eval

Verify the feature works end-to-end with real feed data.

**Files:**
- No code changes — verification only

- [ ] **Step 1: Start the dev server**

```bash
cd antig/pmg-creative-studio
npm run dev 2>&1 &
```

Open `http://localhost:5173` in the browser.

- [ ] **Step 2: Create a new template with a real feed**

1. Navigate to Template Builder → New Template
2. Select "Social" channel, "1:1" ratio
3. Connect a PMG feed that has columns including product name, price, and image URL
4. Enter a brief like "summer sale"
5. Click Next → wait for DesignStep to load

- [ ] **Step 3: Verify AI zone styles are applied**

1. Observe: the three candidate cards load
2. Click the first candidate card
3. Open the Zone Coverage panel → click the paintbrush icon on the headline or price zone
4. Verify: `ZoneStyleToolbar` shows pre-filled values (font size, color) rather than empty/default

Expected signals:
- Headline zone: fontSize 14–18 (if product names are long)
- Price zone: color `#e11d48`, fontWeight bold
- Non-text zones (image, logo): no styles applied

- [ ] **Step 4: Verify switching candidates updates styles**

1. With no manual edits made, click candidate 2
2. Verify: zone styles update to candidate 2's suggestions (not stuck on candidate 1's)

- [ ] **Step 5: Verify manual edits are preserved**

1. Open ZoneStyleToolbar on headline zone → change font size manually
2. Switch to candidate 3
3. Switch back to candidate 1
4. Verify: your manual font size is preserved (not overwritten by AI)

- [ ] **Step 6: Verify re-open case**

1. Publish a template with some zone styles set
2. Navigate back to the template → Edit
3. In DesignStep, verify: existing zone styles are shown in ZoneStyleToolbar without AI overwriting them

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Catalog 30 missing wireframes | Tasks 1, 2 |
| Feed sample row to AI | Tasks 4, 5 |
| AI returns suggestedZoneStyles | Task 5 |
| Server-side zone ID filter + logging | Task 5 |
| userHasEditedStyles guard | Task 6 |
| Auto-apply on click, not mount | Task 6 |
| Re-open protection | Task 6 (init state) |
| ZoneStyleToolbar sets manual flag | Task 6 |
| Unit tests | Tasks 4, 6 |
| Deploy | Task 7 |
| Eval | Task 8 |

**Type consistency check:**
- `bestSampleRow` defined in Task 4, imported in Task 6 ✓
- `suggestedZoneStyles: Record<string, ZoneStyle>` on Candidate defined in Task 3, read in Task 6 ✓
- `feedSampleRow?: Record<string, string>` defined in Task 4, accepted in Task 5 ✓
- `userHasEditedStyles` is local state in DesignStep, not persisted — correct ✓

**NOT in scope (confirmed):**
- Zone position/size changes (Konva Phase 2)
- HTML generation from scratch
- PII stripping beyond 80-char truncation
- CI catalog rebuild automation
