# Step 5 setup — Firebase Storage + Firestore + Shotstack

This is the one-time setup that lets the tracer do a **real live render**: source video
hosted in Cloud Storage, music in a `sampleMusic` Firestore catalog, Shotstack pulling
both via long-TTL signed URLs and returning a 15s 9:16 MP4.

The code is already scaffolded behind seams (`FirestoreMusicCatalog`, `GcsBlobStore`,
`ShotstackRenderer`) and green against Fakes. After you finish the steps below, I'll
install the two SDKs, wire the `make*` constructors into the factory, and run it.

> **What I need back from you:** the items marked **➡️ give me** — a bucket name, a
> service-account key path, and confirmation the `sampleMusic` docs exist.

---

## 1. Pick the Firebase project & bucket

Use an existing Firebase project (the dev one is fine) or create a throwaway. You need
**Cloud Storage** and **Firestore** enabled on it.

- Firebase console → **Build → Storage** → *Get started* (if not already on).
- Firebase console → **Build → Firestore Database** → *Create database* (Native mode).

Note the **bucket name** — it looks like `your-project.appspot.com` or
`your-project.firebasestorage.app` (Storage page shows it at the top, `gs://…`).

**➡️ give me:** the bucket name and the project id.

---

## 2. Service-account key (for signing + Firestore read)

Signed URLs need a service account **with a private key** (the JSON key is enough — no
extra IAM dance for local V4 signing).

1. Google Cloud console → **IAM & Admin → Service Accounts** (same project).
2. Create one (e.g. `cutdown-tracer`) or reuse an existing app SA.
3. Grant roles:
   - **Storage Object Admin** (`roles/storage.objectAdmin`) — upload + read objects.
   - **Cloud Datastore User** (`roles/datastore.user`) — read `sampleMusic`.
4. **Keys → Add key → Create new key → JSON** → download it.
5. Save it OUTSIDE git (e.g. `~/.config/cutdown-tracer-sa.json`). **Never commit it.**

**➡️ give me:** the absolute path to that JSON file.

---

## 3. Upload music files to the bucket

Put 2–3 short music tracks (mp3/wav/m4a/aac) in the bucket under a `sampleMusic/` prefix.

Console: Storage → *Upload files* into a `sampleMusic` folder. Or CLI:

```bash
gcloud storage cp ./drift-90.mp3 gs://YOUR_BUCKET/sampleMusic/drift-90.mp3
gcloud storage cp ./dtmf.mp3      gs://YOUR_BUCKET/sampleMusic/dtmf.mp3
```

The object path after the bucket (e.g. `sampleMusic/drift-90.mp3`) is the **`storagePath`**
you'll put in Firestore next. (Files stay private — the tracer signs them on read.)

---

## 4. Create `sampleMusic/{trackId}` Firestore docs

One doc per track. **Document ID = the trackId** you'll pass to the tracer. Fields (this is
the `MusicDoc` schema the catalog validates):

| field | type | required | notes |
|---|---|---|---|
| `title` | string | ✓ | display name |
| `storagePath` | string | ✓ | bucket-relative path from step 3, e.g. `sampleMusic/drift-90.mp3` |
| `format` | string | ✓ | one of `mp3` \| `wav` \| `m4a` \| `aac` |
| `durationSec` | number | ✓ | track length in seconds |
| `bpm` | number | – | **omit on at least one track** so we exercise librosa tempo detection |
| `firstBeatSec` | number | – | optional downbeat offset |
| `mood` / `genre` | string | – | optional |
| `provider` | string | ✓ | e.g. `manual`, `artlist` |
| `licenseRef` | string | ✓ | any license note/id |

Example doc — collection `sampleMusic`, document id `drift-90`:

```json
{
  "title": "Drift",
  "storagePath": "sampleMusic/drift-90.mp3",
  "format": "mp3",
  "durationSec": 30,
  "bpm": 90,
  "provider": "manual",
  "licenseRef": "internal-demo"
}
```

> Tip: make one doc **with** a `bpm` and one **without** — the with-BPM track proves the
> catalog→grid path; the without-BPM track proves the librosa fallback on real music.

**➡️ give me:** confirmation the docs exist (and the trackIds).

---

## 5. Source video

The office clip (`fixtures/test_02.mp4`) stays local — the tracer **uploads it for you**
on each run (`GcsBlobStore.uploadAndSign`) and signs it for Shotstack. Nothing to do here
beyond having the file in `fixtures/`.

---

## 6. Shotstack key

Already in `.env` (`verify-shotstack` was green). Use the **sandbox/stage** key — renders
are free and watermarked, which is fine for v0.

---

## 7. `.env` additions

```bash
# Cloud Storage / Firestore
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/cutdown-tracer-sa.json
GCS_BUCKET=your-project.appspot.com
FIREBASE_PROJECT_ID=your-project-id

# already present from earlier steps
GEMINI_API_KEY=...
SHOTSTACK_API_KEY=...        # sandbox/stage key
USE_FAKES=0                  # flip to go live
```

---

## 8. Then I take over

Once the above is done, I will:

1. `npm i firebase-admin @google-cloud/storage`
2. Add the `makeFirestoreCatalog` / `makeGcsBlobStore` / `makeShotstackRenderer` wiring
   into `factory.ts` (the real branch), reading the env above.
3. Add a `run-live` script and run the **full live tracer**:
   `test_02.mp4 + <trackId>` → Gemini moments → librosa/catalog BPM → planCuts →
   GCS upload + signed URLs → Shotstack render → **a real 15s 9:16 MP4 URL**.
4. We eyeball the reel together (the Step 5 ⛳ gate).

The offline suite stays green throughout — the SDKs are only touched in the real branch.
