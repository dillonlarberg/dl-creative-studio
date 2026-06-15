/**
 * Contract tests for FirestoreMusicCatalog — the Firestore client and the URL
 * signer are INJECTED (fakes), so no network/credentials are needed.
 */
import { describe, it, expect } from "vitest";
import { FirestoreMusicCatalog, type FirestoreLike, type MusicDoc } from "./firestoreCatalog.js";
import { SampleMusicTrackSchema } from "./types.js";

function fakeDbFromArray(docs: Array<{ id: string; data: unknown }>): FirestoreLike {
  return { collection: () => ({
    get: async () => ({ docs: docs.map((d) => ({ id: d.id, exists: true, data: () => d.data })) }),
    doc: (id: string) => ({ get: async () => { const m = docs.find((d) => d.id === id); return { id, exists: !!m, data: () => m?.data }; } }),
  }) };
}

describe("FirestoreMusicCatalog tagging", () => {
  it("carries tags through to the runtime track", async () => {
    const db = fakeDbFromArray([{ id: "trk_pulse", data: { title: "Pulse", storagePath: "sampleMusic/p.mp3", format: "mp3", durationSec: 142, bpm: 124, provider: "pixabay", licenseRef: "cc0", mood: "energetic", genre: "electronic", energy: 5, vocals: "instrumental", tags: ["tech","product"] } }]);
    const [t] = await new FirestoreMusicCatalog(db, async (p) => `signed://${p}`).list();
    expect(t.mood).toBe("energetic"); expect(t.energy).toBe(5); expect(t.tags).toEqual(["tech","product"]); expect(t.url).toBe("signed://sampleMusic/p.mp3");
  });
  it("accepts a legacy doc with no tags", async () => {
    const db = fakeDbFromArray([{ id: "legacy", data: { title: "Old", storagePath: "sampleMusic/o.mp3", format: "mp3", durationSec: 100, bpm: 100, provider: "manual", licenseRef: "internal-demo" } }]);
    const [t] = await new FirestoreMusicCatalog(db, async (p) => `signed://${p}`).list();
    expect(t.trackId).toBe("legacy"); expect(t.mood).toBeUndefined();
  });
});

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
