# Ad Resizing — External Image Upload
**Date:** 2026-05-14  
**Status:** Approved  
**Branch:** `feat/ad-resizing-upload` off `dev`

---

## Problem

AdLabs Ad Resizing currently sources creatives exclusively from Alli datasources (feeds scanned via `FeedConnectScreen`). Users with creative files that live outside Alli have no way to bring them into the resize pipeline without first ingesting them into Alli.

## Goal

Let users upload their own creative files (PNG, JPG, WebP) directly in the Ad Resizing wizard. Uploads persist to Firebase Storage and Firestore so they are available across sessions. Resized outputs go into the existing `outputs` collection. Each uploaded source file gets its own labelled section in the results step.

## Scope

- **App:** Ad Resizing only
- **File types accepted:** PNG, JPG, WebP (GIF excluded — pipeline not robust enough; animated GIFs would silently lose all frames)
- **Multi-upload:** Multiple files at once, each validated and uploaded in parallel
- **Per-file size limit:** 50 MB (matches existing pipeline constraint)
- **Out of scope for v1:** Standalone upload library/management page (natural follow-on)

---

## Data Model

### Firestore — new `uploads` collection

```
clients/{slug}/apps/ad-resizing/uploads/{uploadId}
  id:          string       // same as Firestore doc ID
  name:        string       // original filename
  url:         string       // Firebase Storage download URL
  fileType:    'PNG' | 'JPG' | 'WEBP'
  width:       number       // pixels, probed in-browser before upload
  height:      number       // pixels, probed in-browser before upload
  sizeBytes:   number       // raw file size
  uploadedAt:  Timestamp
  uploadedBy:  string       // Firebase Auth uid
```

### Firebase Storage path

```
clients/{slug}/apps/ad-resizing/uploads/{uploadId}.{ext}
```

Uses the existing `paths.storage.app(slug, 'ad-resizing', 'uploads/{uploadId}.{ext}')` path convention.

### `Creative` type changes

- Add `source: 'alli' | 'upload'` discriminator field
- Fix `fileType` union: `'PNG' | 'JPG' | 'WEBP'` (drop `'GIF'`)
- Fix `detectFileType()` in `feedToCreatives.ts`: add explicit `.webp` → `'WEBP'` branch before the JPG fallback
- Update `FilterSortBar` `FILETYPE_OPTIONS`: replace `GIF` with `WEBP`
- Update `FileTypeFilter` type: `'all' | 'PNG' | 'JPG' | 'WEBP'`

---

## Component Architecture

### FeedConnectScreen (modified)

Adds a two-tab header — **"From Alli"** and **"Upload Files"** — using local `useState`. Default active tab is "From Alli". The existing feed scanning UI renders unchanged under "From Alli". The new `UploadTab` component renders under "Upload Files". No changes to `WizardShell` or the app manifest.

### New: `UploadTab` (`src/apps/ad-resizing/components/UploadTab.tsx`)

Owns the upload interaction and the uploaded-files grid.

- On mount: calls `uploadService.listUploads(clientSlug)` and renders existing uploads in `UploadedCreativeGrid`
- **Empty state:** full-screen drop zone — "Drag files here or click to browse"
- **With existing uploads:** compact "Upload more" drop zone above the grid
- Drop zone accepts `image/png, image/jpeg, image/webp`, multiple files
- On file selection: validate each file client-side (type + size), show inline errors per file, upload valid files in parallel with progress indicators
- Optimistic UI: card appears in grid immediately with upload progress, transitions to complete state when done
- Multi-select works identically to the Alli creative grid (checkbox on hover, "Continue" button activates when ≥1 file selected)
- Passes selected `Creative[]` (with `source: 'upload'`) to the wizard's `mergeStepData` callback

### New: `UploadedCreativeGrid` (`src/apps/ad-resizing/components/UploadedCreativeGrid.tsx`)

Grid of uploaded creative cards. Visual style matches the existing Alli creative grid for consistency. Each card shows: thumbnail, filename, dimensions, file type badge. Checkbox multi-select on hover.

