# Ad Resizing — External Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Upload Files" tab to Ad Resizing's FeedConnectScreen so users can upload PNG/JPG/WebP creatives from their own machine, persisted to Firebase Storage + a new Firestore `uploads` collection, and fed into the existing resize pipeline.

**Architecture:** Two-tab header on `FeedConnectScreen` — "From Alli" (unchanged) and "Upload Files" (new `UploadTab` component). `UploadTab` reads prior uploads from Firestore on mount and handles new uploads via a drag-drop zone. Files upload to Firebase Storage and are tracked in a new `uploads` Firestore collection under `clients/{slug}/apps/ad-resizing/uploads`. Selected uploaded creatives flow into the existing resize pipeline via a new `onUploadConnect` prop on `FeedConnectScreen`, wired to a new `handleUploadConnect` handler in `AppRoot`.

**Tech Stack:** React 19, TypeScript, Firebase Storage + Firestore SDK v12, Vite, Tailwind CSS, Vitest + Testing Library.

---

## File Map

| Status | Path | Responsibility |
|---|---|---|
| **Create** | `src/utils/ids.ts` | Shared `newId()` util (extracted from AppRoot) |
| **Create** | `src/utils/__tests__/ids.test.ts` | Tests for `newId` |
| **Modify** | `src/apps/ad-resizing/types.ts` | Add `sourceKind?`, fix `fileType` union |
| **Modify** | `src/apps/ad-resizing/utils/feedToCreatives.ts` | Remove GIF, add WebP, set `sourceKind: 'alli'` |
| **Create** | `src/apps/ad-resizing/utils/__tests__/feedToCreatives.test.ts` | Tests for updated detection logic |
| **Modify** | `src/apps/ad-resizing/components/FilterSortBar.tsx` | GIF → WebP in type filter |
| **Create** | `firestore.indexes.json` | Firestore index for `uploadedAt` ordering |
| **Modify** | `firebase.json` | Point Firestore config at new indexes file |
| **Create** | `src/apps/ad-resizing/utils/uploadValidation.ts` | Pure file validation (type + size) |
| **Create** | `src/apps/ad-resizing/utils/__tests__/uploadValidation.test.ts` | Tests for validation |
| **Create** | `src/apps/ad-resizing/services/uploadService.ts` | `uploadCreative`, `listUploads`, `retryFirestoreWrite` |
| **Create** | `src/apps/ad-resizing/services/__tests__/uploadService.test.ts` | Tests for pure helpers |
| **Create** | `src/apps/ad-resizing/components/UploadedCreativeGrid.tsx` | Grid of persisted upload cards |
| **Create** | `src/apps/ad-resizing/components/UploadTab.tsx` | Drop zone + grid + multi-select |
| **Modify** | `src/apps/ad-resizing/components/FeedConnectScreen.tsx` | Tabs + `onUploadConnect` prop |
| **Modify** | `src/apps/ad-resizing/AppRoot.tsx` | `handleUploadConnect`, icon conditional, import `newId` |

---

## Task 1: Cut the feature branch

**Files:**
- No files — git operation only

- [ ] **Step 1: Create the branch**

Run from the repo root (`dl-creative-studio/`):
```bash
git checkout dev
git pull
git checkout -b feat/ad-resizing-upload
```

Expected: branch `feat/ad-resizing-upload` created, tracking `dev`.

---

## Task 2: Extract `newId` to shared util

`AppRoot.tsx` has `newBatchId()` as a local function. `uploadService` needs the same ID-generation logic. Extract it to a shared util so both can import it without duplicating the fallback guard.

**Files:**
- Create: `src/utils/ids.ts`
- Create: `src/utils/__tests__/ids.test.ts`
- Modify: `src/apps/ad-resizing/AppRoot.tsx` (lines 32–36)

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/ids.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { newId } from '../ids';

