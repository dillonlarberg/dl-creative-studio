# Template Library Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Template Library page from bare text cards to a visual gallery with wireframe thumbnails, search, channel filter, and a "Use Template" CTA per card.

**Architecture:** All changes are in `src/pages/TemplateLibraryPage.tsx`. The `TemplatePreview` iframe component (already used in the template builder) is imported to render wireframe thumbnails using `scaffoldId` looked up against `SOCIAL_WIREFRAMES`. Search and filter are local `useState` — no new services or routes needed. The "Use Template" CTA links to `/adlabs/{clientSlug}/template-builder?from={templateId}`; the builder will consume the `?from` param in a later roadmap item.

**Tech Stack:** React, TypeScript, TailwindCSS, Heroicons, `TemplatePreview` component, `SOCIAL_WIREFRAMES` constant.

---

## Files Modified

| File | Change |
|---|---|
| `src/pages/TemplateLibraryPage.tsx` | Add wireframe thumbnail + CTA to `TemplateCard`; add search input + channel filter pills to the page |

---

## Context: key imports and types

`TemplateLibraryRecord` (from `src/services/templateLibrary.types.ts`) has:
- `id: string`
- `name: string`
- `channel: 'social' | 'programmatic' | 'print' | 'signage'`
- `scaffoldId: string` — wireframe ID, e.g. `"original_4"` — look up in `SOCIAL_WIREFRAMES` to get `file` and `adSize`
- `adSizes: Array<{ width: number; height: number; label?: string }>`
- `datasourceName: string`
- `fieldMappings: Record<string, ...>`
- `publishedAt: Timestamp | null`

`SOCIAL_WIREFRAMES` (from `src/constants/useCases.ts`):
```typescript
{ id: string; name: string; file: string; adSize: number; minRequirements: string[] }[]
```

`TemplatePreview` (from `src/apps/template-builder/_internal/TemplatePreview.tsx`):
```tsx
({ templateFile, name, scale, adSize }: {
  templateFile: string; name: string; scale?: number; adSize?: number;
}) => JSX.Element
// Renders a fixed clipSize×clipSize div where clipSize = Math.round(adSize * scale)
// The iframe inside fetches /template_examples/social/{templateFile}
```

---

## Task 1: Wireframe thumbnail + "Use Template" CTA on each card

**Files:**
- Modify: `src/pages/TemplateLibraryPage.tsx`

**Context:** The `TemplateCard` component currently shows only text. This task adds a `TemplatePreview` thumbnail at the top of each card using the template's `scaffoldId` to look up the wireframe file, and a "Use Template" link at the bottom that routes to the template builder with `?from={templateId}`.

Use scale `0.18` for the thumbnail → `clipSize = Math.round(1024 * 0.18) = 184px`. Center it in a 190px-tall container. If `scaffoldId` doesn't match any `SOCIAL_WIREFRAMES` entry (e.g. non-social templates), show a placeholder gray box instead.

- [ ] **Step 1: Read the current file before editing**

```bash
cat /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio/src/pages/TemplateLibraryPage.tsx
```

- [ ] **Step 2: Add TemplatePreview and SOCIAL_WIREFRAMES imports**

At the top of `src/pages/TemplateLibraryPage.tsx`, add after the existing imports:

```typescript
import { Link, useParams } from 'react-router-dom';
// (Link is already imported — add these two new imports)
import { TemplatePreview } from '../apps/template-builder/_internal/TemplatePreview';
import { SOCIAL_WIREFRAMES } from '../constants/useCases';
```

- [ ] **Step 3: Replace the TemplateCard function**

Replace the entire `TemplateCard` function with:

```tsx
function TemplateCard({
  template: t,
  clientSlug,
}: {
  template: TemplateLibraryRecord;
  clientSlug: string;
}) {
  const channelColor = CHANNEL_COLORS[t.channel] ?? 'bg-gray-100 text-gray-600';
  const sizes = t.adSizes
    .map((s) => (s.label ? s.label : `${s.width}×${s.height}`))
    .join(', ');
  const publishedDate = t.publishedAt
    ?.toDate()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fieldCount = Object.keys(t.fieldMappings).length;

  const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === t.scaffoldId);

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden hover:border-blue-200 hover:shadow-md transition-all flex flex-col">
      {/* Thumbnail */}
      <div className="bg-gray-50 border-b border-gray-100 flex items-center justify-center overflow-hidden" style={{ height: '190px' }}>
        {wireframe ? (
          <TemplatePreview
            templateFile={wireframe.file}
            name={wireframe.name}
            scale={0.18}
            adSize={wireframe.adSize || 1024}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 rounded-xl bg-gray-200" />
            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">No preview</p>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
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

        <div className="space-y-1 flex-1">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate">
            {t.datasourceName || t.datasourceId}
          </p>
          {sizes && <p className="text-[10px] text-gray-400">{sizes}</p>}
          <p className="text-[10px] text-gray-400">
            {fieldCount} {fieldCount === 1 ? 'field' : 'fields'} mapped
          </p>
          {wireframe && (
            <p className="text-[10px] text-gray-300 truncate">{wireframe.name}</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          {publishedDate && (
            <p className="text-[9px] font-medium text-gray-300">Published {publishedDate}</p>
          )}
          <Link
            to={`/adlabs/${clientSlug}/template-builder?from=${t.id}`}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-gray-700 transition-colors"
          >
            Use Template
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Pass clientSlug to TemplateCard in the grid render**

Find the grid `templates.map((t) => (...))` block and update to pass `clientSlug`:

Current:
```tsx
{templates.map((t) => (
  <TemplateCard key={t.id} template={t} />
))}
```

Replace with:
```tsx
{templates.map((t) => (
  <TemplateCard key={t.id} template={t} clientSlug={clientSlug ?? ''} />
))}
```

- [ ] **Step 5: Update the loading skeleton to match the new card height**

Find the loading skeleton cards and replace with:

```tsx
{[1, 2, 3].map((i) => (
  <div key={i} className="rounded-xl border border-gray-100 overflow-hidden animate-pulse">
    <div className="bg-gray-100" style={{ height: '190px' }} />
    <div className="p-5 space-y-3">
      <div className="flex justify-between gap-2">
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-5 bg-gray-100 rounded-full w-14" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-1/2" />
      <div className="h-3 bg-gray-100 rounded w-2/3" />
      <div className="h-3 bg-gray-100 rounded w-1/3" />
    </div>
  </div>
))}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/TemplateLibraryPage.tsx
git commit -m "feat: add wireframe thumbnails and Use Template CTA to template library cards"
```

---

## Task 2: Search + channel filter

**Files:**
- Modify: `src/pages/TemplateLibraryPage.tsx`

**Context:** Add a search text input and channel filter pills above the grid. Both are local state. Filtering happens client-side (the full list is already fetched). The active filter and search query together narrow `templates` before rendering. "All" pill is selected by default and clears the channel filter.

- [ ] **Step 1: Add MagnifyingGlassIcon to the imports**

In `src/pages/TemplateLibraryPage.tsx`, update the heroicons import line:

Change:
```typescript
import { ArrowLeftIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
```

To:
```typescript
import { ArrowLeftIcon, DocumentDuplicateIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
```

- [ ] **Step 2: Add search and filter state to TemplateLibraryPage**

Inside `TemplateLibraryPage`, after the existing `useState` declarations add:

```typescript
const [search, setSearch] = useState('');
const [channelFilter, setChannelFilter] = useState<string>('all');
```

- [ ] **Step 3: Add filtered templates derived value**

After the state declarations, add:

```typescript
const filtered = templates.filter((t) => {
  const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
  const matchesChannel = channelFilter === 'all' || t.channel === channelFilter;
  return matchesSearch && matchesChannel;
});
```

- [ ] **Step 4: Add search + filter UI above the grid**

Inside the content card `<div className="rounded-xl border...">`, before the `{isLoading ? ...}` block, add:

```tsx
{/* Search + filter controls — only show when there are templates */}
{!isLoading && !error && templates.length > 0 && (
  <div className="flex flex-col gap-3 mb-6">
    {/* Search */}
    <div className="relative">
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 pointer-events-none" />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search templates…"
        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all text-sm text-gray-700 placeholder-gray-300"
      />
    </div>

    {/* Channel filter pills */}
    <div className="flex flex-wrap gap-2">
      {(['all', 'social', 'programmatic', 'print', 'signage'] as const).map((ch) => (
        <button
          key={ch}
          type="button"
          onClick={() => setChannelFilter(ch)}
          className={cn(
            'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all',
            channelFilter === ch
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          )}
        >
          {ch === 'all' ? 'All' : ch}
        </button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Replace templates.map with filtered.map in the grid**

In the grid render, change:

```tsx
{templates.map((t) => (
  <TemplateCard key={t.id} template={t} clientSlug={clientSlug ?? ''} />
))}
```

To:

```tsx
{filtered.length === 0 ? (
  <div className="col-span-3 text-center py-12">
    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-300">
      No templates match your search
    </p>
  </div>
) : (
  filtered.map((t) => (
    <TemplateCard key={t.id} template={t} clientSlug={clientSlug ?? ''} />
  ))
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Manual smoke test in browser**

Dev server should already be running at `http://localhost:5178`. Navigate to the Template Library (`/adlabs/ralph_lauren/templates`) and verify:

- [ ] Each card shows a wireframe thumbnail (iframe loads the actual template HTML)
- [ ] Cards without a matching `scaffoldId` show the gray placeholder
- [ ] "Use Template" link is present and routes to `/adlabs/ralph_lauren/template-builder?from={id}`
- [ ] Typing in the search box filters the visible cards in real time
- [ ] Clicking a channel pill (e.g. "social") hides cards from other channels
- [ ] "All" pill resets the filter
- [ ] Zero results shows the "No templates match" message

- [ ] **Step 8: Commit**

```bash
git add src/pages/TemplateLibraryPage.tsx
git commit -m "feat: add search and channel filter to template library"
```
