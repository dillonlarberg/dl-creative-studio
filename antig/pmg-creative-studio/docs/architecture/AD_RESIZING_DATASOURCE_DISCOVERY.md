# ad-resizing — Datasource Discovery Dataflow

> Companion to [`AD_RESIZING_DATAFLOW.md`](./AD_RESIZING_DATAFLOW.md) and
> [`SYSTEM_GUIDE.md`](./SYSTEM_GUIDE.md). Where the Dataflow Model traces a resize *run*
> (trigger → Cloud Function → DB → UI), this doc traces the **input side**: how the app
> discovers, lists, scans, and lets the user **pick a datasource** — and what would make
> that discovery fast and queryable.
>
> Scope was set with the primary dev (2026-06-01): the optimization target is making the
> **datasources themselves discoverable/queryable** (especially "which sources contain
> image or video content"), *not* the URL extraction — that is already implemented and is
> documented here only enough to explain the data model.
>
> Findings cross-validated by three independent code-explorer passes (UI/picker layer,
> origin/fetch layer, schema/extraction/perf layer). All three converged on the same
> architecture and the same single bottleneck.

---

## The model in one sentence

**There is no datasource index. To learn which of a client's datasources contain images,
the app dumps every Alli model, keyword-filters to the ones named like a "feed," then
opens each survivor over the network and inspects sample rows — every cold load, every
session.**

The "pick a datasource" step is therefore an **O(N) network scan**, not a query. That is
the whole story, and the whole opportunity.

---

## 1. Where datasources come from (origin)

The authoritative system is the **Alli Platform Data Explorer API**:

```
GET https://dataexplorer.alliplatform.com/api/v2/clients/{clientSlug}/models
```

- It is **not** Firestore, **not** a DAM / asset-house, **not** Cloud Storage, **not** the
  Alli MCP servers. It is a plain REST GET to Alli's UDA backend.
- Each "datasource" is an **Alli (Cube.js semantic-layer) model** — a named table-like
  entity with `dimensions` (categorical fields) and `measures` (numeric fields).
- The call is proxied through a Firebase Cloud Function (`getDataSourcesProxy`) purely to
  handle CORS and forward the Alli OIDC bearer token. **No query parameters** other than the
  client slug — the endpoint cannot filter by type, media, or content.

There is a second, independent input path: the **Upload tab**, which builds creatives from
local file upload and never touches the Alli API.

**Tenant scoping:** the `clientSlug` (from the React Router param) is the *only* query
dimension. It is threaded into the URL path; Alli enforces tenant isolation server-side.
`AppRoot` resets all datasource state if the slug changes mid-session.

---

## 2. End-to-end dataflow

```
┌─ AppRoot.tsx ───────────────────────────────────────────────────────────────┐
│ feedCreatives === null  ──►  render <FeedConnectScreen>                       │
└──────────────────────────────────────────────────────────────────────────────┘
        │
        ▼  (mount → runScan, useEffect keyed on clientSlug)
┌─ FeedConnectScreen.tsx ───────────────────────────────────────────────────────┐
│                                                                                │
│  ① LIST   fetchDataSources({ clientSlug })                                     │
│             └─► alliService.getDataSources(slug)                               │
│                  └─► /api/getDataSourcesProxy?clientSlug=…                      │
│                       └─► dataexplorer…/clients/{slug}/models   (FULL DUMP)     │
│           ── client-side filter: name|description|label includes "feed"        │
│              OR name === 'creative_insights_data_export'                        │
│                                                                                │
│  ② SCAN   for each feed, in batches of 3 (BATCH = 3):                          │
│             fetchFeedSample({ clientSlug, feed })                              │
│               ├─► alliService.getModelMetadata  (extra round-trip if no schema)│
│               └─► alliService.executeQuery  ── progressive fallback ladder:    │
│                     dims+measures → dims → first-dim → model-specific           │
│                     (up to 4 sequential attempts per feed)                     │
│             └─► detectImageColumns(first 5 rows)                                │
│                   keep feeds where a column is http…(.jpg|.jpeg|.png|.webp)     │
│                   in ≥50% of sampled rows                                       │
│                                                                                │
│  ③ RENDER verifiedFeeds[]  →  scrollable card list + name search <Input>       │
│                                                                                │
│  ④ PICK   user clicks a feed                                                   │
│             └─ >1 image column?  → inline column picker → handleSelectColumn   │
│             └─ feedToCreatives(sampleData, feedName, imageColumn)              │
│                  └─► onConnect(feed, column, creatives)                         │
└──────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ AppRoot.tsx ───────────────────────────────────────────────────────────────┐
│ handleFeedConnect → setFeedCreatives(creatives) + setConnectedFeedLabel(name) │
│ (picker disappears; creative grid renders)                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Upload path: `UploadTab` → user selects files → `onUploadConnect(creatives)` →
`handleUploadConnect` sets the same `feedCreatives` / `connectedFeedLabel` state with label
`"Uploaded Files"`.

---

## 3. The key files (the seams)

| Layer | File | What it owns |
|---|---|---|
| Picker UI | `src/apps/ad-resizing/components/FeedConnectScreen.tsx` | Scan orchestration, batching (`BATCH=3`), tabs, name search, column disambiguation |
| Picker mount gate | `src/apps/ad-resizing/AppRoot.tsx` | Renders picker when `feedCreatives === null`; `handleFeedConnect` / `handleUploadConnect`; slug-change reset |
| **List + Scan seam** | `src/apps/template-builder/_internal/handlers.ts` | `fetchDataSources` (line 292), `fetchFeedSample` (line 72), in-memory caches |
| HTTP client | `src/services/alli.ts` | `getDataSources`, `getModelMetadata`, `executeQuery`, OIDC token |
| Proxy (HTTP boundary) | `functions/src/alliProxy.ts` | `getDataSourcesProxy` (line 283), `smartExecuteQueryProxy` (line 345) |
| Extraction | `src/apps/ad-resizing/utils/feedToCreatives.ts` | `detectImageColumns` (line 23), `feedToCreatives` (line 64) |
| Upload path | `src/apps/ad-resizing/components/UploadTab.tsx`, `services/uploadService.ts` | Local-file datasource, `uploads/` Firestore collection |
| Types | `src/apps/template-builder/types.ts` (`SelectedFeed`), `src/apps/ad-resizing/types.ts` (`Creative`) | Datasource + creative shapes |

**The two boundary functions to know:**
- `fetchDataSources({ clientSlug }) → { feeds: SelectedFeed[]; error? }` — produces the list. **The seam to optimize for discovery.**
- `fetchFeedSample({ clientSlug, feed }) → FeedSampleResult` — opens one datasource to get its rows. The seam between "a datasource exists" and "what's inside it."

---

## 4. The data model

### Datasource (`SelectedFeed`) — `src/apps/template-builder/types.ts:26`

```ts
interface SelectedFeed {
  name: string;
  dimensions?: Array<string | { name: string }>;
  measures?: Array<string | { name: string }>;
  [k: string]: unknown;   // swallows everything else the API returns
}
```

Critically: **no `type`, no `hasImages`, no `mediaType`, no `rowCount`, no `lastUpdated`.**
The only way to know a datasource contains images is to open it and look.

### Creative (extraction output) — `src/apps/ad-resizing/types.ts:1`

```ts
interface Creative {
  id: string;            // sha256(originalUrl).slice(0,16)
  name: string;
  thumbnailUrl: string;
  originalUrl?: string;
  width: number;         // defaulted to 1080; resolved lazily via <img> onLoad
  height: number;
  fileType: 'PNG' | 'JPG' | 'WEBP';
  uploadedAt: string;
  source: string;
  sourceKind?: 'alli' | 'upload';
  tags: string[];
}
```

### Image vs. video distinction (today)

- **Feed scan path (the live path):** images-only. `IMAGE_EXTENSIONS = ['.jpg','.jpeg','.png','.webp']`.
  GIF/`.mp4`/`.mov`/`.webm` are never detected. There is no video discovery here.
- A separate `getCreativeAssets` method (`alli.ts:155`) *does* read a `creative_type` field
  and tags rows `'video' | 'image'` — but it is **not** used by the ad-resizing feed scan.
- The special model `creative_insights_data_export` has a hard-coded filter
  (`handlers.ts:231`) that *drops* video rows.

> Implication for the goal: a media-aware datasource index would need to broaden detection
> beyond the image-only extension list, OR lean on the `creative_type` signal that already
> exists in the `creative_insights_data_export` shape.

---

## 5. Persistence & caching today

| Layer | Where | Lifetime | Note |
|---|---|---|---|
| Datasource list cache | `_dataSourceCache: Map<slug, …>` (`handlers.ts:41`) | Session (lost on reload) | In-memory only |
| Sample cache | `_feedSampleCache: Map<"slug:model", …>` (`handlers.ts:42`) | Session (lost on reload) | In-memory only |
| Batch record | `clients/{slug}/apps/ad-resizing/batches/{batchId}` | Persistent | Records `feedId`/`feedName` *used* by a run — not a discovery index |
| Output doc | `clients/{slug}/apps/ad-resizing/outputs/{outputId}` | Persistent | Parity schema, `kind:'image'` |
| Uploads | `clients/{slug}/apps/ad-resizing/uploads/{uploadId}` | Persistent | Upload-path datasource only |

**No persisted datasource-discovery metadata exists.** The caches that *would* speed up
discovery (`_dataSourceCache`, `_feedSampleCache`) are module-level Maps that die on page
reload and on every new session.

### 5a. The cache persists the wrong thing

`_feedSampleCache` stores the raw `FeedSampleResult` (sample **rows**). The thing the
discovery UI actually needs — `{ name, imageColumns, imageCount }` — is **never stored**;
it is recomputed by re-running `detectImageColumns` over the raw rows on every read
(`FeedConnectScreen.tsx:88-91`). The expensive, stable answer is thrown away; the
session-bound, bulky rows are what get kept.

### 5b. The comment reveals the mental model blocking persistence

`handlers.ts:39-40`:

> `// Module-level session caches — survive component remounts, cleared on`
> `// explicit rescan or page reload (which also clears the Alli auth session).`

"We can't keep the cache because the Alli auth session dies on reload" is only true for
the **rows**. It conflates two independent things:

| | Tied to Alli session? | Stable? | Belongs in |
|---|---|---|---|
| **Scan result** (which feeds have image/video columns, column names, counts) | **No** | Yes | Firestore (read with the Firebase Auth token the app already holds) |
| **Live sample rows** (`sampleData`) | Yes | No | A live Alli fetch |

The discovery metadata is **session-independent**, which is exactly why it can live in
Firestore and survive reload. The current design caches the session-bound thing and
recomputes the persistable thing — backwards.

### 5c. Two needs, conflated into one cache

| Need | When | Payload | Cost |
|---|---|---|---|
| **Discovery** | On login / picker open — must be instant | `{ name, imageColumns, imageCount, hasImage, hasVideo }` (tiny) | 1 Firestore read |
| **Selection** | On feed click — one feed | the rows that feed `feedToCreatives` (`FeedConnectScreen.tsx:180,189`) | 1 live Alli fetch, user-initiated |

The full N-feed up-front scan exists **only** because the cache tries to pre-fetch rows for
every feed so that selection is instant. Split the two — persist discovery, fetch rows
lazily on click — and the scan leaves the hot path entirely.

---

## 5.5. Layering & coupling findings (the "before you build" read)

Two structural problems sit on top of the perf story; both must be addressed by the same
change or it just moves the smell around.

**Cross-app reach into `_internal/`.** `FeedConnectScreen.tsx` imports **five runtime
symbols + one type** from another app's private internals:

```ts
import { fetchDataSources, fetchFeedSample } from '../../template-builder/_internal/handlers'; // L14
import type { SelectedFeed }                from '../../template-builder/types';                // L15
import { clearFeedCache, getCachedDataSources, getCachedFeedSample }
                                            from '../../template-builder/_internal/handlers';   // L17
```

`template-builder/steps/SourceStep.tsx` imports the same handlers. So datasource discovery
is a **shared platform concern domiciled inside one app by accident of porting** (the
`handlers.ts` header notes it was ported from the monolith's `UseCaseWizardPage.tsx`).
Neither app should own it.

**Data logic living in a presentational component.** `runScan` (`FeedConnectScreen.tsx:73-174`)
is ~100 lines of cache-aware orchestration inside JSX: it knows cache keys, branches on
hit/miss, re-derives `imageColumns`/`imageCount` from rows, batches network calls, and
runs race-guards (`runId`). `processFeed` is duplicated near-verbatim across the cached and
cold branches. This belongs in a service/hook.

> This is on-strategy: `SYSTEM_GUIDE.md` already calls for extracting a domain layer and
> decoupling apps from it. The datasource registry is a textbook member of that layer.

---

## 6. Performance profile — where the time goes

Cross-validated bottlenecks, in order of cost:

1. **O(N) scan over all "feed" models.** Every candidate feed is opened to detect image
   columns; there is no way to pre-filter. With ~20 feeds at `BATCH=3`, that's ≥7 serial
   batch rounds → **10–30 s cold load.**
2. **Extra metadata round-trip per feed** when `dimensions/measures` aren't pre-populated
   (`handlers.ts:96`) — doubles latency for those feeds.
3. **Progressive fallback ladder** — up to 4 *sequential* query attempts per feed before
   data is returned (`handlers.ts:137`).
4. **In-memory cache lost on reload** — returning users re-pay the full scan every session.
5. **Whole sample held in memory & fully iterated** by `feedToCreatives` (detection only
   samples 5 rows, but extraction walks all rows). No pagination/streaming.
6. **Lazy dimension resolution** — 100+ creatives → 100+ `<img>` fetches to read pixel
   sizes (`AppRoot.tsx:225`), 100 ms-debounced for state but not for fetches.
7. **No virtual scrolling** in the feed/creative lists.

The Alli `/models` endpoint offers **no server-side filtering** of any kind, so none of
this can be pushed down to the source.

---

## 7. Queryability today: there is none (at the datasource level)

To answer *"which datasources contain image (or video) content?"* the app must, every cold
session:

1. Dump all models (1 call).
2. Keyword-filter client-side (fragile: a `product_catalog` or `asset_library` model that
   *does* have images is silently excluded because its name lacks "feed").
3. Open **every** survivor (1–4 calls each) and inspect sample rows.

A client with 15 image-free feeds still pays to fetch and scan all 15 before discarding
them. There is no index, no flag, no precomputed answer.

---

## 8. Optimization — the model

Scope decisions from the dev (2026-06-01) that shape this:

1. **Make the datasources themselves queryable**, not the URLs (URL extraction is done).
2. **Client-level**, so every app inherits one index and filters it per its own media needs.
3. **New clients are rare** — so populating the index is an occasional out-of-band job, not
   a hot-path concern.
4. **The linear scan does not need optimizing** — it needs to leave the user's path. Known
   datasources must appear instantly on login with no scan-wait while picking creatives.

> This *replaces* an earlier draft of this section that proposed read-first /
> scan-on-miss + TTL + background refresh. Given (3) and (4), that machinery is
> over-engineered. The model below is deliberately simpler: **the index is authoritative
> and the app only reads it.**

### 8.1 A client-level datasource registry (Firestore)

Collection: `clients/{slug}/datasources/{modelName}` — sits alongside `clients/{slug}/assets`
(top-level, app-agnostic; precedent already in `src/platform/firebase/paths.ts`). No
existing `datasources` collection to collide with.

```ts
interface DatasourceRecord {
  modelName: string;                 // datasource identity (Alli model name)
  label?: string;
  hasImage: boolean;                 // ← the filter every app queries
  hasVideo: boolean;                 // ← future video apps fall out for free
  imageColumns: string[];            // detected image-URL columns
  videoColumns: string[];            // detected video-URL columns
  sampleCount: number;               // display metadata (e.g. "240 images")
  schemaHint?: { dimensions: string[]; measures: string[] };  // skips a round-trip at selection
  scannedAt: Timestamp;
  scanVersion: number;               // bump when detection logic changes → re-scan
}
```

Media type is stored **once** as the datasource's own property. "Image vs. video" is *not*
stored per app — each app simply queries the slice it wants. Add path helpers:
`paths.datasources(slug)` and `paths.datasource(slug, modelName)`.

### 8.2 The index is populated out-of-band, never in the request path

Because new clients are rare and feeds are relatively stable, the expensive Alli scan runs
**outside** any user interaction:

- **On client onboarding** — a script or callable Cloud Function runs the full scan once and
  writes the registry.
- **Manual "Refresh datasources"** admin action — re-runs the scan when a client's feeds
  change. (Replaces today's `clearFeedCache` + auto-rescan.)
- *(Optional)* a low-frequency scheduled Cloud Function as a safety net.

The scan logic is the existing ladder (`fetchDataSources` → per-feed `fetchFeedSample` →
`detectImageColumns`); it just moves out of the browser hot path and writes its result to
Firestore instead of an in-memory Map.

### 8.3 The app only reads — instant on login

```
picker opens
  └─ getDatasources(slug)  → ONE Firestore query:
       where(hasImage == true)         // ad-resizing's slice
  └─ render list instantly  (name, imageColumns, sampleCount — all from the doc)

user clicks a feed
  └─ fetch that ONE feed's rows live (Alli session) → feedToCreatives → connect
```

Discovery is a single Firestore read (survives reload, no Alli session needed). Row-fetch
happens for exactly the one feed the user picked — a single user-initiated call, not an
N-feed pre-scan. The "wait for the scan every time" disappears.

**Honest tradeoff:** a brand-new feed added to an existing client between scans won't show
until someone hits *Refresh datasources* (or the optional cron runs). Given rare clients +
the manual button, that's an acceptable price for instant loads — but it is the one thing
given up versus today's always-live scan.

### 8.4 De-couple while you're in here (same change, or it just moves the smell)

- **New platform service** `src/platform/datasources/` (or `src/services/datasources.ts`):
  - `getDatasources(slug, { media })` — reads the registry (the fast path the picker calls).
  - `scanDatasources(slug)` — runs the Alli scan and writes the registry (the out-of-band path).
- **Migrate both consumers** (`ad-resizing/FeedConnectScreen`, `template-builder/SourceStep`)
  onto the service; delete the imports from `template-builder/_internal/handlers` and the
  cross-app `SelectedFeed` import. The `_internal` cache accessors
  (`getCachedDataSources`/`getCachedFeedSample`/`clearFeedCache`) go away — the registry is
  the cache now.
- **Move `runScan` orchestration out of the component** into the service / a small hook;
  `FeedConnectScreen` becomes presentational (render list, handle click).
- **The `'feed'` keyword filter dies** (`handlers.ts:308`). "Is this a usable datasource?"
  becomes a stored boolean (`hasImage`), set once at scan time — not a fragile substring
  match that silently drops a `product_catalog` with images.

### 8.5 What this does NOT change

URL extraction (`detectImageColumns` → `feedToCreatives`) is reused as-is — at **scan time**
to populate `imageColumns`, and at **selection time** to build creatives from the one
selected feed. The model wraps it; it doesn't rewrite it.

---

## 9. Open questions for the dev

1. **Video detection now or later?** The pipeline is images-only end-to-end today (outputs
   `kind:'image'`). Populating `hasVideo`/`videoColumns` in the registry is cheap and worth
   doing now so a future video app inherits it — but it means broadening `detectImageColumns`
   beyond the image-extension list (and/or reading the existing `creative_type` signal). Do
   we index video sources now, or ship images-only and bump `scanVersion` later?
2. **Where does `scanDatasources` run** — a callable Cloud Function (server holds the Alli
   session, warms new clients without a browser) vs. a client-triggered write-through from
   the admin "Refresh" button (simplest, no new infra)? Leaning callable function, but the
   button can call either.
3. **Can Alli annotate models** server-side (a `containsImageUrls`-style attribute)? If so,
   the registry could be sourced from Alli rather than self-maintained — but the trace found
   no such capability on the current `/models` endpoint.
4. **Refresh trigger:** manual button alone, or also a low-frequency scheduled scan? Driven
   by how often client feeds actually change schema (the only thing that staleness costs us,
   per the §8.3 tradeoff).
5. **Migration order:** do the de-coupling (§8.4) and the registry land as one change, or
   does the platform service ship first (still reading the live scan) and the Firestore
   registry follow? The former is cleaner; the latter de-risks.

---

*Authored 2026-06-01 from a three-agent parallel codebase trace. File/line references valid
as of that date — verify against current source before implementing.*
