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
  uploadedAt:  Timestamp    // Firestore server timestamp
  uploadedBy:  string       // Firebase Auth uid
```

When mapping Firestore docs to `Creative` objects, `uploadedAt` must be converted: `doc.uploadedAt.toDate().toISOString()` to match the `Creative.uploadedAt: string` field type.

### Firebase Storage path

```
clients/{slug}/apps/ad-resizing/uploads/{uploadId}.{ext}
```

Constructed as: `paths.storage.app(slug, 'ad-resizing', `uploads/${uploadId}.${ext}`)` — using the existing path helper, not a literal template string.

### Upload ID generation

Use `crypto.randomUUID()` (already used in the codebase via `newBatchId()`). Generate the ID before any async work so both the Storage write and the Firestore write reference the same ID, and the Firestore write can be retried independently without re-uploading the file.

### `Creative` type changes

- **Do not narrow `source: string`** — `source` is already set to the feed name at multiple call sites (`feedToCreatives.ts`, `AppRoot.tsx` line 142). Narrowing it breaks those sites.
- **Add `sourceKind: 'alli' | 'upload'`** as a new discriminator field. Existing Alli-sourced creatives default to `sourceKind: 'alli'` (set in `feedToCreatives.ts`). Upload-sourced creatives set `sourceKind: 'upload'`.
- Fix `fileType` union: `'PNG' | 'JPG' | 'WEBP'` (drop `'GIF'`)
- Fix `detectFileType()` in `feedToCreatives.ts`: add explicit `.webp` → `'WEBP'` branch before the JPG fallback; remove the `.gif` → `'GIF'` branch
- Remove `'.gif'` from `IMAGE_EXTENSIONS` in `feedToCreatives.ts` so `.gif` URLs are no longer detected as valid image columns
- Update `FilterSortBar` `FILETYPE_OPTIONS`: replace `GIF` with `WEBP`
- Update `FileTypeFilter` type: `'all' | 'PNG' | 'JPG' | 'WEBP'`

**Existing Firestore documents with `fileType: 'GIF'`:** the `listUploads` mapper (and any place that maps Firestore docs to `Creative`) must coerce unknown `fileType` values to `'JPG'` as a safe fallback, so legacy serialized data does not produce a TypeScript runtime violation.

---

## Component Architecture

### FeedConnectScreen (modified)

Adds a two-tab header — **"From Alli"** and **"Upload Files"** — using local `useState`. Default active tab is "From Alli". The existing feed scanning UI renders unchanged under "From Alli". The new `UploadTab` component renders under "Upload Files". No changes to `WizardShell` or the app manifest.

**Prop addition:** `FeedConnectScreen` gains a second callback prop:
```typescript
onUploadConnect: (creatives: Creative[]) => void
```
The existing `onConnect: (feed: SelectedFeed, imageColumn: string, creatives: Creative[]) => void` is unchanged. `UploadTab` calls `onUploadConnect` when the user confirms their selection.

**In `AppRoot`**, a new `handleUploadConnect` handler is added alongside `handleFeedConnect`:
```typescript
function handleUploadConnect(creatives: Creative[]) {
  setFeedCreatives(creatives);
  setConnectedFeedLabel('Uploaded Files');  // shown in the connected-feed indicator UI
  setSelectedCreative(null);
  setSelectedChannels([]);
  setSelectedDimensions(new Set());
}
```
`FeedConnectScreen` receives both `onConnect={handleFeedConnect}` and `onUploadConnect={handleUploadConnect}`.

### New: `UploadTab` (`src/apps/ad-resizing/components/UploadTab.tsx`)

Owns the upload interaction and the uploaded-files grid.

- On mount: calls `uploadService.listUploads(clientSlug)` and renders existing uploads in `UploadedCreativeGrid`
- **Empty state:** full-screen drop zone — "Drag files here or click to browse"
- **With existing uploads:** compact "Upload more" drop zone above the grid
- Drop zone accepts `image/png, image/jpeg, image/webp`, multiple files
- On file selection: probe each file's dimensions in-browser via a `new Image()` + `URL.createObjectURL(file)` before calling the service; validate type and size client-side; show inline errors per file; upload valid files in parallel with progress indicators
- **Optimistic UI:** card appears in grid immediately using `URL.createObjectURL(file)` as a temporary `thumbnailUrl`. Once the upload completes and a real Storage download URL is available, the card updates to the permanent URL and `URL.createObjectURL` is revoked (`URL.revokeObjectURL(tempUrl)`).
- Multi-select works identically to the Alli creative grid (checkbox on hover, "Continue" button activates when ≥1 file selected)
- On "Continue": calls `onUploadConnect(selectedCreatives)` — connects to `AppRoot.handleUploadConnect`

**Note:** The existing `FileUpload.tsx` component (`src/components/FileUpload.tsx`) is not reused here. It is single-file, has no multi-select, and no upload progress support. `UploadTab` is built from scratch to meet these requirements.

### New: `UploadedCreativeGrid` (`src/apps/ad-resizing/components/UploadedCreativeGrid.tsx`)

Grid of uploaded creative cards. Visual style matches the existing Alli creative grid for consistency. Each card shows: thumbnail, filename, dimensions, file type badge. Checkbox multi-select on hover.

**FilterSortBar:** does not apply inside `UploadTab`. Once the user confirms selection and `feedCreatives` is set in `AppRoot`, the existing `FilterSortBar` applies to uploaded creatives the same way it applies to Alli creatives (they are in the same `feedCreatives` array). No special casing needed.

### New: `uploadService` (`src/apps/ad-resizing/services/uploadService.ts`)

Keeps upload logic out of components.

```typescript
uploadCreative(
  clientSlug: string,
  file: File,
  dimensions: { width: number; height: number }  // probed by UploadTab before calling
): Promise<Creative>
// crypto.randomUUID() → upload to Storage → write Firestore doc → return Creative with sourceKind: 'upload'

