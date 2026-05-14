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

**Timestamp conversion:** when mapping Firestore docs to `Creative`, convert via `doc.uploadedAt.toDate().toISOString()` to match `Creative.uploadedAt: string`.

**Firestore collection ref:** build as `collection(db, 'clients', slug, 'apps', 'ad-resizing', 'uploads')` — do not hand-write path strings. No new `paths.ts` helper is required; compose from the existing segment pattern used elsewhere in the codebase.

**Ordering index:** `listUploads` queries `orderBy('uploadedAt', 'desc')`. This requires a single-field index on `uploadedAt` in the `uploads` collection. Add the entry to `firestore.indexes.json` alongside this feature — Firebase will throw a clear runtime error with an auto-link if the index is missing, but deploying it proactively avoids the production error entirely.

### Firebase Storage path

```
clients/{slug}/apps/ad-resizing/uploads/{uploadId}.{ext}
```

Constructed as: `paths.storage.app(slug, 'ad-resizing', \`uploads/${uploadId}.${ext}\`)` using the existing path helper.

### Firebase Security Rules

**No rules changes required.** Both Firestore and Storage already have wildcard rules covering the entire `clients/{slug}/...` tree for `isAlliStudioUser()`. The new `uploads` collection and Storage path fall inside those wildcards automatically.

### Upload ID generation

`newBatchId()` is a local function in `AppRoot.tsx` (lines 32–35) that wraps `crypto.randomUUID()` with a fallback for environments without `crypto`. **Extract `newBatchId` to a shared util** (e.g., `src/utils/ids.ts`) so `uploadService` can import it without duplicating the guard. Generate the ID before any async work so both the Storage write and Firestore write reference the same ID, enabling the Firestore write to be retried independently.

### `UploadMeta` type (used by `retryFirestoreWrite`)

```typescript
interface UploadMeta {
  name: string;
  url: string;
  fileType: 'PNG' | 'JPG' | 'WEBP';
  width: number;
  height: number;
  sizeBytes: number;
  uploadedBy: string;
}
```

### `Creative` type changes

- **Do not narrow `source: string`** — already set to feed name at multiple call sites (`feedToCreatives.ts`, `AppRoot.tsx` line 142). Narrowing it breaks those sites.
- **Add `sourceKind?: 'alli' | 'upload'`** as an **optional** discriminator. Optional avoids breaking the deep-link synthetic `Creative` literal in `AppRoot.tsx` (lines 132–147) and any other construction sites not explicitly listed here. Absence of `sourceKind` is treated as `'alli'` everywhere it is consumed.
- Fix `fileType` union: `'PNG' | 'JPG' | 'WEBP'` (drop `'GIF'`)
- Fix `detectFileType()` in `feedToCreatives.ts`: add explicit `.webp` → `'WEBP'` branch before the JPG fallback; remove the `.gif` → `'GIF'` branch
- Remove `'.gif'` from `IMAGE_EXTENSIONS` in `feedToCreatives.ts` so `.gif` URLs are no longer detected as valid image columns
- Update `FilterSortBar` `FILETYPE_OPTIONS`: replace `GIF` with `WEBP`
- Update `FileTypeFilter` type: `'all' | 'PNG' | 'JPG' | 'WEBP'`

**Legacy Firestore documents with `fileType: 'GIF'`:** all Firestore-to-`Creative` mappers must coerce unknown `fileType` values to `'JPG'` so legacy serialized data does not violate the updated union at runtime.

---

## Component Architecture

### FeedConnectScreen (modified)

Adds a two-tab header — **"From Alli"** and **"Upload Files"** — using local `useState`. Default active tab is "From Alli". The existing feed scanning UI renders unchanged under "From Alli". The new `UploadTab` component renders under "Upload Files". No changes to `WizardShell` or the app manifest.

**Note on existing prop types:** `FeedConnectScreen`'s `onConnect` uses `MockCreative[]` today (a type alias for `Creative[]`). The new `onUploadConnect` prop uses `Creative[]` directly — this is intentionally consistent; no alias needed for the new prop.

