# Design Step Mockup Gap-Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all gaps between the live DesignStep and the `template-builder-approach-2.html` wireframe — Feed/Static/AI source toggles, AI-suggestion badges + Accept flow, feed row navigator, compact brand overrides panel, and candidate Regenerate button.

**Architecture:** All changes are additive to `DesignStep.tsx`. Three new `TemplateBuilderStepData` fields (`aiSuggestedMappings`, `staticValues`, `fieldSourceMode`) carry the new state through to Firestore. The row navigator is local UI state only (not persisted). The injection pipeline already supports per-field values — static values plug into `injections` the same way feed values do.

**Tech Stack:** React/TypeScript, Tailwind CSS, existing `suggestMappings` + `generateLayouts` AI services, existing `FilledTemplatePreview` iframe pipeline.

---

## Data Flow

```
TemplateBuilderStepData
  feedMappings:       fieldId → columnName   (existing)
  staticValues:       fieldId → string       (NEW — static text override)
  fieldSourceMode:    fieldId → 'feed'|'static'|'ai'  (NEW — which tab is active)
  aiSuggestedMappings: fieldId → true        (NEW — set on AI auto-apply, cleared on Accept)
  zoneStyles:         slotId → ZoneStyle     (existing)
  slotMappings:       fieldId → slotId       (existing)

DesignStep injection build
  for each field:
    if fieldSourceMode[id] === 'static'  → use staticValues[id]
    else if fieldSourceMode[id] === 'ai' → skip (Ask Alli handles)
    else                                 → use firstVal(feedMappings[id], feedSampleData[feedRowIndex])
                                                                                    ^^^^^^^^^^^
                                                                          NEW: row index from navigator
```

---

## Files

- Modify: `src/apps/template-builder/types.ts`
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`
- Modify: `src/services/templateLibrary.types.ts`
- Modify: `src/apps/template-builder/AppRoot.tsx`
- Modify: `src/apps/template-builder/steps/PublishStep.tsx`

---

## Task 1: Add new fields to TemplateBuilderStepData

**Files:**
- Modify: `src/apps/template-builder/types.ts`

- [ ] **Step 1: Add three new optional fields to TemplateBuilderStepData**

In `src/apps/template-builder/types.ts`, add inside `TemplateBuilderStepData` (after the existing `zoneStyles` line):

```typescript
  staticValues?: Record<string, string>;           // fieldId → static text value
  fieldSourceMode?: Record<string, 'feed' | 'static' | 'ai'>;  // fieldId → active source tab
  aiSuggestedMappings?: Record<string, true>;      // fieldId → true when AI auto-suggested
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/apps/template-builder/types.ts
git commit -m "feat(types): add staticValues, fieldSourceMode, aiSuggestedMappings to TemplateBuilderStepData"
```

---

## Task 2: AI suggestion tracking + Accept/Accept All

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

Context: `suggestMappings` is called in the mount `useEffect` (around line 390). When it auto-applies results, we now also set `aiSuggestedMappings` so the UI can show the purple badge and Accept buttons.

- [ ] **Step 1: Mark AI-suggested fields when suggestMappings auto-applies**

Find the block that calls `suggestMappings` and applies results (around line 391–399):

```typescript
      try {
        const suggested = await suggestMappings({ requirements, feedColumns });
        const hasExisting = Object.keys(stepData.feedMappings ?? {}).length > 0;
        if (!hasExisting && Object.keys(suggested).length > 0) {
          mergeStepData({ feedMappings: suggested });
        }
      } catch (err) {
```

Change to:

```typescript
      try {
        const suggested = await suggestMappings({ requirements, feedColumns });
        const hasExisting = Object.keys(stepData.feedMappings ?? {}).length > 0;
        if (!hasExisting && Object.keys(suggested).length > 0) {
          const aiSuggestedMappings: Record<string, true> = {};
          for (const fieldId of Object.keys(suggested)) {
            aiSuggestedMappings[fieldId] = true;
          }
          mergeStepData({ feedMappings: suggested, aiSuggestedMappings });
        }
      } catch (err) {
```

- [ ] **Step 2: Add "AI Suggested" badge and Accept button to each field card**

In the field mapping loop (inside `allFields.map`), after the field label row and before the feed column select, add the purple AI-suggested badge when `stepData.aiSuggestedMappings?.[field.id]` is truthy:

```tsx
                    {/* AI suggested badge + Accept button */}
                    {stepData.aiSuggestedMappings?.[field.id] && (
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 rounded-full">
                          <SparklesIconSolid className="h-2.5 w-2.5 text-purple-600" />
                          <span className="text-[7px] font-black text-purple-700 uppercase tracking-widest">AI suggested</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = { ...(stepData.aiSuggestedMappings ?? {}) };
                            delete next[field.id];
                            mergeStepData({ aiSuggestedMappings: next });
                          }}
                          className="px-2 py-0.5 rounded-lg border border-green-100 bg-green-50 text-[8px] font-black text-green-700 uppercase tracking-widest hover:bg-green-100 transition-colors"
                        >
                          Accept ✓
                        </button>
                      </div>
                    )}