listUploads(clientSlug: string): Promise<Creative[]>
// Reads uploads collection, ordered by uploadedAt desc
// Maps to Creative[]: uploadedAt.toDate().toISOString(), coerce unknown fileType → 'JPG'

retryFirestoreWrite(clientSlug: string, uploadId: string, meta: UploadMeta): Promise<void>
// Used when Storage write succeeded but Firestore write failed — writes doc only
```

---

## Upload Flow

### New upload (empty state)

1. User opens "Upload Files" tab — full-screen drop zone shown
2. User drops or selects files (multi-select)
3. Client-side validation runs immediately per file:
   - Invalid type → inline error card ("GIF and video files are not supported"), skipped
   - Over 50 MB → inline error card ("File exceeds 50 MB limit"), skipped
4. Valid files: probe dimensions in-browser, then upload in parallel with progress indicators
5. Optimistic card shown immediately using `URL.createObjectURL`; updated to permanent URL on complete
6. On upload complete: Storage write → Firestore write → card becomes selectable
7. User selects creatives → "Continue" → `onUploadConnect` fires → dimension selection step

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

**Accepted tech debt (v1):** if a Storage write succeeds and the Firestore write fails and the user never retries, the Storage object becomes orphaned. No cleanup strategy in v1 — the file simply lives in Storage unreferenced. This is acceptable for launch given the 50 MB cap and low expected orphan rate.

---

## Results Step

Each source creative (whether from Alli or upload) gets its own labelled section in the results step. For uploaded files (`sourceKind: 'upload'`), the section header is `creative.name` (the original filename). For Alli creatives, the existing label logic is unchanged. No structural change to the results step component — just a conditional on `sourceKind` for the header label.

---

## File Type Fixes (alongside the upload feature)

| Location | Change |
|---|---|
| `types.ts` | `fileType: 'PNG' \| 'JPG' \| 'WEBP'` (was `\| 'GIF'`); add `sourceKind: 'alli' \| 'upload'` |
| `feedToCreatives.ts` — `IMAGE_EXTENSIONS` | Remove `'.gif'` |
| `feedToCreatives.ts` — `detectFileType` | Add `.webp` → `'WEBP'` branch before JPG fallback; remove `.gif` → `'GIF'` branch |
| `feedToCreatives.ts` — `feedToCreatives()` | Set `sourceKind: 'alli'` on each mapped creative |
| `FilterSortBar.tsx` — `FILETYPE_OPTIONS` | Replace `{ value: 'GIF', label: 'GIF' }` with `{ value: 'WEBP', label: 'WebP' }` |
| `FilterSortBar.tsx` — `FileTypeFilter` | `'all' \| 'PNG' \| 'JPG' \| 'WEBP'` |
| Firestore mappers | Coerce unknown `fileType` values → `'JPG'` to handle legacy `'GIF'` documents |

---

## What Is Not Changing

- `WizardShell` and app manifest — no new steps, no routing changes
- The outpaint/resize Cloud Functions — uploaded Firebase Storage URLs are passed as `originalUrl` identically to Alli CDN URLs; `sharp` already handles PNG/JPG/WebP
- The `outputs` collection — resized results from uploads land here exactly as with Alli-sourced creatives
- The `batches` collection — batch creation flow unchanged
- `source: string` field on `Creative` — not narrowed; `sourceKind` is the new discriminator

---

## Branch Strategy

Branch `feat/ad-resizing-upload` cut from `dev`. All implementation commits go on this branch. PR targets `dev`.
