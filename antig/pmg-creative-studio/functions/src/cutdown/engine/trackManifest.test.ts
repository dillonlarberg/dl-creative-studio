import { describe, it, expect } from "vitest";
import { TrackManifestSchema, manifestEntryToDocFields } from "./trackManifest";
describe("track manifest", () => {
  it("validates a curated entry", () => {
    const parsed = TrackManifestSchema.parse([{ trackId: "trk_pulse", title: "Pulse Theory", storagePath: "sampleMusic/trk_pulse.mp3", format: "mp3", mood: "energetic", genre: "electronic", energy: 5, vocals: "instrumental", tags: ["tech"], provider: "pixabay", licenseRef: "cc0" }]);
    expect(parsed[0].trackId).toBe("trk_pulse");
  });
  it("rejects an out-of-vocab mood", () => {
    expect(() => TrackManifestSchema.parse([{ trackId: "x", title: "X", storagePath: "sampleMusic/x.mp3", format: "mp3", mood: "spicy", genre: "pop", energy: 3, vocals: "vocal", tags: [], provider: "p", licenseRef: "l" }])).toThrow();
  });
  it("maps an entry to doc fields, omitting trackId", () => {
    const fields = manifestEntryToDocFields({ trackId: "trk_pulse", title: "Pulse Theory", storagePath: "sampleMusic/trk_pulse.mp3", format: "mp3", mood: "energetic", genre: "electronic", energy: 5, vocals: "instrumental", tags: ["tech"], provider: "pixabay", licenseRef: "cc0" }, { bpm: 124, durationSec: 142 });
    expect(fields).not.toHaveProperty("trackId");
    expect(fields.bpm).toBe(124);
    expect(fields.mood).toBe("energetic");
  });
});
