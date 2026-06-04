/**
 * Interface seams — the four deep modules of the cutdown pipeline. Each has a
 * real implementation (added in build-order steps 3–5) and a Fake (`fakes.ts`)
 * so the offline suite runs no-network/no-env. An env-keyed factory (`factory.ts`)
 * picks which to wire (PRD #9–#11).
 *
 * The pipeline depends only on these interfaces, never on a concrete provider.
 */
import type { Segment, SampleMusicTrack, EditSpec } from "./types.js";

/** A reference to the source video. v0 passes a local path; the real Gemini impl uploads it via the Files API. */
export interface VideoRef {
  path: string;
}

/**
 * Picks the most engaging moments of a video and returns them ranked by score.
 * Real: Gemini video understanding. Fake: even-spaced segments.
 */
export interface VideoMomentSelector {
  select(video: VideoRef, opts: { budgetSec: number }): Promise<Segment[]>;
}

/**
 * Detects a track's tempo. Real: a local `python3` + `librosa` subprocess.
 * Fake: a fixed BPM. (The subprocess boundary is mocked in tests, never invoked.)
 */
export interface TempoDetector {
  detect(audioUrl: string): Promise<{ bpm: number }>;
}

/**
 * The music catalog. Real (v0): a `sampleMusic/{trackId}` Firestore collection
 * with files in Cloud Storage. Fake: in-memory fixtures.
 */
export interface MusicCatalog {
  list(): Promise<SampleMusicTrack[]>;
  fetch(trackId: string): Promise<{ url: string; bpm?: number }>;
}

/**
 * Renders an `EditSpec` to an MP4. Real: Shotstack (async submit → poll).
 * Fake: echoes a canned URL so the offline suite stays no-network.
 */
export interface VideoRenderer {
  render(spec: EditSpec): Promise<{ mp4Url: string }>;
}

/** The full set of seam implementations the orchestrator composes. */
export interface PipelineDeps {
  selector: VideoMomentSelector;
  tempo: TempoDetector;
  catalog: MusicCatalog;
  renderer: VideoRenderer;
}