describe('newId', () => {
  it('returns a non-empty string', () => {
    expect(typeof newId()).toBe('string');
    expect(newId().length).toBeGreaterThan(0);
  });

  it('returns unique values on successive calls', () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd antig/pmg-creative-studio && npm run test -- --run src/utils/__tests__/ids.test.ts
```
Expected: `FAIL — Cannot find module '../ids'`

- [ ] **Step 3: Create `src/utils/ids.ts`**

```typescript
export function newId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test -- --run src/utils/__tests__/ids.test.ts
```
Expected: `PASS — 2 tests passed`

- [ ] **Step 5: Update `AppRoot.tsx` to import from the new util**

In `src/apps/ad-resizing/AppRoot.tsx`, replace lines 32–36:
```typescript
// REMOVE this:
function newBatchId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

Add to the top-of-file imports:
```typescript
import { newId } from '../../utils/ids';
```

Then replace every call to `newBatchId()` in `AppRoot.tsx` with `newId()`. There are typically 1–2 call sites — grep to find them:
```bash
grep -n "newBatchId" src/apps/ad-resizing/AppRoot.tsx
```

- [ ] **Step 6: Confirm TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```
Expected: no errors mentioning `newBatchId` or `ids.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/ids.ts src/utils/__tests__/ids.test.ts src/apps/ad-resizing/AppRoot.tsx
git commit -m "refactor: extract newId to src/utils/ids.ts — shared by AppRoot and uploadService"
```

---

## Task 3: Update `Creative` type — add `sourceKind`, drop `GIF`

**Files:**
- Modify: `src/apps/ad-resizing/types.ts`

- [ ] **Step 1: Update `types.ts`**

Open `src/apps/ad-resizing/types.ts`. Change lines 13 and 16 as shown:

```typescript
export interface Creative {
  id: string;
  name: string;
  thumbnailUrl: string;
  originalUrl?: string;
  width: number;
  height: number;
  fileType: 'PNG' | 'JPG' | 'WEBP';   // was: 'PNG' | 'JPG' | 'GIF'
  uploadedAt: string;
  source: string;
  sourceKind?: 'alli' | 'upload';       // new optional discriminator
  tags: string[];
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: the `GIF` removal may produce type errors where Alli feed code sets `fileType: 'GIF'`. Those are fixed in Task 4. If the only errors are in `feedToCreatives.ts`, proceed to Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/apps/ad-resizing/types.ts
git commit -m "feat: add sourceKind discriminator to Creative type, drop GIF from fileType union"
```

---

## Task 4: Fix `feedToCreatives.ts` — remove GIF, add WebP, set `sourceKind`

**Files:**
- Modify: `src/apps/ad-resizing/utils/feedToCreatives.ts`
- Create: `src/apps/ad-resizing/utils/__tests__/feedToCreatives.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/apps/ad-resizing/utils/__tests__/feedToCreatives.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { detectImageColumns, feedToCreatives } from '../feedToCreatives';

describe('detectImageColumns', () => {
  it('detects PNG, JPG, WebP image columns', () => {
    const rows = [
      { img: 'https://cdn.example.com/ad.png', name: 'Ad 1' },
      { img: 'https://cdn.example.com/ad.jpg', name: 'Ad 2' },
      { img: 'https://cdn.example.com/ad.webp', name: 'Ad 3' },
    ];
    expect(detectImageColumns(rows)).toContain('img');
  });

  it('does not detect GIF columns', () => {
    const rows = [
      { img: 'https://cdn.example.com/ad.gif', name: 'Ad 1' },
      { img: 'https://cdn.example.com/ad.gif', name: 'Ad 2' },
    ];
    expect(detectImageColumns(rows)).not.toContain('img');
  });

  it('returns empty array for empty rows', () => {
    expect(detectImageColumns([])).toEqual([]);
  });
});

describe('feedToCreatives', () => {
  it('maps a WebP URL to fileType WEBP', async () => {
    const rows = [{ img: 'https://cdn.example.com/ad.webp', name: 'Ad 1' }];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives[0].fileType).toBe('WEBP');
  });

  it('maps a PNG URL to fileType PNG', async () => {
    const rows = [{ img: 'https://cdn.example.com/ad.png', name: 'Ad 1' }];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives[0].fileType).toBe('PNG');
  });

  it('defaults non-png non-webp URLs to JPG', async () => {
    const rows = [{ img: 'https://cdn.example.com/ad.jpg', name: 'Ad 1' }];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives[0].fileType).toBe('JPG');
  });

  it('sets sourceKind to alli', async () => {
    const rows = [{ img: 'https://cdn.example.com/ad.png', name: 'Ad 1' }];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives[0].sourceKind).toBe('alli');
  });

  it('skips rows where the image column is not a URL', async () => {
    const rows = [
      { img: 'not-a-url', name: 'Bad' },
      { img: 'https://cdn.example.com/ad.png', name: 'Good' },
    ];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives).toHaveLength(1);
    expect(creatives[0].name).toBe('Good');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test -- --run src/apps/ad-resizing/utils/__tests__/feedToCreatives.test.ts
```
Expected: tests for `fileType: WEBP` and `sourceKind: alli` fail because neither is implemented yet.

- [ ] **Step 3: Update `feedToCreatives.ts`**

Replace the full contents of `src/apps/ad-resizing/utils/feedToCreatives.ts`:

```typescript
import type { Creative } from '../types';
import { sha256Prefix } from './sha256';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];  // removed '.gif'

const DATE_COLUMNS = [
  'created_at', 'updated_at', 'date_modified', 'date_created',
  'last_updated', 'published_at', 'upload_date', 'date', 'timestamp',
  'start_date', 'reporting_date', 'ad_date',
];

function detectUploadDate(row: Record<string, unknown>): string {
  for (const col of DATE_COLUMNS) {
    const val = row[col];
    if (typeof val === 'string' && val.trim()) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    }
  }
  return '';
}

export function detectImageColumns(rows: Array<Record<string, unknown>>): string[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, Math.min(5, rows.length));
  const columns = Object.keys(rows[0]);

  return columns.filter(col => {
    const imageCount = sample.filter(row => {
      const val = String(row[col] ?? '');
      return val.startsWith('http') && IMAGE_EXTENSIONS.some(ext => val.toLowerCase().includes(ext));
    }).length;
    return imageCount >= Math.ceil(sample.length / 2);
  });
}

function detectFileType(url: string): 'PNG' | 'JPG' | 'WEBP' {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'PNG';
  if (lower.includes('.webp')) return 'WEBP';
  return 'JPG';
}

function deriveLabel(row: Record<string, unknown>, imageColumn: string): string {
  const nameCandidates = [
    'name', 'title', 'ad_name', 'creative_name', 'product_name',
    'product', 'label', 'description', 'ad_id',
  ];
  for (const candidate of nameCandidates) {
    const val = row[candidate];
    if (typeof val === 'string' && val.trim() && val !== row[imageColumn]) {
      return val.trim().slice(0, 60);
    }
  }
  for (const [key, val] of Object.entries(row)) {
    if (key === imageColumn) continue;
    if (typeof val === 'string' && val.trim() && val.length < 80 && !val.startsWith('http')) {
      return val.trim().slice(0, 60);
    }
  }
  return 'Untitled Creative';
}