**Prop addition:**
```typescript
onUploadConnect: (creatives: Creative[]) => void
```
The existing `onConnect: (feed: SelectedFeed, imageColumn: string, creatives: MockCreative[]) => void` is unchanged. `UploadTab` calls `onUploadConnect` when the user confirms their selection.

**In `AppRoot`**, a new handler alongside `handleFeedConnect`:
```typescript
function handleUploadConnect(creatives: Creative[]) {
  setFeedCreatives(creatives);
  setConnectedFeedLabel('Uploaded Files');
  setSelectedCreative(null);
  setSelectedChannels([]);
  setSelectedDimensions(new Set());
}
```
`FeedConnectScreen` receives both `onConnect={handleFeedConnect}` and `onUploadConnect={handleUploadConnect}`.

**Connected-feed indicator icon:** the browse-stage indicator currently renders a `CircleStackIcon` (database). When `connectedFeedLabel === 'Uploaded Files'`, render an `ArrowUpTrayIcon` instead. Add a conditional on the icon at the indicator render site in `AppRoot.tsx` (around line 573).

### New: `UploadTab` (`src/apps/ad-resizing/components/UploadTab.tsx`)

Owns the upload interaction and the uploaded-files grid.

- On mount: calls `uploadService.listUploads(clientSlug)` and renders existing uploads in `UploadedCreativeGrid`
- **Empty state:** full-screen drop zone — "Drag files here or click to browse"
- **With existing uploads:** compact "Upload more" drop zone above the grid
- Drop zone accepts `image/png, image/jpeg, image/webp`, multiple files
- On file selection: probe each file's dimensions in-browser via `new Image()` + `URL.createObjectURL(file)` before calling the service; validate type and size client-side; show inline errors per file; upload valid files in parallel with progress indicators
- **Optimistic UI:** card appears immediately using `URL.createObjectURL(file)` as temporary `thumbnailUrl`. Once the permanent Storage URL arrives, update the card and revoke the object URL — but **only after the card's `<img>` `onLoad` fires** (revoke before `onLoad` can produce a broken image if the browser hasn't yet committed the blob to its internal image cache). As a safe fallback, also revoke any remaining object URLs on component unmount.
- **Unmount cleanup:** keep a ref of all in-flight upload promises and pending object URLs. On unmount, revoke any un-revoked object URLs. Do not call `setState` after unmount — guard with an `isMounted` ref or use `AbortController` on any in-flight fetches. Note: Firebase Storage `uploadBytes` is not cancellable; a file that finishes uploading after unmount will write to Storage but the Firestore write will be skipped. This is acceptable — the file will appear in the grid on the user's next session (Storage orphan risk is the same as the accepted tech debt above).
- Multi-select: checkbox on hover, "Continue" activates when ≥1 file selected
- On "Continue": calls `onUploadConnect(selectedCreatives)`

**Note:** The existing `FileUpload.tsx` (`src/components/FileUpload.tsx`) is not reused — it is single-file, no multi-select, no progress tracking. `UploadTab` is built from scratch.

### New: `UploadedCreativeGrid` (`src/apps/ad-resizing/components/UploadedCreativeGrid.tsx`)

Grid of uploaded creative cards matching the style of the Alli creative grid. Each card: thumbnail, filename, dimensions, file type badge, checkbox multi-select on hover.

**FilterSortBar:** does not apply inside `UploadTab`. Once the user confirms selection and `feedCreatives` is set in `AppRoot`, the existing `FilterSortBar` applies to uploaded creatives identically to Alli creatives — no special casing needed.

### New: `uploadService` (`src/apps/ad-resizing/services/uploadService.ts`)

```typescript
uploadCreative(
  clientSlug: string,
  file: File,
  dimensions: { width: number; height: number }  // probed by UploadTab before calling
): Promise<Creative>
// newBatchId() → upload to Storage → write Firestore doc → return Creative with sourceKind: 'upload'

listUploads(clientSlug: string): Promise<Creative[]>
// collection(db, 'clients', slug, 'apps', 'ad-resizing', 'uploads')
// orderBy('uploadedAt', 'desc') — requires index in firestore.indexes.json
// Maps docs: uploadedAt.toDate().toISOString(), coerce unknown fileType → 'JPG'

retryFirestoreWrite(clientSlug: string, uploadId: string, meta: UploadMeta): Promise<void>
// Writes Firestore doc only — Storage file already exists
```

