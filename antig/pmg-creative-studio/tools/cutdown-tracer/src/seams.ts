/**
 * Interface seams — the four deep modules of the cutdown pipeline. Each has a
 * real implementation (added in build-order steps 3–5) and a Fake (`fakes.ts`)
 * so the offline suite runs no-network/no-env. An env-keyed factory (`factory.ts`)
 * picks which to wire (PRD #9–#11).
 *
 * The pipeline depends only on these interfaces, never on a concrete provider.
 */
import type { Segment, SampleMusicTrack, EditSpec, CutPlan } from "./types.js";

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

/**
 * Object host for assets the cloud renderer must fetch. Forced by the
 * architecture: Shotstack fetches the source video (and music) from a URL after
 * queueing, so they must live at a long-TTL signed (or public) URL — Firestore is
 * metadata only. Real: Cloud Storage for Firebase. Fake: canned `fake://` URLs.
 */
export interface BlobStore {
  /** Upload a local file and return a long-TTL signed read URL the renderer can fetch. */
  uploadAndSign(localPath: string, destName?: string): Promise<string>;
  /** Sign an object already in the bucket (e.g. a catalog track's storagePath). */
  sign(storagePath: string): Promise<string>;
}

/**
 * Cuts the source video into one small clip per planned cut, locally. The cloud
 * renderer's per-source limits won't accept a long full source, so we send it only
 * the selected moments. Also reports the true source duration so the orchestrator
 * can clamp model-supplied timestamps to it. Real: ffmpeg subprocess. Fake: returns
 * canned local paths.
 */
export interface ClipExtractor {
  /** True source duration in seconds (used to clamp out-of-bounds segments). */
  probeDurationSec(localVideoPath: string): Promise<number>;
  /** Extract each cut to a local clip file; returns one local path per cut, in order. */
  extractClips(localVideoPath: string, cuts: CutPlan, durationSec: number): Promise<string[]>;
}

/** The full set of seam implementations the orchestrator composes. */
export interface PipelineDeps {
  selector: VideoMomentSelector;
  tempo: TempoDetector;
  catalog: MusicCatalog;
  renderer: VideoRenderer;
  blobStore: BlobStore;
  clipExtractor: ClipExtractor;
}
