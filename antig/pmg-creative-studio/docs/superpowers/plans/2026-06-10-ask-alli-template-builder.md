# Ask Alli — Template Builder Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Ask Alli chat panel to the template builder's Design & Map step, powered by Gemini with full template context, that can apply structured transformation rules (remove background, title case, etc.) to individual fields. Rules persist to Firestore at publish time.

**Architecture:** `AskAlliPanel` is a new isolated component that receives template context as props and manages its own message thread state via `stepData.askAlliMessages`. A new `?templateAI=chat` action in the existing `helloWorld` Cloud Function proxy handles multi-turn Gemini conversations with structured action responses. Transform rules live in `stepData.fieldTransforms` and are shown as badges on field rows. At publish, rules are written to `TemplateLibraryRecord.fieldTransforms`.

**Tech Stack:** React, TypeScript, Gemini 2.5 Flash via existing `helloWorld` proxy, `@heroicons/react/24/solid` (SparklesIcon — same as recrop pattern), Tailwind CSS, existing `TemplateBuilderStepData`, Firestore via `templateLibraryService`.

**Branch:** `feature/template-library`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/apps/template-builder/types.ts` | Modify | Add `askAlliMessages`, `fieldTransforms`, `AlliAction` type |
| `src/services/templateLibrary.types.ts` | Modify | Add `fieldTransforms` to `TemplateLibraryRecord` + `NewTemplateData` |
| `functions/src/index.ts` | Modify | Add `chat` action to `helloWorld` proxy |
| `src/apps/template-builder/_internal/AskAlliPanel.tsx` | **Create** | Chat panel component — messages, input, loading, action pills |
| `src/apps/template-builder/steps/DesignStep.tsx` | Modify | Sparkle trigger button, `askAlliOpen` state, transform badges, wire panel |
| `src/apps/template-builder/steps/PublishStep.tsx` | Modify | Pass `fieldTransforms` to `newTemplateData` |

---

## Task 1: Data model — `askAlliMessages`, `fieldTransforms`, `AlliAction`

**Files:**
- Modify: `src/apps/template-builder/types.ts`
- Modify: `src/services/templateLibrary.types.ts`

- [ ] **Step 1: Add `AlliAction`, `askAlliMessages`, `fieldTransforms` to template builder types**

Open `src/apps/template-builder/types.ts`. Add the `AlliAction` export union type BEFORE the `TemplateBuilderStepData` interface, and add `askAlliMessages` + `fieldTransforms` to `TemplateBuilderStepData`:

```typescript
import type { SelectedFeed } from '../../platform/datasources/types';
export type { SelectedFeed };

export type Channel = 'Social' | 'Programmatic' | 'Print' | 'Digital Signage';
export type LogoVariant = 'primary' | 'inverse';

export interface RequirementField {
  id: string;
  label: string;
  category: 'Brand' | 'Dynamic' | 'System';
  source: string;
  type: 'text' | 'image' | 'currency' | 'button' | 'asset';
  value?: string;
}

export type AlliAction =
  | { type: 'add_transform'; fieldId: string; transform: string }
  | { type: 'remove_transform'; fieldId: string; transform: string }
  | { type: 'suggest_mapping'; fieldId: string; column: string }
  | { type: 'suggest_slot'; fieldId: string; slotId: string };

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
  feedMappings?: Record<string, string>;    // fieldId → columnName
  uploadValues?: Record<string, string>;    // fieldId → dataURL or URL
  slotMappings?: Record<string, string>;    // fieldId → explicit slotId override
  customFields?: Array<{                    // user-added fields beyond Gemini
    id: string;
    label: string;
    type: 'text' | 'image' | 'currency' | 'button' | 'asset';
  }>;
  fieldTransforms?: Record<string, string[]>; // fieldId → transform IDs
  askAlliMessages?: Array<{                   // persistent chat history
    role: 'user' | 'assistant';
    content: string;
    actions?: AlliAction[];
  }>;
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

- [ ] **Step 2: Add `fieldTransforms` to `TemplateLibraryRecord` and `NewTemplateData`**