**`src/` directory note:** `src/apps/ad-resizing/services/` does not exist yet — create it as part of this feature.

---

## Upload Flow

### New upload (empty state)

1. User opens "Upload Files" tab — full-screen drop zone shown
2. User drops or selects files (multi-select)
3. Client-side validation per file:
   - Invalid type → inline error ("GIF and video files are not supported"), skipped
   - Over 50 MB → inline error ("File exceeds 50 MB limit"), skipped
4. Valid files: probe dimensions in-browser, then upload in parallel with progress
5. Optimistic card shown immediately; updated to permanent URL after `onLoad`; object URL revoked
6. On upload complete: Storage write → Firestore write → card becomes selectable
7. User selects → "Continue" → `onUploadConnect` → dimension selection step

### Returning user (uploads exist)

1. "Upload Files" tab loads: existing uploads from Firestore render in grid
2. Compact "Upload more" drop zone above grid
3. Select from existing or add new, then continue

### Error states

| Error | Behaviour |
|---|---|
| Invalid file type | Inline error, skipped — does not block other files |
| File over 50 MB | Inline error, skipped |
| Storage upload fails | Card error state with retry; Firestore doc not written |
| Storage succeeds, Firestore fails | Card error with retry; `retryFirestoreWrite` only — no re-upload |
| Firestore read fails on mount | Error banner with retry; drop zone still functional |
| All files invalid | Drop zone summary error, nothing uploaded |

**Accepted tech debt (v1):** orphaned Storage files (Storage write succeeded, Firestore write permanently failed) are not cleaned up in v1. Acceptable given 50 MB cap and low expected orphan rate.

---

## Results Step

Each source creative gets its own labelled section. For `sourceKind: 'upload'` creatives, the section header is `creative.name` (original filename). For Alli creatives, existing label logic is unchanged. The change is a conditional on `sourceKind` at the section-header render site in `AppRoot.tsx` — no structural change to the results layout.

---

## File Type Fixes (ship together with upload feature)

| Location | Change |
|---|---|
| `src/utils/ids.ts` (new) | Extract `newBatchId()` from `AppRoot.tsx` to shared util |
| `types.ts` | `fileType: 'PNG' \| 'JPG' \| 'WEBP'`; add `sourceKind?: 'alli' \| 'upload'` |
| `feedToCreatives.ts` — `IMAGE_EXTENSIONS` | Remove `'.gif'` |
| `feedToCreatives.ts` — `detectFileType` | Add `.webp` → `'WEBP'` branch; remove `.gif` → `'GIF'` branch |
| `feedToCreatives.ts` — `feedToCreatives()` | Set `sourceKind: 'alli'` on each mapped creative |
| `FilterSortBar.tsx` — `FILETYPE_OPTIONS` | Replace `GIF` entry with `{ value: 'WEBP', label: 'WebP' }` |
| `FilterSortBar.tsx` — `FileTypeFilter` | `'all' \| 'PNG' \| 'JPG' \| 'WEBP'` |
| `AppRoot.tsx` — `newBatchId` | Replace local function with import from `src/utils/ids.ts` |
| Firestore mappers | Coerce unknown `fileType` → `'JPG'` for legacy `'GIF'` documents |
| `firestore.indexes.json` | Add single-field index on `uploadedAt` for `uploads` collection |

---

## What Is Not Changing

- `WizardShell` and app manifest — no new steps, no routing changes
- Firebase Security Rules — existing `clients/{slug}/...` wildcard already covers the new paths
- The outpaint/resize Cloud Functions — uploaded Storage URLs pass as `originalUrl` identically to Alli CDN URLs; `sharp` already handles PNG/JPG/WebP
- The `outputs` and `batches` collections — unchanged
- `source: string` on `Creative` — not narrowed; `sourceKind` is the new optional discriminator

---

## Branch Strategy

Branch `feat/ad-resizing-upload` cut from `dev`. All implementation commits go on this branch. PR targets `dev`.