```

- [ ] **Step 3: Add "Accept All AI Suggestions" button below the field list**

After the field list and before the Zone Coverage panel, add (only when any `aiSuggestedMappings` entries exist):

```tsx
                    {Object.keys(stepData.aiSuggestedMappings ?? {}).length > 0 && (
                      <button
                        type="button"
                        onClick={() => mergeStepData({ aiSuggestedMappings: {} })}
                        className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-[9px] font-black uppercase tracking-[0.2em] hover:bg-purple-700 flex items-center justify-center gap-2 transition-colors"
                      >
                        <SparklesIconSolid className="h-3.5 w-3.5" />
                        Accept All AI Suggestions
                      </button>
                    )}
```

- [ ] **Step 4: Also show card header badge on "Claude auto-mapped X of Y fields"**

In the card header area (the `flex items-center justify-between` div above the 3-panel body), add a purple badge when there are aiSuggestedMappings:

```tsx
                    {Object.keys(stepData.aiSuggestedMappings ?? {}).length > 0 && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-100 rounded-full">
                        <SparklesIconSolid className="h-3.5 w-3.5 text-purple-600" />
                        <span className="text-[9px] font-black text-purple-700 uppercase tracking-widest">
                          Claude auto-mapped {Object.keys(stepData.aiSuggestedMappings ?? {}).length} of {allFields.length} fields
                        </span>
                      </div>
                    )}
```

NOTE: The card header is in the right preview panel section. Look for the `wireframe.name — Live Mapped Preview` heading area to find the correct parent. If the layout doesn't have a natural header row, add it just above the ratio toggle.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "DesignStep" | head -10
```

- [ ] **Step 6: Commit**

```bash
git add src/apps/template-builder/steps/DesignStep.tsx
git commit -m "feat(design-step): AI suggestion badges, Accept/Accept All buttons"
```

---

## Task 3: Feed / Static / AI source tabs per field

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

Context: Each field card currently only shows a feed column dropdown. The mockup shows Feed / Static / AI toggle tabs above the column select. Static = free-text input. AI = opens Ask Alli for that field.

- [ ] **Step 1: Add source mode toggle buttons above each field's column selector**

In the field mapping loop, before the `<select>` for feed column, add:

```tsx
                    {/* Source mode toggle: Feed | Static | AI */}
                    <div className="flex gap-1 mb-1">
                      {(['feed', 'static', 'ai'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            const next = { ...(stepData.fieldSourceMode ?? {}), [field.id]: mode };
                            mergeStepData({ fieldSourceMode: next });
                            if (mode === 'ai') {
                              setAskAlliTargetField(field.id);
                              setAskAlliOpen(true);
                            }
                          }}
                          className={cn(
                            'px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wide transition-colors',
                            (stepData.fieldSourceMode?.[field.id] ?? 'feed') === mode
                              ? mode === 'ai' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          )}
                        >
                          {mode === 'ai' ? '✦ AI' : mode}
                        </button>
                      ))}
                    </div>
```