export async function feedToCreatives(
  sampleData: Array<Record<string, unknown>>,
  feedName: string,
  imageColumn: string,
): Promise<Creative[]> {
  const filtered = sampleData.filter(row => String(row[imageColumn] ?? '').startsWith('http'));
  return Promise.all(
    filtered.map(async (row) => {
      const imageUrl = String(row[imageColumn]);
      const id = await sha256Prefix(imageUrl);
      return {
        id,
        name: deriveLabel(row, imageColumn),
        thumbnailUrl: imageUrl,
        originalUrl: imageUrl,
        width: 1080,
        height: 1080,
        fileType: detectFileType(imageUrl),
        uploadedAt: detectUploadDate(row),
        source: feedName,
        sourceKind: 'alli' as const,
        tags: [],
      };
    }),
  );
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test -- --run src/apps/ad-resizing/utils/__tests__/feedToCreatives.test.ts
```
Expected: `PASS — 7 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/apps/ad-resizing/utils/feedToCreatives.ts src/apps/ad-resizing/utils/__tests__/feedToCreatives.test.ts
git commit -m "feat: remove GIF from image detection, add WebP support, set sourceKind: alli on feed creatives"
```

---

## Task 5: Fix `FilterSortBar` — GIF → WebP

**Files:**
- Modify: `src/apps/ad-resizing/components/FilterSortBar.tsx` (lines 6, 32–33)

- [ ] **Step 1: Update `FilterSortBar.tsx`**

Change line 6:
```typescript
// Before:
export type FileTypeFilter = 'all' | 'PNG' | 'JPG' | 'GIF';

// After:
export type FileTypeFilter = 'all' | 'PNG' | 'JPG' | 'WEBP';
```

Change line 32–33 inside `FILETYPE_OPTIONS`:
```typescript
// Before:
  { value: 'GIF', label: 'GIF' },

// After:
  { value: 'WEBP', label: 'WebP' },
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors. `AppRoot.tsx` initialises `filterFileType` as `'all'` so the type change is backward-compatible.

- [ ] **Step 3: Commit**

```bash
git add src/apps/ad-resizing/components/FilterSortBar.tsx
git commit -m "feat: replace GIF filter with WebP in FilterSortBar"
```

---

## Task 6: Create `firestore.indexes.json` and update `firebase.json`

`listUploads` orders by `uploadedAt desc`. Firestore requires an explicit index for ordered queries on subcollections. Without it the query throws at runtime with a console link to create the index.

**Files:**
- Create: `firestore.indexes.json` (at project root `antig/pmg-creative-studio/`)
- Modify: `firebase.json`

- [ ] **Step 1: Create `firestore.indexes.json`**

Create `antig/pmg-creative-studio/firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "uploads",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "uploadedAt", "order": "DESCENDING" },
        { "fieldPath": "__name__", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 2: Update `firebase.json`**

Add `"indexes": "firestore.indexes.json"` to the `"firestore"` block:
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  ...
}
```

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json firebase.json
git commit -m "feat: add Firestore index for uploads.uploadedAt ordering"
```

---

## Task 7: Build `uploadValidation.ts` (pure, fully testable)

Extract file-validation logic from what will become `UploadTab` into a pure module so it can be unit-tested without React or Firebase.

**Files:**
- Create: `src/apps/ad-resizing/utils/uploadValidation.ts`
- Create: `src/apps/ad-resizing/utils/__tests__/uploadValidation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/apps/ad-resizing/utils/__tests__/uploadValidation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateUploadFile, fileTypeFromMime, extFromMime } from '../uploadValidation';

describe('validateUploadFile', () => {
  function makeFile(name: string, type: string, sizeBytes: number): File {
    // File constructor: (parts, name, options)
    return new File(['x'.repeat(sizeBytes)], name, { type });
  }

  it('accepts image/png', () => {
    expect(validateUploadFile(makeFile('a.png', 'image/png', 100))).toEqual({ valid: true });
  });

  it('accepts image/jpeg', () => {
    expect(validateUploadFile(makeFile('a.jpg', 'image/jpeg', 100))).toEqual({ valid: true });
  });

  it('accepts image/webp', () => {
    expect(validateUploadFile(makeFile('a.webp', 'image/webp', 100))).toEqual({ valid: true });
  });

  it('rejects image/gif', () => {
    const result = validateUploadFile(makeFile('a.gif', 'image/gif', 100));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/not supported/i);
  });

  it('rejects video/mp4', () => {
    const result = validateUploadFile(makeFile('a.mp4', 'video/mp4', 100));
    expect(result.valid).toBe(false);
  });

  it('rejects files over 50 MB', () => {
    const overLimit = 50 * 1024 * 1024 + 1;
    const result = validateUploadFile(makeFile('a.png', 'image/png', overLimit));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/50 MB/i);
  });

  it('accepts files exactly at 50 MB', () => {
    const atLimit = 50 * 1024 * 1024;
    expect(validateUploadFile(makeFile('a.png', 'image/png', atLimit))).toEqual({ valid: true });
  });
});

describe('fileTypeFromMime', () => {
  it('maps image/png → PNG', () => expect(fileTypeFromMime('image/png')).toBe('PNG'));
  it('maps image/jpeg → JPG', () => expect(fileTypeFromMime('image/jpeg')).toBe('JPG'));
  it('maps image/webp → WEBP', () => expect(fileTypeFromMime('image/webp')).toBe('WEBP'));
  it('falls back to JPG for unknown types', () => expect(fileTypeFromMime('image/bmp')).toBe('JPG'));
});