Open `src/services/templateLibrary.types.ts`. Add `fieldTransforms` to `TemplateLibraryRecord` after `fieldMappings`:

```typescript
fieldMappings: Record<string, FieldMapping>;
fieldTransforms?: Record<string, string[]>; // fieldId → transform IDs (e.g. ["remove_bg"])
```

`NewTemplateData` is a `Pick` of `TemplateLibraryRecord` plus overrides. Add `fieldTransforms` to the intersection at the end:

```typescript
export type NewTemplateData = Pick<
  TemplateLibraryRecord,
  | 'name'
  | 'channel'
  | 'adSizes'
  | 'scaffoldId'
  | 'scaffoldSnapshot'
  | 'datasourceId'
  | 'datasourceName'
  | 'feedSnapshot'
  | 'fieldMappings'
  | 'brandOverrides'
> & {
  brief?: string;
  aiRequirements?: TemplateLibraryRecord['aiRequirements'];
  fieldTransforms?: Record<string, string[]>;
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/types.ts src/services/templateLibrary.types.ts && git commit -m "feat: add askAlliMessages, fieldTransforms, AlliAction to template builder types"
```

---

## Task 2: Add `chat` action to `helloWorld` Cloud Function

**Files:**
- Modify: `functions/src/index.ts`

Add a new `else if (action === 'chat')` branch to the existing `helloWorld` request handler. The branch calls Gemini with a structured JSON response schema that returns `content` + optional `actions`.

- [ ] **Step 1: Add the `chat` action branch to `helloWorld` in `functions/src/index.ts`**

Read the current file first:
```bash
grep -n "action ==\|} else if\|synthesize\|generateLayouts\|suggestMappings" /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio/functions/src/index.ts | head -20
```

Find the `} else {` fallback that returns `Unknown templateAI action`. Add this new branch BEFORE that fallback:

```typescript
} else if (action === 'chat') {
  const { messages, templateContext } = body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    templateContext: {
      channel: string;
      brief?: string;
      brand: { primaryColor?: string; fontPrimary?: string } | null;
      fieldMappings: Record<string, string>;
      slotMappings: Record<string, string>;
      fieldTransforms: Record<string, string[]>;
      requirements: Array<{ id: string; label: string; type: string }>;
      feedColumns: string[];
    };
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    response.status(400).json({ error: 'messages array is required' });
    return;
  }

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          content: { type: SchemaType.STRING },
          actions: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                type:      { type: SchemaType.STRING },
                fieldId:   { type: SchemaType.STRING },
                transform: { type: SchemaType.STRING },
                column:    { type: SchemaType.STRING },
                slotId:    { type: SchemaType.STRING },
              },
              required: ['type'],
            },
          },
        },
        required: ['content'],
      },
    },
  });

  const ctx = templateContext;
  const systemPrompt = `You are Alli, an AI creative assistant helping build an ad template.

Current template context:
- Channel: ${ctx.channel}
- Brief: "${ctx.brief || '(none)'}"
- Brand color: ${ctx.brand?.primaryColor ?? 'unknown'}, font: ${ctx.brand?.fontPrimary ?? 'Inter'}
- Fields and their feed column mappings: ${JSON.stringify(ctx.fieldMappings)}
- Slot assignments: ${JSON.stringify(ctx.slotMappings)}
- Transforms already applied: ${JSON.stringify(ctx.fieldTransforms)}
- All available feed columns: ${JSON.stringify(ctx.feedColumns)}
- Template fields: ${JSON.stringify(ctx.requirements.map((r) => ({ id: r.id, label: r.label, type: r.type })))}

You can suggest structured actions when the user asks you to make changes. Available actions:
- add_transform: apply a processing rule to a field at generation time
  { "type": "add_transform", "fieldId": "image_url", "transform": "remove_bg" }
- remove_transform: remove a transform rule
  { "type": "remove_transform", "fieldId": "image_url", "transform": "remove_bg" }
