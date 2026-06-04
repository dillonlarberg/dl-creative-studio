/**
 * Contract tests for FirestoreMusicCatalog — the Firestore client and the URL
 * signer are INJECTED (fakes), so no network/credentials are needed.
 */
import { describe, it, expect } from "vitest";
import { FirestoreMusicCatalog, type FirestoreLike, type MusicDoc } from "./firestoreCatalog.js";
import { SampleMusicTrackSchema } from "./types.js";

const DOCS: Record<string, MusicDoc> = {
  "pulse-120": {
    title: "Pulse",
    storagePath: "sampleMusic/pulse-120.mp3",
    format: "mp3",
    durationSec: 30,
    bpm: 120,
    provider: "fixture",
    licenseRef: "lic-1",
  },
  "drift-90": {
    title: "Drift",
    storagePath: "sampleMusic/drift-90.mp3",
    format: "mp3",
    durationSec: 30,
    provider: "fixture",
    licenseRef: "lic-2",
  },
};

/** Fake Firestore over an in-memory doc map. */
function fakeDb(docs: Record<string, MusicDoc | undefined>): FirestoreLike {
  return {
    collection: () => ({
      get: async () => ({
        docs: Object.entries(docs)
          .filter(([, v]) => v)
          .map(([id, v]) => ({ id, exists: true, data: () => v })),
      }),
      doc: (id: string) => ({
        get: async () => ({ id, exists: !!docs[id], data: () => docs[id] }),
      }),
    }),
  };
}

const fakeSign = async (storagePath: string): Promise<string> =>
  `https://signed.example/${storagePath}?sig=abc`;

describe("FirestoreMusicCatalog", () => {
  it("lists schema-valid tracks with signed URLs", async () => {
    const cat = new FirestoreMusicCatalog(fakeDb(DOCS), fakeSign);
    const tracks = await cat.list();
    expect(tracks).toHaveLength(2);
    for (const t of tracks) {
      expect(() => SampleMusicTrackSchema.parse(t)).not.toThrow();
      expect(t.url).toMatch(/^https:\/\/signed\.example\/.*sig=abc$/);
    }
    expect(tracks.find((t) => t.trackId === "pulse-120")?.bpm).toBe(120);
  });

  it("fetches a track's signed url + bpm by id", async () => {
    const cat = new FirestoreMusicCatalog(fakeDb(DOCS), fakeSign);
    const { url, bpm } = await cat.fetch("pulse-120");
    expect(url).toBe("https://signed.example/sampleMusic/pulse-120.mp3?sig=abc");
    expect(bpm).toBe(120);
  });

  it("returns undefined bpm when the doc has none (tempo detector will fill it)", async () => {
    const cat = new FirestoreMusicCatalog(fakeDb(DOCS), fakeSign);
    const { bpm } = await cat.fetch("drift-90");
    expect(bpm).toBeUndefined();
  });

  it("throws on an unknown trackId", async () => {
    const cat = new FirestoreMusicCatalog(fakeDb(DOCS), fakeSign);
    await expect(cat.fetch("nope")).rejects.toThrow(/unknown trackId/);
  });

  it("rejects a malformed doc (schema guard at the boundary)", async () => {
    const bad = { "x": { title: "X", storagePath: "p", format: "ogg", durationSec: 1, provider: "p", licenseRef: "l" } as unknown as MusicDoc };
    const cat = new FirestoreMusicCatalog(fakeDb(bad), fakeSign);
    await expect(cat.fetch("x")).rejects.toThrow(); // 'ogg' not an allowed format
  });
});