describe('extFromMime', () => {
  it('maps image/png → png', () => expect(extFromMime('image/png')).toBe('png'));
  it('maps image/jpeg → jpg', () => expect(extFromMime('image/jpeg')).toBe('jpg'));
  it('maps image/webp → webp', () => expect(extFromMime('image/webp')).toBe('webp'));
  it('falls back to jpg', () => expect(extFromMime('image/bmp')).toBe('jpg'));
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test -- --run src/apps/ad-resizing/utils/__tests__/uploadValidation.test.ts
```
Expected: `FAIL — Cannot find module '../uploadValidation'`

- [ ] **Step 3: Create `uploadValidation.ts`**

Create `src/apps/ad-resizing/utils/uploadValidation.ts`:
```typescript
const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateUploadFile(file: File): ValidationResult {
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return { valid: false, error: 'GIF and video files are not supported. Please upload a PNG, JPG, or WebP.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, error: `File exceeds the 50 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }
  return { valid: true };
}

export function fileTypeFromMime(mimeType: string): 'PNG' | 'JPG' | 'WEBP' {
  if (mimeType === 'image/png') return 'PNG';
  if (mimeType === 'image/webp') return 'WEBP';
  return 'JPG';
}

export function extFromMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test -- --run src/apps/ad-resizing/utils/__tests__/uploadValidation.test.ts
```
Expected: `PASS — 12 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/apps/ad-resizing/utils/uploadValidation.ts src/apps/ad-resizing/utils/__tests__/uploadValidation.test.ts
git commit -m "feat: add uploadValidation utility — file type and size validation for uploads"
```

---

## Task 8: Build `uploadService.ts`

The service handles Firebase Storage uploads and Firestore reads/writes. Firebase-dependent functions can't be meaningfully unit-tested without the emulator — the test file covers the pure helpers only. Integration testing happens manually via the running dev app.

**Files:**
- Create: `src/apps/ad-resizing/services/uploadService.ts`
- Create: `src/apps/ad-resizing/services/__tests__/uploadService.test.ts`

- [ ] **Step 1: Write tests for pure helpers**

Create `src/apps/ad-resizing/services/__tests__/uploadService.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { docToCreative } from '../uploadService';
import { Timestamp } from 'firebase/firestore';

describe('docToCreative', () => {
  const base = {
    id: 'abc123',
    name: 'hero.png',
    url: 'https://storage.example.com/hero.png',
    width: 1200,
    height: 628,
    sizeBytes: 204800,
    uploadedBy: 'user-uid',
    uploadedAt: Timestamp.fromDate(new Date('2026-05-14T10:00:00Z')),
  };

  it('maps PNG fileType', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.fileType).toBe('PNG');
  });

  it('maps WEBP fileType', () => {
    const c = docToCreative({ ...base, fileType: 'WEBP' });
    expect(c.fileType).toBe('WEBP');
  });

  it('coerces unknown fileType (GIF) to JPG', () => {
    const c = docToCreative({ ...base, fileType: 'GIF' });
    expect(c.fileType).toBe('JPG');
  });

  it('converts Firestore Timestamp to ISO string', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.uploadedAt).toBe('2026-05-14T10:00:00.000Z');
  });

  it('sets sourceKind to upload', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.sourceKind).toBe('upload');
  });

  it('sets source to upload', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.source).toBe('upload');
  });

  it('sets thumbnailUrl and originalUrl from url field', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.thumbnailUrl).toBe(base.url);
    expect(c.originalUrl).toBe(base.url);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test -- --run src/apps/ad-resizing/services/__tests__/uploadService.test.ts
