# Template Builder — Expansion Plan & Decision Log

Living document. Updated as features are designed and shipped.
Owner: Annie Nguyen (annienguyen-pmg)
Branch: `feature/template-library` → future branches per feature

---

## What We're Building

A 3-step wizard (Setup → Design & Map → Publish) that lets PMG users:
1. Pick a data feed and write a creative brief
2. Choose a wireframe layout and map feed columns to template fields
3. Name and publish the template to the Template Library for reuse across campaigns

The template builder replaces the current Figma → HTML → GWD → Excel → Puppeteer → S3 → Alli → platform pipeline by giving non-technical users a self-serve way to create and publish ad templates.

---

## Architecture Overview

```
Browser (React)
  └── WizardShell  (src/platform/wizard/)
        ├── SetupStep      — feed selection, channel, ratios, brief
        ├── DesignStep     — wireframe picker, field mapping, brand overrides
        └── PublishStep    — name, review, publish to Firestore

AI Layer (Firebase Cloud Functions)
  └── helloWorld (onRequest, temp routing via ?templateAI=action)
        ├── synthesize      — Gemini: brief → required fields
        ├── generateLayouts — Gemini: requirements → 3 layout candidates
        └── suggestMappings — Gemini: requirements + feed columns → auto-map

Data Layer
  └── templateLibraryService (Firestore: /clients/{slug}/templateLibrary)
        ├── saveDraft()
        ├── publish()
        └── getPublishedTemplates()
```

**AI routing note (June 2026):** The 3 standalone Cloud Functions
(`synthesizeRequirementsAI`, `generateLayoutsAI`, `suggestMappingsAI`) are
deployed but lack the `allUsers` IAM invoker policy (Annie's account is
`functions.developer`, not `functions.admin`). Temporarily routed through
`helloWorld` (an existing function with correct IAM). When Diego returns from
PTO, ask him to run `gcloud functions add-iam-policy-binding` for all 3 and
then revert `templateAI.ts` to use `httpsCallable`.

---

## Shipped Features

### ✅ Phase 1 — Core Template Builder (June 2026)
**Branch:** `feature/template-library`

- **3-step WizardShell** with Setup → Design & Map → Publish
- **SetupStep**: feed search + filter, sort by recent, type filter, certified badge, creative brief
- **DesignStep**: wireframe picker for Social channel, field mapping with image column warning, brand overrides (color, font, logo variant)
- **PublishStep**: template name with amber nudge, metadata summary, publish to Firestore
- **Gemini AI wiring**: `synthesizeRequirements`, `generateLayouts`, `suggestMappings` via Cloud Functions
- **TemplateLibraryPage**: `/adlabs/:clientSlug/templates` — browse published templates
- **Dashboard link**: "View Template Library" added to DashboardPage

---

## In Progress

### 🔄 Phase 2 — Slot-Based Field Mapping (June 2026)
**Spec:** `docs/superpowers/specs/2026-06-10-slot-based-field-mapping-design.md`
**Status:** Spec approved, implementation plan pending

**Why:** Users need to:
1. Add custom fields beyond what Gemini generates (e.g. Callout, Price, Headline 2)
2. Explicitly assign each field to a visual zone in the template (e.g. "put price in #promo")
3. See a live preview that highlights which zone each field targets

**Key design decisions:**
- Bidirectional sync: clicking a field row highlights its zone in the preview; clicking a zone in the preview selects/creates the field in the panel
- Slot discovery: parse loaded wireframe HTML to extract all injectable element IDs
- Data model: additive — `slotMappings: Record<string, string>` + `customFields[]` added to `TemplateBuilderStepData`; backwards compatible
- `injectIntoHtml` gets a `slotOverrides` param — explicit slot assignment takes priority over `FIELD_ID_MAP` fallback
- Iframe communication via `postMessage` — injected script in template HTML, React listener in DesignStep

---

## Roadmap (Not Yet Started)

### Phase 3 — Template Library Enhancements
- Filter/search published templates by channel, feed, date
- Template duplication (clone + edit)
- Template versioning (update published template without breaking campaigns using it)
- Usage count — how many campaigns are using each template

### Phase 4 — Canvas Editor (Bigger Roadmap)
- Full Fabric.js canvas editor for creating custom template layouts from scratch
- Layer panel, element controls, typography system
- Export to HTML wireframe format compatible with existing injection system
- Replaces the need for external Figma → HTML pipeline entirely

### Phase 5 — Batch Variation
- Generate N ad variations from a single template + feed
- Size multiplier: one template → all ratios at once
- Brand variant: primary vs inverse vs seasonal

### Phase 6 — AI Iteration
- "Make it more minimal", "try a bolder headline" prompt-based template refinement
- Feedback loop: creative performance data → suggest layout improvements

---

## Technical Debt & Known Issues

| Issue | Priority | Notes |
|---|---|---|
| `helloWorld` IAM workaround | High | Revert after Diego grants IAM on 3 standalone functions |
| `gemini-3-flash-preview` in `ai.ts` | Medium | Not a real model name — check if `analyzeVideoForCutdowns` actually works |
| `@testing-library/dom` missing | Low | 8 test suites failing with missing dep — pre-existing, unrelated to template builder |
| `firebase-functions` outdated | Low | CLI warns on every deploy — upgrade carefully (breaking changes) |
| Preview shows wireframe placeholder (Pikachu) | Medium | Injection works at ad generation time but not in Publish preview — needs `injectIntoHtml` called with live feed sample data |

---

## Key Files

| File | Purpose |
|---|---|
| `src/apps/template-builder/` | Template builder wizard root |
| `src/apps/template-builder/steps/SetupStep.tsx` | Step 1: feed + brief |
| `src/apps/template-builder/steps/DesignStep.tsx` | Step 2: wireframe + field mapping |
| `src/apps/template-builder/steps/PublishStep.tsx` | Step 3: name + publish |
| `src/apps/template-builder/_internal/injectIntoHtml.ts` | Template injection engine |
| `src/services/ai/templateAI.ts` | Client-side AI calls |
| `src/services/templateLibrary.ts` | Firestore CRUD for templates |
| `src/pages/TemplateLibraryPage.tsx` | Browse page |
| `functions/src/template.ts` | 3 standalone Cloud Functions (IAM blocked) |
| `functions/src/index.ts` | `helloWorld` temp AI routing |
| `public/template_examples/` | Wireframe HTML files per channel |
