# `runOutpaintBatch` smoke tests — copy/paste from devtools console

Target: deployed callable at
`https://us-central1-automated-creative-e10d7.cloudfunctions.net/runOutpaintBatch`
(Cloud Run revision `runoutpaintbatch-00001-kit`).

Run these in the **browser console of the running dev server** so you reuse the
signed-in PMG auth token. The callable rejects with `permission-denied` unless
your email is in `functions/src/_shared/allowlist.ts`.

---

## 0. Boot

```bash
npm run dev
```

Open `http://localhost:5173/` (or whichever port Vite picks), sign in with your
PMG email, navigate anywhere inside a client workspace so the Firebase SDK is
fully initialised.

Open devtools → Console.

---

## 1. One-output smoke test (~$0.04, ~60–90 s)

The minimum-cost check that the full pipeline works end-to-end.

**Before running:** grab a real source-image URL from any feed in the app
(right-click a creative thumbnail → Copy image address). Anything publicly
fetchable via HTTPS works; the SSRF guard will reject non-public IPs.

```js
const { httpsCallable } = await import('firebase/functions');
const { functions } = await import('/src/firebase.ts');

const fn = httpsCallable(functions, 'runOutpaintBatch', { timeout: 600000 });

const r = await fn({
  clientSlug: 'pmg',                                  // change to whatever client you're scoped to
  batchId: 'smoke-' + Date.now(),
  creativeId: 'smoke-creative',
  originalUrl: 'https://PASTE_A_REAL_FEED_IMAGE_URL_HERE',
  creativeName: 'Smoke test',
  outputs: [{
    outputId: 'smoke-o1-' + Date.now(),
    dimension: { width: 1080, height: 1080, label: 'social-1x1', channel: 'Social' },
  }],
});

console.log(r.data);
```

**Expected response:**
```js
{ batchId: 'smoke-...', status: 'completed', completedCount: 1, errorCount: 0 }
```

---

## 2. Four-output multi-target smoke test (~$0.16, ~80–120 s)

Validates the hoisted-P1 / `p-limit(4)` fan-out and a mix of in-band + extreme
aspects. Reuses the source via the sha256 cache key so the second run after
this one will skip the staging fetch.

```js
const { httpsCallable } = await import('firebase/functions');
const { functions } = await import('/src/firebase.ts');

const fn = httpsCallable(functions, 'runOutpaintBatch', { timeout: 600000 });
const stamp = Date.now();

const r = await fn({
  clientSlug: 'pmg',
  batchId: 'smoke-fan-' + stamp,
  creativeId: 'smoke-creative',
  originalUrl: 'https://PASTE_A_REAL_FEED_IMAGE_URL_HERE',
  creativeName: 'Smoke fan-out',
  outputs: [
    { outputId: 'smoke-fan-1x1-'   + stamp, dimension: { width: 1080, height: 1080, label: 'social-1x1',  channel: 'Social' } },
    { outputId: 'smoke-fan-9x16-'  + stamp, dimension: { width: 1080, height: 1920, label: 'social-9x16', channel: 'Social' } },
    { outputId: 'smoke-fan-4x5-'   + stamp, dimension: { width: 1080, height: 1350, label: 'social-4x5',  channel: 'Social' } },
    { outputId: 'smoke-fan-160x600-'+ stamp, dimension: { width: 160,  height: 600,  label: 'prog-160x600', channel: 'Programmatic' } },
  ],
});

console.log(r.data);
```

**Expected:** `status: 'completed'`, `completedCount: 4`, `errorCount: 0`. If
any tile fails permanently (content_policy on `160×600`'s aspect, etc.) you'll
see `status: 'partial'` — that's fine for now, the classifier path is what
PR-D's Retry button drives.

---

## 3. Re-crop test (~$0.04, ~60–90 s)

Exercises `additionalContext` threading + single-output overwrite semantics.
Must use the same `outputId` as an existing completed output. Run after #1.

```js
const { httpsCallable } = await import('firebase/functions');
const { functions } = await import('/src/firebase.ts');

const fn = httpsCallable(functions, 'runOutpaintBatch', { timeout: 600000 });

const r = await fn({
  clientSlug: 'pmg',
  batchId: 'smoke-recrop-' + Date.now(),
  creativeId: 'smoke-creative',
  originalUrl: 'https://PASTE_SAME_URL_AS_RUN_1',
  creativeName: 'Smoke re-crop',
  outputs: [{
    outputId: 'PASTE_SMOKE_O1_ID_FROM_RUN_1',     // ← overwrites that output
    dimension: { width: 1080, height: 1080, label: 'social-1x1', channel: 'Social' },
  }],
  retryPrompt: 'extend the scene with dramatic golden-hour lighting and warm ambient haze',
});

console.log(r.data);
```

**Expected:** `status: 'completed'`. Open the output in Storage and compare to
the first run — extension regions should differ visibly.

---

## 4. Verify side effects

### Live tail logs
```bash
npx firebase functions:log --only runOutpaintBatch --project automated-creative-e10d7
```

### Firestore (Firebase console → Firestore Data)
- `clients/pmg/apps/ad-resizing/batches/{batchId}` — `status: completed`, `sourceCreative` populated, `completedVariations === totalVariations`, `errorCount: 0`.
- `clients/pmg/apps/ad-resizing/outputs/{outputId}` — `status: complete`, `storageRef` set, `p1Analysis` populated, `timings.p1Ms` (~5–15 s), `timings.p2Ms` (~30–60 s).

### Storage (Firebase console → Storage)
- `clients/pmg/apps/ad-resizing/sources/{sourceKey}.{jpg|png}` — original cached.
- `clients/pmg/apps/ad-resizing/outputs/{outputId}.png` — final result; download to verify it renders at the requested target dimensions.
- `clients/pmg/apps/ad-resizing/intermediates/{batchId}/{outputId}/{canvas|mask|raw}.png` — debug artifacts (canvas is the padded input, mask is the white-on-transparent paint region, raw is the model output before sharp cover-fit).

---

## Failure-mode reference

| Symptom | Probable cause | Action |
|---|---|---|
| `HttpsError: permission-denied "Not an Alli Studio user"` | Your email isn't in the allowlist or your token isn't `email_verified` | Sign in fresh; check `functions/src/_shared/allowlist.ts` |
| `HttpsError: invalid-argument "clientSlug must match…"` | Slug has uppercase or invalid chars | Lowercase a–z, 0–9, `_`, `-` only |
| `HttpsError: invalid-argument "outputs[N].dimension out of bounds"` | Dim outside [50, 3840] | Pick legal dims; tracer presets always work |
| `HttpsError: internal "SSRF: …"` | Source URL resolved to a private IP | Use a public CDN URL |
| Per-output `errorCategory: permanent` + `content_policy` | OpenAI refused the prompt for that target | Try a different creative or aspect ratio |
| Per-output `errorCategory: transient` + 429 | gpt-image-2 rate-limited | Re-run; classifier marks it transient so the UI Retry button (PR-D) will work |
| Batch hangs at `processing` for >5 min | P1 or P2 stalled past the 300 s timeout | Check logs; lower `outputs[]` count |
| `Cannot find module 'X'` in cold-start log | Runtime peer dep gap | Add to `functions/package.json` deps + redeploy |

---

## Quick teardown / cleanup

Smoke-test docs and outputs accumulate noise in Firestore + Storage. After
verifying, delete the smoke `batches/smoke-*` + `outputs/smoke-*` docs and the
`outputs/smoke-*.png` blobs from the console. Sources are content-addressed so
they self-dedupe on real runs.