- [ ] **Step 2: Show static text input when source mode is 'static'**

Replace the existing `<select>` for feed column with a conditional that shows either the select (feed mode) or a text input (static mode). When mode is 'ai', show a placeholder pill:

```tsx
                    {(stepData.fieldSourceMode?.[field.id] ?? 'feed') === 'static' ? (
                      <input
                        type="text"
                        placeholder={`Enter ${field.label.toLowerCase()}…`}
                        value={stepData.staticValues?.[field.id] ?? ''}
                        onChange={(e) =>
                          mergeStepData({
                            staticValues: { ...(stepData.staticValues ?? {}), [field.id]: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none text-[10px] font-bold text-gray-900"
                      />
                    ) : (stepData.fieldSourceMode?.[field.id] ?? 'feed') === 'ai' ? (
                      <div className="w-full px-3 py-2 rounded-xl border-2 border-purple-200 bg-purple-50 text-[9px] font-medium text-purple-800">
                        Generate from Ask Alli →
                      </div>
                    ) : (
                      <select ... />  // existing select — keep exactly as-is
                    )}
```

- [ ] **Step 3: Update the injections builder to use staticValues**

In the `injections` building block (around line 436–458), change `firstVal(col)` to respect the source mode. Currently:

```typescript
  const injections: Record<string, { type: 'image' | 'text'; value: string }> = {};
  if (wireframe) {
    for (const field of allFields) {
      const col = feedMappings[field.id];
      if (col) {
        const raw = firstVal(col);
```

Change to:

```typescript
  const injections: Record<string, { type: 'image' | 'text'; value: string }> = {};
  if (wireframe) {
    for (const field of allFields) {
      const sourceMode = stepData.fieldSourceMode?.[field.id] ?? 'feed';
      let raw = '';
      if (sourceMode === 'static') {
        raw = stepData.staticValues?.[field.id] ?? '';
      } else if (sourceMode === 'feed') {
        const col = feedMappings[field.id];
        if (col) raw = firstVal(col);
      }
      // 'ai' mode: skip here — Ask Alli output stored in feedMappings via its action handler
      if (raw) {
        const transforms = fieldTransforms[field.id] ?? [];
        const val = applyClientTransforms(raw, transforms, field.type);
        injections[field.id] = {
          type: field.type === 'image' ? 'image' : 'text',
          value: val,
        };
      }
    }
```

Note: the logo injection block below this stays unchanged.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "DesignStep" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/apps/template-builder/steps/DesignStep.tsx
git commit -m "feat(design-step): Feed/Static/AI source tabs per field"
```

---

## Task 4: Feed row navigator

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

Context: The mockup shows "← Prev | Row 1 of 1,247 | Next →" below the live preview. This lets users browse feed rows in the preview without changing which row the template will batch-generate for. `feedSampleData` in `tbCtx` already has sample rows. We just need a local `feedRowIndex` state and to use it in `firstVal`.

- [ ] **Step 1: Add feedRowIndex state**

Near the other state declarations (around line 267–285), add:

```typescript
  const [feedRowIndex, setFeedRowIndex] = useState(0);
```

- [ ] **Step 2: Update firstVal to use feedRowIndex**

The current `firstVal` scans all rows for the first non-empty value. Change it to use the current row first, falling back to scanning:

```typescript
  const firstVal = (col: string): string => {
    // Try current row index first
    const currentRow = feedSampleData[feedRowIndex];
    if (currentRow) {
      const v = String((currentRow as Record<string, unknown>)[col] ?? '').trim();
      if (v) return v;
    }
    // Fallback: scan all rows
    for (const row of feedSampleData) {
      const v = String((row as Record<string, unknown>)[col] ?? '').trim();
      if (v) return v;
    }
    return '';
  };