- suggest_mapping: recommend a feed column for a field
  { "type": "suggest_mapping", "fieldId": "headline", "column": "product_title" }
- suggest_slot: recommend a template slot for a field
  { "type": "suggest_slot", "fieldId": "headline", "slotId": "headline1" }

Available transforms:
- Image fields: remove_bg (remove background), enhance (upscale/sharpen), reframe (smart crop)
- Text fields: title_case (Title Case), uppercase (ALL CAPS), truncate_50 (trim to 50 chars)

Rules:
- Only suggest actions when the user explicitly asks for a change
- Always explain what you are doing in "content"
- If no actions are needed, return "actions": []
- Match fieldId exactly to the fields listed in the template context above`;

  // Build conversation with system context prepended to first user message
  const conversationMessages = messages.map((m, i) => {
    if (i === 0 && m.role === 'user') {
      return { role: 'user' as const, parts: [{ text: `${systemPrompt}\n\nUser: ${m.content}` }] };
    }
    return { role: m.role as 'user' | 'model', parts: [{ text: m.content }] };
  });

  let chatText: string;
  try {
    const chat = model.startChat({ history: conversationMessages.slice(0, -1) });
    const lastMessage = conversationMessages[conversationMessages.length - 1];
    const result = await chat.sendMessage(lastMessage.parts[0].text);
    chatText = result.response.text();
  } catch (err) {
    throw new functions.https.HttpsError('internal', `Gemini chat failed: ${(err as Error).message}`);
  }

  let parsed: { content: string; actions?: unknown[] };
  try {
    parsed = JSON.parse(chatText) as { content: string; actions?: unknown[] };
  } catch {
    throw new functions.https.HttpsError('internal', `AI returned unparseable response: ${chatText.slice(0, 200)}`);
  }

  response.json(parsed);
```

- [ ] **Step 2: Verify TypeScript compiles in functions**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio/functions && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Deploy `helloWorld`**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx firebase-tools deploy --only functions:helloWorld --project automated-creative-e10d7 2>&1 | tail -10
```

Expected: `✔ Deploy complete!`

- [ ] **Step 4: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add functions/src/index.ts && git commit -m "feat: add chat action to helloWorld proxy for Ask Alli template builder conversation"
```

---

## Task 3: Create `AskAlliPanel` component

**Files:**
- Create: `src/apps/template-builder/_internal/AskAlliPanel.tsx`

Isolated chat panel component. Receives `stepData` + `mergeStepData` + template context props. Manages `inputText` and `isLoading` locally; conversation history lives in `stepData.askAlliMessages`.

- [ ] **Step 1: Create `AskAlliPanel.tsx`**

