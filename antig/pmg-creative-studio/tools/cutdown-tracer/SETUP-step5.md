# Step 5 setup — go live on `automated-creative-e10d7`

The Step 5 impls are scaffolded behind seams and green against Fakes. This is the
one-time cloud setup to do a **real render**: source video hosted in Storage, music in
a `sampleMusic` Firestore catalog, Shotstack pulling both via fetchable URLs → a 15s
9:16 MP4.

We reuse the **existing** Firebase project and the repo's conventions
(`functions/` uses `admin.initializeApp()` + ADC + `getDownloadURL` token URLs), so:

- **No service-account key file.** Local auth is plain **ADC** (`gcloud … login`).
- **One dependency:** `firebase-admin` (covers Firestore + Storage + `getDownloadURL`).
- URLs are `getDownloadURL` token URLs (publicly fetchable, non-expiring) — exactly what
  `functions/src/video.ts` already emits.

| Known values | |
|---|---|
| project id | `automated-creative-e10d7` |
| bucket | `automated-creative-e10d7.firebasestorage.app` |

---

## 1. Authenticate locally (ADC)

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project automated-creative-e10d7
```

This is all the admin SDK needs locally; admin bypasses Firestore/Storage security rules,
so no rules changes are required.

## 2. Upload music to the bucket (under `sampleMusic/`)

Use real tracks (you already have `fixtures/dtmf.mp3`). 2–3 is plenty:

```bash
gcloud storage cp fixtures/dtmf.mp3 \
  gs://automated-creative-e10d7.firebasestorage.app/sampleMusic/dtmf.mp3
```

The path after the bucket — `sampleMusic/dtmf.mp3` — is the **`storagePath`** for step 3.

## 3. Create `sampleMusic/{trackId}` Firestore docs

Collection `sampleMusic`, **document id = the trackId** you'll pass to the tracer.
Fields (the `MusicDoc` schema the catalog validates):

| field | type | required | notes |
|---|---|---|---|
| `title` | string | ✓ | display name |
| `storagePath` | string | ✓ | from step 2, e.g. `sampleMusic/dtmf.mp3` |
| `format` | string | ✓ | `mp3` \| `wav` \| `m4a` \| `aac` |
| `durationSec` | number | ✓ | track length |
| `bpm` | number | – | **omit on ≥1 track** to exercise librosa on real music |
| `mood` / `genre` / `firstBeatSec` | – | – | optional |
| `provider` | string | ✓ | e.g. `manual` |
| `licenseRef` | string | ✓ | any note/id |

Example — collection `sampleMusic`, doc id `dtmf`:

```json
{
  "title": "DtMF",
  "storagePath": "sampleMusic/dtmf.mp3",
  "format": "mp3",
  "durationSec": 30,
  "provider": "manual",
  "licenseRef": "internal-demo"
}
```

> Suggestion: create **two** docs — one **with** `bpm` (proves catalog→grid) and one
> **without** (proves the librosa fallback on a real track).

## 4. Source video

Nothing to do — the tracer uploads `fixtures/test_02.mp4` itself each run and resolves a
fetchable URL for Shotstack.

## 5. `.env`

```bash
GOOGLE_CLOUD_PROJECT=automated-creative-e10d7
GCS_BUCKET=automated-creative-e10d7.firebasestorage.app
USE_FAKES=0

# already present
GEMINI_API_KEY=...
SHOTSTACK_API_KEY=...   # sandbox/stage key
```

(librosa still runs from the `.venv-librosa` interpreter — keep `PYTHON_BIN` set when
invoking, as in step 4. The live run will pass it through.)

---

## Then I take over

Once **(a)** you've run `gcloud auth application-default login`, **(b)** uploaded the
music, and **(c)** created the `sampleMusic` docs, tell me the **trackIds** and I will:

1. `npm i firebase-admin`
2. Wire the factory real branch:
   - `getFirestore()` → `FirestoreMusicCatalog`
   - `getStorage().bucket(GCS_BUCKET)` + `getDownloadURL` → `GcsBlobStore`
   - `makeShotstackRenderer(SHOTSTACK_API_KEY)`
3. Add `npm run run-live <trackId>` and execute the full live tracer:
   `test_02.mp4` → Gemini moments → catalog/librosa BPM → planCuts → upload+URLs →
   Shotstack → **a real 15s 9:16 MP4 URL** we open in the browser (Step 5 ⛳ gate).

The offline suite stays green throughout — `firebase-admin` is only touched in the real branch.