```
Expected: `FAIL — Cannot find module '../uploadService'`

- [ ] **Step 3: Create `src/apps/ad-resizing/services/uploadService.ts`**

```typescript
import {
  collection, doc, setDoc, getDocs, query, orderBy, serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../../firebase';
import { paths } from '../../../platform/firebase/paths';
import { newId } from '../../../utils/ids';
import { fileTypeFromMime, extFromMime } from '../utils/uploadValidation';
import type { Creative } from '../types';

export interface UploadMeta {
  name: string;
  url: string;
  fileType: 'PNG' | 'JPG' | 'WEBP';
  width: number;
  height: number;
  sizeBytes: number;
  uploadedBy: string;
}

function uploadsCol(clientSlug: string) {
  return collection(db, 'clients', clientSlug, 'apps', 'ad-resizing', 'uploads');
}

// Exported so it can be unit-tested independently of Firebase.
export function docToCreative(d: Record<string, unknown> & { uploadedAt: Timestamp }): Creative {
  const rawType = d.fileType as string;
  const fileType: 'PNG' | 'JPG' | 'WEBP' =
    rawType === 'PNG' ? 'PNG'
    : rawType === 'WEBP' ? 'WEBP'
    : 'JPG';

  return {
    id: d.id as string,
    name: d.name as string,
    thumbnailUrl: d.url as string,
    originalUrl: d.url as string,
    width: d.width as number,
    height: d.height as number,
    fileType,
    uploadedAt: d.uploadedAt.toDate().toISOString(),
    source: 'upload',
    sourceKind: 'upload',
    tags: [],
  };
}

export async function uploadCreative(
  clientSlug: string,
  file: File,
  dimensions: { width: number; height: number },
): Promise<Creative> {
  const uploadId = newId();
  const ext = extFromMime(file.type);
  const storagePath = paths.storage.app(clientSlug, 'ad-resizing', `uploads/${uploadId}.${ext}`);
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  const meta: UploadMeta = {
    name: file.name,
    url,
    fileType: fileTypeFromMime(file.type),
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: file.size,
    uploadedBy: auth.currentUser?.uid ?? '',
  };

  const docRef = doc(uploadsCol(clientSlug), uploadId);
  await setDoc(docRef, { id: uploadId, ...meta, uploadedAt: serverTimestamp() });

  return {
    id: uploadId,
    name: file.name,
    thumbnailUrl: url,
    originalUrl: url,
    width: dimensions.width,
    height: dimensions.height,
    fileType: meta.fileType,
    uploadedAt: new Date().toISOString(),
    source: 'upload',
    sourceKind: 'upload',
    tags: [],
  };
}

export async function listUploads(clientSlug: string): Promise<Creative[]> {
  const q = query(uploadsCol(clientSlug), orderBy('uploadedAt', 'desc'));
  const snap = await getDocs(q);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return snap.docs.map(d => docToCreative(d.data() as any));
}

export async function retryFirestoreWrite(
  clientSlug: string,
  uploadId: string,
  meta: UploadMeta,
): Promise<void> {
  const docRef = doc(uploadsCol(clientSlug), uploadId);
  await setDoc(docRef, { id: uploadId, ...meta, uploadedAt: serverTimestamp() });
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test -- --run src/apps/ad-resizing/services/__tests__/uploadService.test.ts
```
Expected: `PASS — 7 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/apps/ad-resizing/services/uploadService.ts src/apps/ad-resizing/services/__tests__/uploadService.test.ts
git commit -m "feat: add uploadService — uploadCreative, listUploads, retryFirestoreWrite"
```

---

## Task 9: Build `UploadedCreativeGrid`

A grid of already-persisted uploaded creative cards. Visually matches `CreativeTile` from the Alli flow. Supports multi-select via checkbox on hover. Calls `onThumbnailLoaded(creativeId)` when a card's image loads — used by `UploadTab` to revoke temporary object URLs.

**Files:**
- Create: `src/apps/ad-resizing/components/UploadedCreativeGrid.tsx`

- [ ] **Step 1: Create `UploadedCreativeGrid.tsx`**

```typescript
import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { Creative } from '../types';

interface UploadedCreativeGridProps {
  creatives: Creative[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onThumbnailLoaded?: (creativeId: string) => void;
}

const FILE_TYPE_COLOURS: Record<string, string> = {
  PNG: 'bg-blue-50 text-blue-600',
  JPG: 'bg-amber-50 text-amber-600',
  WEBP: 'bg-emerald-50 text-emerald-600',
};

export default function UploadedCreativeGrid({
  creatives,
  selectedIds,
  onToggle,
  onThumbnailLoaded,
}: UploadedCreativeGridProps) {
  if (creatives.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {creatives.map(creative => {
        const selected = selectedIds.has(creative.id);
        return (
          <button
            key={creative.id}
            type="button"
            onClick={() => onToggle(creative.id)}
            className={cn(
              'group relative w-full rounded-lg border bg-white text-left shadow-sm transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
              selected
                ? 'border-blue-600 ring-2 ring-blue-600'
                : 'border-gray-200 hover:border-blue-300 hover:shadow-md',
            )}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-gray-100">
              <img
                src={creative.thumbnailUrl}
                alt={creative.name}
                className="h-full w-full object-cover"
                loading="lazy"
                onLoad={() => onThumbnailLoaded?.(creative.id)}
              />
              {selected && (
                <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 shadow">
                  <CheckIcon className="h-3.5 w-3.5 text-white" />
                </div>
              )}
              {!selected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                  <div className="hidden h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white/20 group-hover:flex">
                    <div className="h-3 w-3 rounded-full border-2 border-white" />
                  </div>
                </div>
              )}
            </div>
            <div className="px-3 py-2.5">
              <p className="truncate text-[13px] font-medium text-gray-900" title={creative.name}>
                {creative.name}
              </p>
              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {creative.width}×{creative.height}
                </span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                    FILE_TYPE_COLOURS[creative.fileType] ?? 'bg-gray-100 text-gray-500',
                  )}
                >
                  {creative.fileType}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/apps/ad-resizing/components/UploadedCreativeGrid.tsx
git commit -m "feat: add UploadedCreativeGrid — multi-select card grid for persisted uploads"
```

---

## Task 10: Build `UploadTab`

The main upload UI: drag-drop zone, parallel file upload with progress + error cards, grid of persisted uploads, multi-select, and a "Continue" button that fires `onUploadConnect`.

**Files:**
- Create: `src/apps/ad-resizing/components/UploadTab.tsx`

- [ ] **Step 1: Create `UploadTab.tsx`**

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUpTrayIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import { validateUploadFile, fileTypeFromMime } from '../utils/uploadValidation';
import { uploadCreative, listUploads, retryFirestoreWrite, type UploadMeta } from '../services/uploadService';
import UploadedCreativeGrid from './UploadedCreativeGrid';
import type { Creative } from '../types';

interface UploadTabProps {
  clientSlug: string;
  onUploadConnect: (creatives: Creative[]) => void;
}

type PendingStatus = 'uploading' | 'error-storage' | 'error-firestore' | 'invalid';

interface PendingUpload {
  id: string;
  name: string;
  tempUrl: string;
  status: PendingStatus;
  error?: string;
  uploadId?: string;
  storageMeta?: UploadMeta;
}

function probeImageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1080, height: 1080 });
    img.src = objectUrl;
  });
}

export default function UploadTab({ clientSlug, onUploadConnect }: UploadTabProps) {
  const [uploadedCreatives, setUploadedCreatives] = useState<Creative[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const isMountedRef = useRef(true);
  // Maps creativeId (after upload completes) → tempUrl (to revoke after img loads)
  const pendingRevokeRef = useRef<Map<string, string>>(new Map());
  // All object URLs created, for unmount cleanup
  const allTempUrlsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    listUploads(clientSlug)
      .then(creatives => { if (isMountedRef.current) setUploadedCreatives(creatives); })
      .catch(() => { if (isMountedRef.current) setLoadError('Could not load previous uploads. You can still upload new files.'); });
    return () => {
      isMountedRef.current = false;
      // Revoke all remaining object URLs on unmount
      for (const url of allTempUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, [clientSlug]);

  const handleThumbnailLoaded = useCallback((creativeId: string) => {
    const tempUrl = pendingRevokeRef.current.get(creativeId);
    if (tempUrl) {
      URL.revokeObjectURL(tempUrl);
      pendingRevokeRef.current.delete(creativeId);
      allTempUrlsRef.current.delete(tempUrl);
    }
  }, []);

  async function processFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Build pending items with local IDs
    const items = fileArray.map(file => {
      const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const validation = validateUploadFile(file);
      if (!validation.valid) {
        return { localId, file, tempUrl: '', valid: false as const, error: validation.error };
      }
      const tempUrl = URL.createObjectURL(file);
      allTempUrlsRef.current.add(tempUrl);
      return { localId, file, tempUrl, valid: true as const, error: undefined };
    });

    // Add all to pending state immediately
    setPendingUploads(prev => [
      ...prev,
      ...items.map(item => ({
        id: item.localId,
        name: item.file.name,
        tempUrl: item.tempUrl,
        status: item.valid ? ('uploading' as PendingStatus) : ('invalid' as PendingStatus),
        error: item.error,
      })),
    ]);

    // Upload valid items in parallel
    await Promise.allSettled(
      items
        .filter(item => item.valid)
        .map(async ({ localId, file, tempUrl }) => {
          try {
            const dimensions = await probeImageDimensions(tempUrl);
            if (!isMountedRef.current) return;
            const creative = await uploadCreative(clientSlug, file, dimensions);
            if (!isMountedRef.current) return;
            // Schedule temp URL revocation when the grid card's img loads
            pendingRevokeRef.current.set(creative.id, tempUrl);
            setPendingUploads(prev => prev.filter(p => p.id !== localId));
            setUploadedCreatives(prev => [creative, ...prev]);
          } catch (err) {
            if (!isMountedRef.current) return;
            // Revoke temp URL since we won't show a grid card for this
            URL.revokeObjectURL(tempUrl);
            allTempUrlsRef.current.delete(tempUrl);
            const message = err instanceof Error ? err.message : 'Upload failed';
            setPendingUploads(prev => prev.map(p =>
              p.id === localId
                ? { ...p, status: 'error-storage' as PendingStatus, error: 'Upload failed. Tap to retry.' }
                : p,
            ));
            console.error('Upload error for', file.name, message);
          }
        }),
    );
  }

  async function retryPending(pending: PendingUpload) {
    if (pending.status === 'error-firestore' && pending.uploadId && pending.storageMeta) {
      try {
        await retryFirestoreWrite(clientSlug, pending.uploadId, pending.storageMeta);
        if (!isMountedRef.current) return;
        const creative: Creative = {
          id: pending.uploadId,
          name: pending.storageMeta.name,
          thumbnailUrl: pending.storageMeta.url,
          originalUrl: pending.storageMeta.url,
          width: pending.storageMeta.width,
          height: pending.storageMeta.height,
          fileType: pending.storageMeta.fileType,
          uploadedAt: new Date().toISOString(),
          source: 'upload',
          sourceKind: 'upload',
          tags: [],
        };
        setPendingUploads(prev => prev.filter(p => p.id !== pending.id));
        setUploadedCreatives(prev => [creative, ...prev]);
      } catch {
        if (!isMountedRef.current) return;
        setPendingUploads(prev => prev.map(p =>
          p.id === pending.id ? { ...p, error: 'Retry failed. Try again.' } : p,
        ));
      }
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedCreatives = uploadedCreatives.filter(c => selectedIds.has(c.id));
  const hasUploads = uploadedCreatives.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          {loadError}
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              listUploads(clientSlug)
                .then(c => { if (isMountedRef.current) setUploadedCreatives(c); })
                .catch(() => { if (isMountedRef.current) setLoadError('Could not load previous uploads.'); });
            }}
            className="ml-auto shrink-0 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          processFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
          hasUploads ? 'px-4 py-5' : 'px-6 py-16',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40',
        )}
      >
        <ArrowUpTrayIcon className={cn('mb-2 h-6 w-6', isDragging ? 'text-blue-500' : 'text-gray-400')} />
        {hasUploads ? (
          <p className="text-[13px] text-gray-500">
            <span className="font-medium text-blue-600">Upload more files</span>
            {' '}or drag and drop
          </p>
        ) : (
          <>
            <p className="text-[14px] font-medium text-gray-700">Drag files here or click to browse</p>
            <p className="mt-1 text-[12px] text-gray-400">PNG, JPG, WebP · Max 50 MB per file</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Pending upload cards (uploading / error / invalid) */}
      {pendingUploads.length > 0 && (
        <div className="flex flex-col gap-2">
          {pendingUploads.map(pending => (
            <div
              key={pending.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[13px]',
                pending.status === 'uploading' && 'border-blue-100 bg-blue-50',
                (pending.status === 'error-storage' || pending.status === 'error-firestore') && 'border-red-100 bg-red-50',
                pending.status === 'invalid' && 'border-amber-100 bg-amber-50',
              )}
            >
              {pending.status === 'uploading' && (
                <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
              )}
              {(pending.status === 'error-storage' || pending.status === 'error-firestore') && (
                <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
              {pending.status === 'invalid' && (
                <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <span className="truncate font-medium text-gray-700">{pending.name}</span>
                {pending.error && (
                  <p className={cn('text-[12px]', pending.status === 'invalid' ? 'text-amber-600' : 'text-red-600')}>
                    {pending.error}
                  </p>
                )}
              </div>
              {pending.status === 'error-firestore' && (
                <button
                  type="button"
                  onClick={() => retryPending(pending)}
                  className="shrink-0 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                >
                  <ArrowPathIcon className="h-3.5 w-3.5" />
                </button>
              )}
              {(pending.status === 'invalid' || pending.status === 'error-storage') && (
                <button
                  type="button"
                  onClick={() => setPendingUploads(prev => prev.filter(p => p.id !== pending.id))}
                  className="shrink-0 text-gray-300 hover:text-gray-500"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Persisted uploads grid */}
      <UploadedCreativeGrid
        creatives={uploadedCreatives}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onThumbnailLoaded={handleThumbnailLoaded}
      />

      {/* Continue button */}
      {selectedCreatives.length > 0 && (
        <div className="sticky bottom-0 flex justify-end border-t border-gray-100 bg-white pt-4 pb-1">
          <button
            type="button"
            onClick={() => onUploadConnect(selectedCreatives)}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-[13px] font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Continue with {selectedCreatives.length} file{selectedCreatives.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/apps/ad-resizing/components/UploadTab.tsx
git commit -m "feat: add UploadTab — drag-drop upload zone with progress, error handling, multi-select"
```

---

## Task 11: Wire `FeedConnectScreen` — add tabs and `onUploadConnect` prop

Add the "From Alli" / "Upload Files" two-tab header to `FeedConnectScreen`. The existing feed scanning UI goes under the "From Alli" tab unchanged. `UploadTab` goes under "Upload Files". Add the `onUploadConnect` callback prop.

**Files:**
- Modify: `src/apps/ad-resizing/components/FeedConnectScreen.tsx`

- [ ] **Step 1: Update `FeedConnectScreen.tsx`**

At the top of the file, add imports:
```typescript
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import UploadTab from './UploadTab';
import type { Creative } from '../types';
```

Update `FeedConnectScreenProps` (around line 23):
```typescript
interface FeedConnectScreenProps {
  clientSlug: string;
  onConnect: (feed: SelectedFeed, imageColumn: string, creatives: MockCreative[]) => void;
  onUploadConnect: (creatives: Creative[]) => void;
}
```

Update the function signature (around line 30):
```typescript
export default function FeedConnectScreen({ clientSlug, onConnect, onUploadConnect }: FeedConnectScreenProps) {
```

Add tab state at the top of the function body, immediately after the existing state declarations:
```typescript
const [activeTab, setActiveTab] = useState<'alli' | 'upload'>('alli');
```

Wrap the entire existing return JSX in a fragment and prepend the tab header. The existing return JSX starts with `<div className="flex flex-col gap-5 ...">` or similar — wrap it so the tab header sits above it:

Replace the `return (` block with:
```typescript
return (
  <div className="flex flex-col gap-0">
    {/* Tab header */}
    <div className="mb-5 flex border-b border-gray-200">
      <button
        type="button"
        onClick={() => setActiveTab('alli')}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
          activeTab === 'alli'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700',
        )}
      >
        <CircleStackIcon className="h-3.5 w-3.5" />
        From Alli
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('upload')}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
          activeTab === 'upload'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700',
        )}
      >
        <ArrowUpTrayIcon className="h-3.5 w-3.5" />
        Upload Files
      </button>
    </div>

    {/* Tab content */}
    {activeTab === 'alli' && (
      /* ---- EXISTING FEED CONNECT JSX GOES HERE — no changes ---- */
      <existing feed connect JSX>
    )}
    {activeTab === 'upload' && (
      <UploadTab clientSlug={clientSlug} onUploadConnect={onUploadConnect} />
    )}
  </div>
);
```

> **Important:** Do not copy-paste `<existing feed connect JSX>` literally. Wrap the full existing JSX that was previously returned (the feed scanning UI, feed list, shimmer states, etc.) inside the `activeTab === 'alli'` block. Do not modify that JSX at all — just move it inside the conditional.

`CircleStackIcon` is already imported at the top of `FeedConnectScreen.tsx` (line 3).

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: one error — `AppRoot.tsx` passes `FeedConnectScreen` without the new `onUploadConnect` prop. That is fixed in Task 12.

- [ ] **Step 3: Commit**

```bash
git add src/apps/ad-resizing/components/FeedConnectScreen.tsx
git commit -m "feat: add From Alli / Upload Files tabs to FeedConnectScreen"
```

---

## Task 12: Wire `AppRoot` — `handleUploadConnect`, icon conditional, pass new prop

**Files:**
- Modify: `src/apps/ad-resizing/AppRoot.tsx`

- [ ] **Step 1: Add `ArrowUpTrayIcon` to the heroicons import**

Current import (line 3):
```typescript
import { ArrowLeftIcon, SparklesIcon, CircleStackIcon, PencilSquareIcon, CheckCircleIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
```

Add `ArrowUpTrayIcon`:
```typescript
import { ArrowLeftIcon, SparklesIcon, CircleStackIcon, ArrowUpTrayIcon, PencilSquareIcon, CheckCircleIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
```

- [ ] **Step 2: Add `handleUploadConnect` alongside `handleFeedConnect`**

`handleFeedConnect` is around line 200. Add the new handler directly below it:
```typescript
function handleUploadConnect(creatives: Creative[]) {
  setFeedCreatives(creatives);
  setConnectedFeedLabel('Uploaded Files');
  setSelectedCreative(null);
  setSelectedChannels([]);
  setSelectedDimensions(new Set());
}
```

- [ ] **Step 3: Pass `onUploadConnect` to `FeedConnectScreen`**

Find the `<FeedConnectScreen` render (around line 540):
```typescript
// Before:
<FeedConnectScreen
  clientSlug={clientSlug ?? ''}
  onConnect={handleFeedConnect}
/>

// After:
<FeedConnectScreen
  clientSlug={clientSlug ?? ''}
  onConnect={handleFeedConnect}
  onUploadConnect={handleUploadConnect}
/>
```

- [ ] **Step 4: Update the connected-feed indicator icon**

Find the connected-feed indicator block (around line 569):
```typescript
// Before:
<CircleStackIcon className="h-3.5 w-3.5" />

// After:
{connectedFeedLabel === 'Uploaded Files'
  ? <ArrowUpTrayIcon className="h-3.5 w-3.5" />
  : <CircleStackIcon className="h-3.5 w-3.5" />
}
```

- [ ] **Step 5: Confirm TypeScript compiles cleanly**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors.

- [ ] **Step 6: Run all tests**

```bash
npm run test -- --run
```
Expected: all tests pass. If any fail, fix before committing.

- [ ] **Step 7: Commit**

```bash
git add src/apps/ad-resizing/AppRoot.tsx
git commit -m "feat: wire handleUploadConnect in AppRoot — connects upload tab to resize pipeline"
```

---

## Task 13: Smoke-test the full flow

Manual verification steps — no code changes. Goal: confirm the feature works end-to-end before raising a PR.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Navigate to `http://localhost:5173/adlabs/<any-client-slug>/ad-resizing/`.

- [ ] **Step 2: Verify tab header**

On the source selection screen, confirm you see "From Alli" and "Upload Files" tabs. "From Alli" should be active by default. The existing Alli feed scanning behaviour should be unchanged.

- [ ] **Step 3: Verify upload empty state**

Click "Upload Files". Confirm you see the full-screen drop zone: "Drag files here or click to browse" and "PNG, JPG, WebP · Max 50 MB per file".

- [ ] **Step 4: Upload a PNG**

Drag a PNG file onto the drop zone. Confirm:
- An uploading card appears immediately in a list below the drop zone (spinner)
- The card disappears and a grid card appears once the upload completes
- The grid card shows the thumbnail, filename, dimensions, and "PNG" badge

- [ ] **Step 5: Upload multiple files in a batch**

Drop a PNG, a JPG, and a WebP at the same time. Confirm all three upload in parallel and appear as grid cards.

- [ ] **Step 6: Test file rejection**

Try to upload a GIF. Confirm it shows an inline error "GIF and video files are not supported" and does not upload. Confirm PNG files in the same batch still upload.

- [ ] **Step 7: Test multi-select and Continue**

Click two cards. Confirm both show a blue checkbox. Confirm the "Continue with 2 files" sticky button appears. Click it. Confirm you proceed to the dimension selection step.

- [ ] **Step 8: Verify persistence**

Refresh the page and navigate back to "Upload Files". Confirm previously uploaded files appear in the grid (loaded from Firestore).

- [ ] **Step 9: Verify FilterSortBar**

Connect via Alli, then check that the file type filter now shows "WebP" instead of "GIF". Upload a WebP file via the upload tab, select it, continue to browse — confirm the WebP filter shows the uploaded file.

- [ ] **Step 10: Verify results step**

Select an uploaded creative, pick a dimension, run the resize. Confirm the results tab header shows the original filename as the source creative name (not a feed column name).

- [ ] **Step 11: Final commit**

```bash
git add -p  # stage any fixes from smoke testing
git commit -m "chore: smoke test fixes (if any)"
```

---

## Self-Review Checklist

After writing this plan, I verified against the spec:

| Spec requirement | Covered in |
|---|---|
| PNG / JPG / WebP upload (no GIF) | Task 7 (`validateUploadFile`) |
| GIF removed from pipeline detection | Task 4 (`feedToCreatives`) |
| WebP added to filter bar | Task 5 (`FilterSortBar`) |
| `sourceKind` discriminator added | Task 3 (`types.ts`) |
| Firestore `uploads` collection | Task 8 (`uploadService`) |
| Firebase Storage path via `paths.storage.app` | Task 8 |
| `newId` extracted, shared | Task 2 |
| Firestore index for `uploadedAt` | Task 6 |
| No Security Rules changes needed | Confirmed — wildcard covers new paths |
| Tab header on `FeedConnectScreen` | Task 11 |
| `onUploadConnect` prop | Task 11 + 12 |
| `handleUploadConnect` in `AppRoot` | Task 12 |
| Connected-feed icon for uploads | Task 12 |
| Multi-file parallel upload | Task 10 |
| Optimistic UI + temp URL lifecycle | Task 10 |
| Unmount cleanup | Task 10 |
| Per-file inline errors | Task 10 |
| `retryFirestoreWrite` for partial failures | Task 8 + 10 |
| Results step — filename as section header | Already correct — `creative.name` used today |
| Legacy `fileType: GIF` Firestore coercion | Task 8 (`docToCreative`) |
| `UploadMeta` type defined | Task 8 |
| `FileUpload.tsx` not reused (noted) | Task 10 comment |
| Branch off `dev` | Task 1 |