```tsx
// src/apps/template-builder/_internal/AskAlliPanel.tsx
import { useState, useRef, useEffect } from 'react';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { TemplateBuilderStepData, AlliAction } from '../types';
import type { RequirementField } from '../types';

const PROXY = '/api/helloWorld';

interface AskAlliPanelProps {
  stepData: TemplateBuilderStepData;
  mergeStepData: (patch: Partial<TemplateBuilderStepData>) => void;
  onClose: () => void;
  targetFieldId?: string | null;
  requirements: RequirementField[];
  feedColumns: string[];
  brand: { primaryColor?: string; fontPrimary?: string } | null;
}

const TRANSFORM_LABELS: Record<string, string> = {
  remove_bg: 'Remove background',
  enhance: 'Enhance',
  reframe: 'Smart crop',
  title_case: 'Title Case',
  uppercase: 'ALL CAPS',
  truncate_50: 'Truncate 50',
};

export function AskAlliPanel({
  stepData,
  mergeStepData,
  onClose,
  targetFieldId,
  requirements,
  feedColumns,
  brand,
}: AskAlliPanelProps) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = stepData.askAlliMessages ?? [];

  // Seed with a greeting if no history yet
  const displayMessages = messages.length === 0
    ? [{ role: 'assistant' as const, content: "I can help you configure this template. Ask me to map fields, assign slots, or apply transformations — like removing a background or converting text to title case.", actions: [] as AlliAction[] }]
    : messages;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, isLoading]);

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isLoading) return;

    const userMessage = { role: 'user' as const, content: text };
    const updatedMessages = [...messages, userMessage];
    mergeStepData({ askAlliMessages: updatedMessages });
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch(`${PROXY}?templateAI=chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          templateContext: {
            channel: stepData.channel ?? 'Social',
            brief: stepData.brief,
            brand,
            fieldMappings: stepData.feedMappings ?? {},
            slotMappings: stepData.slotMappings ?? {},
            fieldTransforms: stepData.fieldTransforms ?? {},
            requirements: requirements.map((r) => ({ id: r.id, label: r.label, type: r.type })),
            feedColumns,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ask Alli error (${res.status}): ${errText}`);
      }

      const data = await res.json() as { content: string; actions?: AlliAction[] };
      const assistantMessage = {
        role: 'assistant' as const,
        content: data.content,
        actions: data.actions ?? [],
      };

      // Apply actions to stepData
      const newTransforms = { ...(stepData.fieldTransforms ?? {}) };
      const newMappings = { ...(stepData.feedMappings ?? {}) };
      const newSlots = { ...(stepData.slotMappings ?? {}) };

      for (const action of (data.actions ?? [])) {
        if (action.type === 'add_transform') {
          const existing = newTransforms[action.fieldId] ?? [];
          if (!existing.includes(action.transform)) {
            newTransforms[action.fieldId] = [...existing, action.transform];
          }
        } else if (action.type === 'remove_transform') {
          newTransforms[action.fieldId] = (newTransforms[action.fieldId] ?? []).filter(
            (t) => t !== action.transform
          );
          if (newTransforms[action.fieldId].length === 0) delete newTransforms[action.fieldId];
        } else if (action.type === 'suggest_mapping') {
          newMappings[action.fieldId] = action.column;
        } else if (action.type === 'suggest_slot') {
          newSlots[action.fieldId] = action.slotId;
        }
      }

      mergeStepData({
        askAlliMessages: [...updatedMessages, assistantMessage],
        fieldTransforms: newTransforms,
        feedMappings: newMappings,
        slotMappings: newSlots,
      });
    } catch (err) {
      const errorMessage = {
        role: 'assistant' as const,
        content: `Something went wrong: ${(err as Error).message}`,
        actions: [] as AlliAction[],
      };
      mergeStepData({ askAlliMessages: [...updatedMessages, errorMessage] });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-[13px] font-semibold text-indigo-600">Ask Alli</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close Ask Alli"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Target field context pill */}
      {targetFieldId && (
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 shrink-0">
          <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
            Asking about: {requirements.find((r) => r.id === targetFieldId)?.label ?? targetFieldId}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {displayMessages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed',
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm'
              )}
            >
              <p>{msg.content}</p>
              {/* Action pills */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.actions.map((action, ai) => (
                    <span
                      key={ai}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase tracking-wide"
                    >
                      {action.type === 'add_transform' && `✓ ${TRANSFORM_LABELS[action.transform] ?? action.transform} → ${action.fieldId}`}
                      {action.type === 'remove_transform' && `✕ ${action.transform} → ${action.fieldId}`}
                      {action.type === 'suggest_mapping' && `→ ${action.fieldId}: ${action.column}`}
                      {action.type === 'suggest_slot' && `→ ${action.fieldId}: ${action.slotId}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0 border-t border-gray-100">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#eef0f6',
            borderRadius: 9999,
            padding: '6px 6px 6px 14px',
            gap: 8,
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendMessage(); }}
            placeholder="Ask Alli about this template…"
            disabled={isLoading}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              color: '#374151',
              padding: 0,
            }}
          />
          <button
            type="button"
            disabled={!inputText.trim() || isLoading}
            onClick={() => void sendMessage()}
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: inputText.trim() && !isLoading
                ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
                : '#c4c6d4',
              border: 'none',
              cursor: inputText.trim() && !isLoading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
            aria-label="Send message"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/_internal/AskAlliPanel.tsx && git commit -m "feat: create AskAlliPanel component for template builder — multi-turn chat with structured actions"
