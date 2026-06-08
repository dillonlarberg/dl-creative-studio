/**
 * FirestoreMusicCatalog — the real `MusicCatalog` (build-order step 5).
 *
 * Reads `sampleMusic/{trackId}` docs from Firestore (metadata only) and turns each
 * `storagePath` into a long-TTL signed URL the cloud renderer can fetch, via an
 * injected `sign` function (the BlobStore's signer). Firestore is metadata; Cloud
 * Storage is the object host — the split is forced by the renderer fetching assets
 * after queueing.
 *
 * Both the Firestore client and the signer are injected, so tests run no-network.
 */
import { z } from "zod";
import type { MusicCatalog } from "./seams.js";
import { SampleMusicTrackSchema, type SampleMusicTrack } from "./types.js";
import { MoodSchema, GenreSchema, VocalsSchema, UseCaseTagSchema, EnergySchema } from "./musicTags.js";

/**
 * The shape stored in each `sampleMusic/{trackId}` doc. Note: `storagePath` (a
 * bucket-relative object path), NOT a `url` — the URL is signed on read so it can't
 * go stale. `trackId` is the document id, not a field.
 */
export const MusicDocSchema = z.object({
  title: z.string().min(1),
  storagePath: z.string().min(1),
  format: z.enum(["mp3", "wav", "m4a", "aac"]),
  durationSec: z.number().positive(),
  bpm: z.number().positive().optional(),
  firstBeatSec: z.number().nonnegative().optional(),
  mood: MoodSchema.optional(),
  genre: GenreSchema.optional(),
  energy: EnergySchema.optional(),
  vocals: VocalsSchema.optional(),
  tags: z.array(UseCaseTagSchema).optional(),
  provider: z.string().min(1),
  licenseRef: z.string().min(1),
});
export type MusicDoc = z.infer<typeof MusicDocSchema>;

/** Minimal Firestore surface this catalog touches — lets tests inject a fake. */
export interface FirestoreLike {
  collection(path: string): CollectionLike;
}
export interface CollectionLike {
  get(): Promise<{ docs: DocSnapshotLike[] }>;
  doc(id: string): DocRefLike;
}
export interface DocRefLike {
  get(): Promise<DocSnapshotLike>;
}
export interface DocSnapshotLike {
  id: string;
  exists: boolean;
  data(): unknown;
}

/** Signs a bucket-relative object path into a fetchable URL. */
export type SignFn = (storagePath: string) => Promise<string>;

export class FirestoreMusicCatalog implements MusicCatalog {
  constructor(
    private readonly db: FirestoreLike,
    private readonly sign: SignFn,
    private readonly collectionPath = "sampleMusic",
  ) {}

  async list(): Promise<SampleMusicTrack[]> {
    const snap = await this.db.collection(this.collectionPath).get();
    return Promise.all(snap.docs.map((d) => this.toTrack(d.id, d.data())));
  }

  async fetch(trackId: string): Promise<{ url: string; bpm?: number }> {
    const doc = await this.db.collection(this.collectionPath).doc(trackId).get();
    if (!doc.exists) throw new Error(`FirestoreMusicCatalog: unknown trackId "${trackId}"`);
    const meta = MusicDocSchema.parse(doc.data());
    return { url: await this.sign(meta.storagePath), bpm: meta.bpm };
  }

  /** Validate a doc, sign its storagePath, and assemble a runtime SampleMusicTrack. */
  private async toTrack(id: string, raw: unknown): Promise<SampleMusicTrack> {
    const meta = MusicDocSchema.parse(raw);
    const url = await this.sign(meta.storagePath);
    return SampleMusicTrackSchema.parse({
      trackId: id,
      title: meta.title,
      url,
      format: meta.format,
      durationSec: meta.durationSec,
      bpm: meta.bpm,
      firstBeatSec: meta.firstBeatSec,
      mood: meta.mood,
      genre: meta.genre,
      energy: meta.energy,
      vocals: meta.vocals,
      tags: meta.tags,
      provider: meta.provider,
      licenseRef: meta.licenseRef,
    });
  }
}
