# Prompt — Source 20 royalty-free social-media music tracks (cutdown catalog)

**Use this as a task brief for an AI agent or a human curator.** Goal: expand the Video Cutdown music catalog (`sampleMusic/` in Firestore + Storage) from 2 → ~22 tracks with a diverse, **royalty-free**, social-media-ready set, each tagged against our controlled vocabulary so the picker can filter and the beat grid has good BPM variety.

The output of this task is **(a)** ~20 audio files uploaded to Cloud Storage and **(b)** ~20 entries appended to `tools/cutdown-tracer/tracks.json`. An ingest script then probes BPM/duration and writes the Firestore docs.

---

## Hard requirements (non-negotiable)

1. **License = free for commercial use, NO attribution required.** Prefer **Pixabay Content License** or **CC0**. Do NOT use anything that requires attribution, sync fees, or that is AI-generated with unsettled rights (no Suno/Udio). Record the exact license in `licenseRef`.
2. **Instrumental only** (`vocals: "instrumental"`). Ad cutdowns lay music under footage that may have its own VO; lyrics fight the edit. (Leave room for 1–2 `vocal` tracks only if clearly hook-driven and tagged so.)
3. **Format = mp3**, stereo, ≥128 kbps, full-length (≥60s so 15/30/60s cuts have headroom).
4. **Short-form social fit:** modern, punchy, loop-friendly; clear rhythmic pulse (the cutdown snaps cuts to the beat, so steady tempo matters — avoid heavy rubato/free-tempo pieces).
5. **No duplicates** of the 2 existing tracks (`dtmf`, `otro_atardecer`).

## BPM diversity target (the beat grid depends on it)

Spread the 20 across tempo bands so cutdowns aren't all the same pace:
- **~6 slow** (70–95 BPM) — chill / lofi / ambient / warm
- **~8 mid** (96–124 BPM) — pop / corporate / hiphop / indie / funk
- **~6 fast** (125–150 BPM) — electronic / energetic / aggressive / fitness

(BPM is auto-detected at ingest — you don't hand-enter it — but pick tracks that span these bands.)

## Mood / genre coverage target

Aim for breadth, not 20 of one vibe. Hit most of these moods at least once: `energetic, chill, uplifting, dramatic, playful, cinematic, confident, warm, dreamy, intense`. And these genres: `electronic, hiphop, pop, corporate, acoustic, ambient, lofi, funk, indie`. Lean toward what performs on social: **energetic / confident / uplifting**, genres **electronic / hiphop / pop / lofi / corporate**.

---

## Tagging schema (controlled vocabularies — use EXACT values)

Source of truth: `tools/cutdown-tracer/src/musicTags.ts`. Every tag must be one of these literals (lowercase):

- **`mood`** (pick 1): `energetic · chill · uplifting · dramatic · dark · playful · cinematic · nostalgic · aggressive · romantic · confident · warm · dreamy · calm · intense`
- **`genre`** (pick 1): `electronic · hiphop · pop · rock · ambient · corporate · acoustic · orchestral · lofi · funk · indie · rnb · folk · jazz`
- **`energy`** (integer 1–5): 1 = sparse/background, 3 = steady drive, 5 = peak/hype
- **`vocals`**: `instrumental` (default) or `vocal`
- **`tags`** (array, 1–3 from): `product · lifestyle · tech · fashion · travel · corporate · social · beauty · fitness · food · automotive · finance` — the ad use-cases the track suits

If a track doesn't map cleanly to one of these values, **pick the nearest** — do not invent new tag values (they will fail Zod validation at ingest).

---

## Output format — append to `tools/cutdown-tracer/tracks.json`

A JSON array of entries. **Omit `bpm` and `durationSec`** — the ingest script probes them with librosa. `trackId` = lowercase `[a-z0-9_]`, unique, descriptive. `storagePath` = `sampleMusic/<trackId>.mp3`. `provider` = the source site (e.g. `pixabay`, `fma`). `licenseRef` = the license id/url (e.g. `pixabay-content-license`, `cc0`).

```json
{
  "trackId": "neon_drive",
  "title": "Neon Drive",
  "storagePath": "sampleMusic/neon_drive.mp3",
  "format": "mp3",
  "mood": "energetic",
  "genre": "electronic",
  "energy": 4,
  "vocals": "instrumental",
  "tags": ["tech", "product", "social"],
  "provider": "pixabay",
  "licenseRef": "pixabay-content-license"
}
```

Deliver all ~20 as a single JSON array ready to merge into `tracks.json`.

---

## Where to find them (royalty-free, no-attribution first)

| Source | License | Notes |
|---|---|---|
| **Pixabay Music** (pixabay.com/music) | Pixabay Content License — free commercial, no attribution | Best default. Filter by genre/mood/tempo; download mp3. |
| **Free Music Archive — CC0 subset** (freemusicarchive.org) | CC0 only (check per track) | Verify the per-track license is CC0, not CC-BY. |
| **ccMixter** (dig.ccmixter.org) | CC0 / commercial-allowed subset | Filter to no-attribution licenses. |
| **Uppbeat** (free tier) | ⚠️ requires attribution on free tier | AVOID unless premium; attribution breaks requirement #1. |

For each downloaded file: name it `<trackId>.mp3` and upload to `gs://automated-creative-e10d7.firebasestorage.app/sampleMusic/<trackId>.mp3`.

---

## Ingest (after files are uploaded + `tracks.json` updated)

```bash
cd tools/cutdown-tracer
PYTHON_BIN=$(pwd)/.venv-librosa/bin/python npm run ingest-music -- --manifest tracks.json
```

This probes BPM + duration per file and writes `sampleMusic/{trackId}` docs (merge). Then verify the `cutdownListTracks` callable returns the full set in the Video Cutdown picker.

## Acceptance checklist

- [ ] ~20 new tracks, all instrumental (or ≤2 clearly-tagged vocal), all no-attribution commercial licenses.
- [ ] BPM bands covered (~6 slow / ~8 mid / ~6 fast).
- [ ] Mood + genre breadth hit (see targets above); social-leaning skew.
- [ ] Every `mood`/`genre`/`vocals`/`tags`/`energy` value is a valid schema literal.
- [ ] Files uploaded to `sampleMusic/<trackId>.mp3`; entries appended to `tracks.json`; ingest run; picker shows them.