### New: `uploadService` (`src/apps/ad-resizing/services/uploadService.ts`)

Keeps upload logic out of components.

```typescript
uploadCreative(
  clientSlug: string,
  file: File,
  dimensions: { width: number; height: number }  // probed by UploadTab before calling
): Promise<Creative>
// Generates uploadId client-side (nanoid) → uploads to Storage at uploads/{uploadId}.{ext}
// → writes Firestore doc with same uploadId → returns Creative

listUploads(clientSlug: string): Promise<Creative[]>
// Reads uploads collection, ordered by uploadedAt desc, maps to Creative[]

retryFirestoreWrite(clientSlug: string, uploadId: string, meta: UploadMeta): Promise<void>
// Used when Storage write succeeded but Firestore write failed — writes doc only, Storage file already exists
```

**Upload ID:** generated client-side with `nanoid()` before any async work, used as both the Firestore doc ID and the Storage filename. This ensures both writes reference the same ID even if Firestore write is retried independently.

---

## Upload Flow

### New upload (empty state)

1. User opens "Upload Files" tab — full-screen drop zone shown
2. User drops or selects files (multi-select)
3. Client-side validation runs immediately per file:
   - Invalid type → inline error card ("GIF and video files are not supported"), skipped
   - Over 50 MB → inline error card ("File exceeds 50 MB limit"), skipped
4. Valid files upload in parallel, each showing a progress indicator
5. On complete: Storage write → Firestore write → card enters grid, ready to select
6. User selects creatives → "Continue" → dimension selection step (existing)

### Returning user (uploads exist)

1. User opens "Upload Files" tab — existing uploads load from Firestore, render in grid
2. Compact "Upload more" drop zone sits above grid
3. User selects from existing uploads and/or adds new ones
4. Continues as above

### Error states

| Error | Behaviour |
|---|---|
| Invalid file type | Inline error on card, skipped — does not block other files |
| File over 50 MB | Inline error on card, skipped |
| Storage upload fails | Card shows error state with retry button; Firestore doc not written |
| Storage write succeeds, Firestore write fails | Card shows error with retry; retry calls `retryFirestoreWrite` only — Storage file not re-uploaded |
| Firestore read fails on mount | Error banner above grid with retry; drop zone still functional |
| All files invalid | Drop zone shows summary error, nothing uploaded |

---

## Results Step

Each source creative (whether from Alli or upload) gets its own labelled section in the results step. For uploaded files the section header is the original filename. Resized variants list beneath it. This follows the existing per-creative grouping pattern — no structural change to the results step, just ensuring `source: 'upload'` creatives are labelled by `creative.name` instead of a feed column value.

---

## File Type Fixes (alongside the upload feature)

| Location | Change |
|---|---|
| `types.ts` | `fileType: 'PNG' \| 'JPG' \| 'WEBP'` (was `\| 'GIF'`) |
| `feedToCreatives.ts` — `detectFileType` | Add `.webp` → `'WEBP'` branch before JPG fallback |
| `FilterSortBar.tsx` — `FILETYPE_OPTIONS` | Replace `{ value: 'GIF', label: 'GIF' }` with `{ value: 'WEBP', label: 'WebP' }` |
| `FilterSortBar.tsx` — `FileTypeFilter` | `'all' \| 'PNG' \| 'JPG' \| 'WEBP'` |

---

## What Is Not Changing

- `WizardShell` and app manifest — no new steps, no routing changes
- The outpaint/resize Cloud Functions — uploaded Firebase Storage URLs are passed as `originalUrl` identically to Alli CDN URLs; `sharp` already handles PNG/JPG/WebP
- The `outputs` collection — resized results from uploads land here exactly as with Alli-sourced creatives
- The `batches` collection — batch creation flow unchanged

---

## Branch Strategy

Branch `feat/ad-resizing-upload` cut from `dev`. All implementation commits go on this branch. PR targets `dev`.
