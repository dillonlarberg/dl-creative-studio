# Ask Alli — Template Builder Integration Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a persistent Ask Alli chat panel to the template builder's Design & Map step. The AI maintains full conversation context for the current template session, can answer questions about any field/slot, and applies structured transformation rules (remove background, rewrite copy, etc.) to fields. Rules are stored with the template for execution at ad generation time.

**Architecture:** A floating chat panel in DesignStep powered by Gemini via the existing `helloWorld` proxy (`?templateAI=chat`). Conversation history and transform rules are stored in `TemplateBuilderStepData` so they persist across step navigation. The AI receives full template context on every message. Actions returned by the AI are applied immediately to the UI state.

---

## Data Model

### New fields on `TemplateBuilderStepData`

```typescript
askAlliMessages?: Array<{
  role: 'user' | 'assistant';
  content: string;
  actions?: AlliAction[];   // actions the AI returned (for display, not re-execution)
}>;

fieldTransforms?: Record<string, string[]>;
// fieldId → list of transform IDs to apply at generation time
// e.g. { "image_url": ["remove_bg"], "headline": ["title_case"] }
```

### New `AlliAction` type (in `src/apps/template-builder/types.ts`)

```typescript
export type AlliAction =
  | { type: 'add_transform'; fieldId: string; transform: string }
  | { type: 'remove_transform'; fieldId: string; transform: string }
  | { type: 'suggest_mapping'; fieldId: string; column: string }
  | { type: 'suggest_slot'; fieldId: string; slotId: string };
```

### Supported transforms

**Image fields:**
- `remove_bg` — background removal (Replicate, post-Friday)
- `enhance` — upscale/sharpen
- `reframe` — smart crop to aspect ratio

**Text fields:**
- `title_case` — Title Case
- `uppercase` — ALL CAPS
- `truncate_50` — truncate to 50 characters

### New field on `NewTemplateData` (persistence)

```typescript
fieldTransforms?: Record<string, string[]>;
```

---

## Ask Alli Chat Panel UI

**Trigger:** Floating gradient button (sparkle icon, indigo-to-violet, matches recrop pattern) at the top-right corner of the preview container. Always visible when a wireframe is selected.

**Panel:** Slides in over the right 60% of the design step. Does NOT replace the preview — the preview shrinks to make room or the panel overlays.

**Layout:**
```
┌─────────────────────────────────────┐
│ ✦ Ask Alli          [×]             │
│─────────────────────────────────────│
│ [Assistant bubble]                  │
│  "I can help you configure this     │
│   template. What would you like     │
│   to change?"                       │
│                                     │
│ [User bubble]                       │
│  "Make the product image have no    │
│   background"                       │
│                                     │
│ [Assistant bubble]                  │
│  "Applied background removal to     │
│   Product Image. It will run at     │
│   generation time."                 │
│  [🎨 remove_bg → image_url]        │
│─────────────────────────────────────│
│ [Type a message...          ] [→]   │
└─────────────────────────────────────┘
```

**Context pill (optional):** When opened from a focused field row, show a pill at the top of the input: "Asking about: Product Image [×]"

---

## AI Backend (`helloWorld` proxy, new `chat` action)

### Request shape

```typescript
{
  action: 'chat',
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  templateContext: {
    channel: string;
    brief: string;
    brand: { primaryColor?: string; fontPrimary?: string } | null;
    fieldMappings: Record<string, string>;       // fieldId → column
    slotMappings: Record<string, string>;        // fieldId → slotId
    fieldTransforms: Record<string, string[]>;   // fieldId → transforms
    requirements: Array<{ id: string; label: string; type: string }>;
    feedColumns: string[];
  }
}
```

### Response shape (JSON from Gemini)

```typescript
{
  content: string;           // chat response text
  actions?: AlliAction[];    // structured actions to apply to the UI
}
```

### Gemini prompt strategy

System context injected at the top of every conversation:
```
You are Alli, an AI assistant helping build an ad template.

Current template:
- Channel: {channel}
- Brief: "{brief}"
- Fields mapped: {fieldMappings as JSON}
- Transforms applied: {fieldTransforms as JSON}
- Available feed columns: {feedColumns}

You can suggest actions. Return them as a JSON object:
{
  "content": "your response",
  "actions": [
    { "type": "add_transform", "fieldId": "image_url", "transform": "remove_bg" }
  ]
}

Available transforms:
- Image: remove_bg, enhance, reframe
- Text: title_case, uppercase, truncate_50

Only suggest actions when the user explicitly asks for a change.
Always explain what you're doing in "content".
```

---

## Transform Badges on Field Rows

Each field row in DesignStep shows transform badges when `fieldTransforms[field.id]` has entries:

```
[HEADLINE]  TEXT   [title ▾]   →   [#headline ▾]
            [title_case ×]          ← badge
```

Badge style: small pill, `bg-indigo-50 text-indigo-700`, with `×` to remove.

---

## Files Changed

| File | Action | Change |
|---|---|---|
| `src/apps/template-builder/types.ts` | Modify | Add `askAlliMessages`, `fieldTransforms`, `AlliAction` type |
| `functions/src/index.ts` | Modify | Add `chat` action to `helloWorld` proxy |
| `src/apps/template-builder/steps/DesignStep.tsx` | Modify | Ask Alli panel, transform badges, open-from-field trigger |
| `src/apps/template-builder/steps/PublishStep.tsx` | Modify | Pass `fieldTransforms` to `newTemplateData` |
| `src/services/templateLibrary.types.ts` | Modify | Add `fieldTransforms` to `NewTemplateData` |

---

## Out of Scope (post-Friday)

- Actually calling Replicate/remove.bg to process preview images in the builder
- Wiring `fieldTransforms` into the Puppeteer/ad generation pipeline
- Streaming AI responses (all responses are complete JSON, no streaming)
- Undo/redo for applied transforms