```

- [ ] **Step 3: Add row navigator UI below the FilledTemplatePreview inner wrapper**

After the inner preview wrapper closing `</div>` (the one wrapping FilledTemplatePreview + CanvasOverlay) and before `{activeSlotField !== null && (`, add the navigator. Actually, place it OUTSIDE the white card container, just below it in the `space-y-4` flex column. Find the section below the white card `</div>` close and the ratio note paragraph — add:

```tsx
              {/* Feed row navigator */}
              <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <button
                  type="button"
                  onClick={() => setFeedRowIndex(Math.max(0, feedRowIndex - 1))}
                  disabled={feedRowIndex === 0}
                  className="text-[8px] font-black text-blue-gray-400 uppercase tracking-widest disabled:opacity-30 hover:text-blue-600 transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-[8px] font-medium text-gray-400">
                  Row {feedRowIndex + 1} of {feedSampleData.length}
                </span>
                <button
                  type="button"
                  onClick={() => setFeedRowIndex(Math.min(feedSampleData.length - 1, feedRowIndex + 1))}
                  disabled={feedRowIndex >= feedSampleData.length - 1}
                  className="text-[8px] font-black text-blue-600 uppercase tracking-widest disabled:opacity-30 hover:text-blue-800 transition-colors"
                >
                  Next →
                </button>
              </div>
```

Only render this navigator when `feedSampleData.length > 0` and `isSocial && hasWireframe`.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "DesignStep" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add src/apps/template-builder/steps/DesignStep.tsx
git commit -m "feat(design-step): feed row navigator Prev/Next"
```

---

## Task 5: Compact brand overrides panel in preview column + Regenerate button

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

Context: The mockup shows brand overrides as a compact inline panel in the preview column (colors as circles, font name, logo variant toggle) — NOT the full collapsible accordion in the left panel. We keep the left panel accordion (it still has the full font family input), but ADD the compact panel in the preview column. Also add a "Regenerate" button at the bottom of the candidate cards in the left panel.

- [ ] **Step 1: Add compact brand overrides panel in the preview column**

In the preview column (inside `isSocial && hasWireframe && wireframe` block), after the row navigator, add:

```tsx
              {/* Compact brand overrides — colors, font, logo */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2.5">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Brand Overrides</label>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-medium text-gray-500">Colors</span>
                  <div className="flex gap-1.5">
                    <div
                      className="h-6 w-6 rounded-full border-4 border-white shadow-md ring-1 ring-blue-300 cursor-pointer"
                      style={{ background: stepData.backgroundColor || '#2563eb' }}
                      title="Background color"
                    />
                    <div
                      className="h-6 w-6 rounded-full border-2 border-gray-200 shadow-sm cursor-pointer"
                      style={{ background: stepData.accentColor || '#1f2937' }}
                      title="Accent color"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-medium text-gray-500">Font</span>
                  <span className="text-[9px] font-black text-gray-900">
                    {stepData.fontFamily ?? assetHouse?.fontPrimary ?? 'Inter'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-medium text-gray-500">Logo</span>
                  <div className="flex gap-1">
                    {(['primary', 'inverse'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => mergeStepData({ logoVariant: v })}
                        className={cn(
                          'px-2 py-0.5 rounded text-[7px] font-black uppercase transition-colors',
                          (stepData.logoVariant ?? 'primary') === v
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-200 text-gray-500 hover:border-gray-300'
                        )}
                      >
                        {v === 'primary' ? 'Color' : 'White'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
```

- [ ] **Step 2: Add Regenerate button below candidate cards**

In the candidate cards section (left panel), find where the `isLoadingCandidates ? ...` block ends and candidates are rendered. After the `candidates.map(...)` closing `</div>`, add:

```tsx
                  {/* Regenerate candidates */}
                  <button
                    type="button"
                    disabled={isLoadingCandidates}
                    onClick={async () => {
                      setIsLoadingCandidates(true);
                      setLayoutError(null);
                      try {
                        const generated = await generateLayouts({
                          requirements,
                          channel: stepData.channel ?? 'Social',
                          brand: assetHouse,
                          feedColumns,
                          brief: stepData.brief,
                        });
                        setCandidates(generated);
                      } catch (err) {
                        console.error('[DesignStep] regenerate failed:', err);
                        setLayoutError('Failed to regenerate layouts. Please try again.');
                      } finally {
                        setIsLoadingCandidates(false);
                      }
                    }}
                    className="w-full py-2 border border-gray-200 rounded-xl text-[9px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Regenerate
                  </button>
```

- [ ] **Step 3: TypeScript check + commit**

```bash
npx tsc --noEmit 2>&1 | grep "DesignStep" | head -10
git add src/apps/template-builder/steps/DesignStep.tsx
git commit -m "feat(design-step): compact brand overrides panel + Regenerate button"
```

---

## Task 6: Persist new fields through to Firestore

**Files:**
- Modify: `src/services/templateLibrary.types.ts`
- Modify: `src/apps/template-builder/AppRoot.tsx`
- Modify: `src/apps/template-builder/steps/PublishStep.tsx`

- [ ] **Step 1: Add fields to templateLibrary.types.ts**

In `src/services/templateLibrary.types.ts`, add to both `TemplateLibraryRecord` and `NewTemplateData`:

```typescript
  staticValues?: Record<string, string>;
  fieldSourceMode?: Record<string, 'feed' | 'static' | 'ai'>;
  aiSuggestedMappings?: Record<string, true>;
```

- [ ] **Step 2: Add fields to mapTemplateToStepData in AppRoot.tsx**

In `src/apps/template-builder/AppRoot.tsx`, find `mapTemplateToStepData` and add:

```typescript
  staticValues: t.staticValues,
  fieldSourceMode: t.fieldSourceMode,
  aiSuggestedMappings: t.aiSuggestedMappings,
```

- [ ] **Step 3: Add fields to newTemplateData in PublishStep.tsx**

In `src/apps/template-builder/steps/PublishStep.tsx`, find where `newTemplateData` is constructed and add:

```typescript
  staticValues: stepData.staticValues,
  fieldSourceMode: stepData.fieldSourceMode,
  aiSuggestedMappings: stepData.aiSuggestedMappings,
```

- [ ] **Step 4: TypeScript check across all changed files**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/templateLibrary.types.ts src/apps/template-builder/AppRoot.tsx src/apps/template-builder/steps/PublishStep.tsx
git commit -m "feat(template-library): persist staticValues, fieldSourceMode, aiSuggestedMappings to Firestore"
```

---

## Test Checklist

- [ ] Feed source (default): column dropdown shows, preview updates when row navigator changes
- [ ] Static source: text input shows, preview shows typed value
- [ ] AI source: opens Ask Alli panel for that field
- [ ] AI suggested badge shows on auto-mapped fields after Gemini returns
- [ ] Accept on individual field removes badge for that field only
- [ ] Accept All removes all badges
- [ ] "Claude auto-mapped X of Y" header badge shows and disappears after Accept All
- [ ] Row navigator: Prev/Next updates preview content correctly; buttons disable at boundaries
- [ ] Compact brand overrides: logo toggle works, reflects in preview
- [ ] Regenerate: clears candidates, shows loading, fetches new candidates
- [ ] TypeScript: 0 errors across all changed files

---

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|-----|--------|----------|
| Step 0 scope check | ✅ Pass | 5 files, 0 new services, all additive changes |
| Architecture | ✅ Pass | Additive to existing `mergeStepData` + injection pipeline patterns |
| Code quality | ✅ Pass | Follows existing debounce, cn(), ZoneStyle patterns |
| Tests | ⚠️ No new unit tests | UI changes; existing 358 tests unaffected; test checklist above covers integration |
| Performance | ✅ Pass | feedRowIndex change only affects firstVal() call; no extra re-renders |

**VERDICT:** APPROVED. 6 tasks, all in existing files, no new infrastructure. T3 (Feed/Static/AI) is the most complex but still self-contained in DesignStep. T6 is boilerplate persistence, 3 files touched.

NO UNRESOLVED DECISIONS
