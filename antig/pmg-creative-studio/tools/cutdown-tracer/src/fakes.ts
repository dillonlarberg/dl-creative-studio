/**
 * Fakes — one per seam, so `npm test` runs with no network and no credentials
 * (PRD #10). These are deliberately dumb-but-valid: they return well-formed,
 * schema-conformant data through the same interface the real impls satisfy.
 */
import type {
  VideoMomentSelector,
  VideoRef,
  TempoDetector,
  MusicCatalog,
  VideoRenderer,
  BlobStore,
} from "./seams.js";
import type { Segment, SampleMusicTrack, EditSpec } from "./types.js";

/**
 * Returns evenly-spaced segments across an assumed source duration, scored
 * descending (first = best). Stands in for Gemini's ranked-moments output.
 */
export class FakeEvenSpacedSelector implements VideoMomentSelector {
  constructor(
    private readonly sourceDurationSec = 70,
    private readonly count = 8,
    private readonly segLenSec = 2,
  ) {}

  async select(_video: VideoRef, _opts: { budgetSec: number }): Promise<Segment[]> {
    const span = this.sourceDurationSec - this.segLenSec;
    const step = this.count > 1 ? span / (this.count - 1) : 0;
    return Array.from({ length: this.count }, (_, i) => {
      const startSec = Number((i * step).toFixed(3));
      return {
        startSec,
        endSec: Number((startSec + this.segLenSec).toFixed(3)),
        // Descending score so the grid fills with "best" moments first.
        score: Number((1 - i / this.count).toFixed(3)),
      };
    });
  }
}

/** Returns a fixed BPM. Stands in for the librosa subprocess. */
export class FakeFixedBpm implements TempoDetector {
  constructor(private readonly bpm = 120) {}
  async detect(_audioUrl: string): Promise<{ bpm: number }> {
    return { bpm: this.bpm };
  }
}

const DEFAULT_TRACKS: SampleMusicTrack[] = [
  {
    trackId: "pulse-120",
    title: "Pulse",
    url: "fake://music/pulse-120.mp3",
    format: "mp3",
    durationSec: 30,
    bpm: 120,
    firstBeatSec: 0,
    mood: "energetic",
    genre: "electronic",
    provider: "fake",
    licenseRef: "fake-license-0001",
  },
  {
    trackId: "drift-90",
    title: "Drift",
    url: "fake://music/drift-90.mp3",
    format: "mp3",
    durationSec: 30,
    bpm: 90,
    mood: "chill",
    genre: "lofi",
    provider: "fake",
    licenseRef: "fake-license-0002",
  },
];

/** In-memory catalog. Stands in for the Firestore `sampleMusic` collection. */
export class FakeMusicCatalog implements MusicCatalog {
  constructor(private readonly tracks: SampleMusicTrack[] = DEFAULT_TRACKS) {}

  async list(): Promise<SampleMusicTrack[]> {
    return [...this.tracks];
  }

  async fetch(trackId: string): Promise<{ url: string; bpm?: number }> {
    const track = this.tracks.find((t) => t.trackId === trackId);
    if (!track) throw new Error(`FakeMusicCatalog: unknown trackId "${trackId}"`);
    return { url: track.url, bpm: track.bpm };
  }
}

/**
 * Echoes the spec back as a canned URL — no real Shotstack call. The URL encodes
 * the cut count so the e2e test can assert the plan flowed through unchanged.
 */
export class FakeEchoRenderer implements VideoRenderer {
  async render(spec: EditSpec): Promise<{ mp4Url: string }> {
    return { mp4Url: `fake://render/${spec.cuts.length}-cuts.mp4` };
  }
}

/** Returns canned `fake://` URLs instead of touching Cloud Storage. No network. */
export class FakeBlobStore implements BlobStore {
  async uploadAndSign(localPath: string, destName?: string): Promise<string> {
    const name = destName ?? localPath.split("/").pop() ?? "source";
    return `fake://blob/${name}?sig=fake`;
  }
  async sign(storagePath: string): Promise<string> {
    return `fake://blob/${storagePath}?sig=fake`;
  }
}