```

---

## Task 4: Wire Ask Alli into DesignStep — trigger, panel, transform badges

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

Three changes:
1. Import `AskAlliPanel` + `SparklesIcon` (solid), add `askAlliOpen` + `askAlliTargetField` state
2. Add sparkle trigger button on the preview container
3. Add transform badges to each field row
4. Split-screen: when Alli panel is open, preview shrinks to 50% and panel takes the other 50%

- [ ] **Step 1: Add imports and state**

At the top of DesignStep.tsx, add to the existing heroicons import (note: use `@heroicons/react/24/solid` for SparklesIcon to match recrop pattern):

```typescript
import { SparklesIcon } from '@heroicons/react/24/solid';
import { AskAlliPanel } from '../_internal/AskAlliPanel';
```

Inside `DesignStepBody`, after the existing state declarations, add:

```typescript
const [askAlliOpen, setAskAlliOpen] = useState(false);
const [askAlliTargetField, setAskAlliTargetField] = useState<string | null>(null);
```

Add derived value after existing derived values:

```typescript
const fieldTransforms = stepData.fieldTransforms ?? {};
```

- [ ] **Step 2: Add transform badges to field rows**

Inside the `allFields.map(...)` block, after the existing slot picker section and before the "Remove field" button, add:

```tsx
{/* Transform badges */}
{(fieldTransforms[field.id] ?? []).length > 0 && (
  <div className="flex flex-wrap gap-1 pt-0.5">
    {(fieldTransforms[field.id] ?? []).map((transform) => (
      <span
        key={transform}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase tracking-wide"
      >
        {transform.replace(/_/g, ' ')}
        <button
          type="button"
          onClick={() => {
            const next = { ...fieldTransforms };
            next[field.id] = (next[field.id] ?? []).filter((t) => t !== transform);
            if (next[field.id].length === 0) delete next[field.id];
            mergeStepData({ fieldTransforms: next });
          }}
          className="ml-0.5 text-indigo-400 hover:text-indigo-700"
          title={`Remove ${transform}`}
        >
          ×
        </button>
      </span>
    ))}
  </div>
)}
```

Also add a sparkle button next to each field label (inside the label row `div className="flex items-center gap-2"`, after the `isSuggested` badge):

```tsx
<button
  type="button"
  title="Ask Alli about this field"
  onClick={() => { setAskAlliTargetField(field.id); setAskAlliOpen(true); }}
  className="h-4 w-4 text-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
>
  <SparklesIcon className="h-3.5 w-3.5" />
</button>
```

- [ ] **Step 3: Add Ask Alli trigger button on the preview and wire the panel**

Find the `isSocial && hasWireframe && wireframe` block in the right panel. Replace the outer `<div className="space-y-4">` wrapper with this version that conditionally shows the panel:

```tsx
{isSocial && hasWireframe && wireframe && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          {wireframe.name} — Live Mapped Preview
        </span>
      </div>
      {/* Ask Alli trigger */}
      <button
        type="button"
        onClick={() => { setAskAlliTargetField(null); setAskAlliOpen((v) => !v); }}
        className="inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 pl-2 pr-3 py-1 text-white shadow-lg shadow-indigo-500/30 text-[10px] font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all"
      >
        <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
        Ask Alli
      </button>
    </div>

    {activeSlotField !== null && (
      <div className="flex items-center justify-between px-4 py-2 bg-blue-600 rounded-xl text-white">
        <span className="text-[10px] font-black uppercase tracking-widest">
          Click a zone to assign to "{allFields.find((r) => r.id === activeSlotField)?.label ?? activeSlotField}"
        </span>
        <button type="button" onClick={() => setActiveSlotField(null)} className="text-blue-200 hover:text-white text-[9px] font-bold uppercase tracking-widest">Cancel</button>
      </div>
    )}

    {/* Preview + optional Ask Alli panel side by side */}
    <div className={cn('flex gap-4', askAlliOpen ? 'items-stretch' : '')}>
      <div
        className={cn(
          'bg-white rounded-3xl p-6 shadow-xl border border-gray-100 flex items-center justify-center overflow-hidden transition-all',
          askAlliOpen ? 'flex-1' : 'w-full'
        )}
        style={{ minHeight: '360px' }}
      >
        <FilledTemplatePreview
          templateFile={wireframe.file}
          name={wireframe.name}
          scale={askAlliOpen ? 280 / (wireframe.adSize || 1024) : 360 / (wireframe.adSize || 1024)}
          adSize={wireframe.adSize || 1024}
          injections={injections}
          cssOverrides={cssOverrides}
          slotOverrides={stepData.slotMappings}
          slotSelectionMode={activeSlotField !== null}
          highlightSlot={activeSlotField !== null ? ((stepData.slotMappings ?? {})[activeSlotField] ?? null) : null}
          onSlotClick={(slotId) => {
            if (activeSlotField) {
              mergeStepData({ slotMappings: { ...(stepData.slotMappings ?? {}), [activeSlotField]: slotId } });
              setActiveSlotField(null);
            }
          }}
        />
      </div>

      {askAlliOpen && (
        <div className="w-72 rounded-3xl border border-gray-100 shadow-xl overflow-hidden flex flex-col" style={{ minHeight: '360px' }}>
          <AskAlliPanel
            stepData={stepData}
            mergeStepData={mergeStepData}
            onClose={() => setAskAlliOpen(false)}
            targetFieldId={askAlliTargetField}
            requirements={requirements}
            feedColumns={feedColumns}
            brand={assetHouse}
          />
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Fix any errors. Common issues:
- `SparklesIcon` from solid vs outline — make sure the import is from `@heroicons/react/24/solid`
- `assetHouse` type — it comes from `useAssetHouse()` and is `ClientAssetHouse | null`, the `AskAlliPanel` brand prop accepts `{ primaryColor?: string; fontPrimary?: string } | null` which is a subset, so it's compatible

- [ ] **Step 5: Run tests**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npm test -- --run 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/steps/DesignStep.tsx && git commit -m "feat: wire Ask Alli panel into DesignStep — trigger button, transform badges, side-by-side layout"
```

---

## Task 5: Persist `fieldTransforms` through PublishStep

**Files:**
- Modify: `src/apps/template-builder/steps/PublishStep.tsx`

- [ ] **Step 1: Add `fieldTransforms` to `newTemplateData`**

Read the current `newTemplateData` construction in `PublishStepBody`. Find where `fieldMappings` is assigned and add `fieldTransforms` right after:

```typescript
fieldMappings: buildFieldMappings(feedMappings, uploadValues, stepData.slotMappings),
fieldTransforms: stepData.fieldTransforms ?? {},
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Expected: no errors. If you see a TypeScript error on `fieldTransforms` not existing on `NewTemplateData`, double-check Task 1 Step 2 was applied correctly.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npm test -- --run 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/steps/PublishStep.tsx && git commit -m "feat: persist fieldTransforms to Firestore at template publish"
```

---

## Testing the Full Flow

After all tasks complete:

1. Open `http://localhost:5177/adlabs/ralph_lauren/template-builder`
2. Complete Step 1, select a Social wireframe on Step 2
3. Verify: each field row shows a `✦` sparkle button next to the field label
4. Click `✦` on the Product Image field → Ask Alli panel opens with "Asking about: Product Image" context pill
5. Type: "Remove the background from the product image"
6. Expect: Alli responds and adds a `remove_bg` indigo badge on the Product Image field row
7. Type: "Make the headline title case"
8. Expect: `title_case` badge appears on the Headline field row
9. Close Alli, navigate back to Step 1 and forward to Step 2 — verify messages are still there (persisted in stepData)
10. Publish — verify the published Firestore document has `fieldTransforms: { "image_url": ["remove_bg"], "headline": ["title_case"] }`
