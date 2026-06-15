import { z } from "zod";
import { MoodSchema, GenreSchema, VocalsSchema, UseCaseTagSchema, EnergySchema } from "./musicTags.js";
import type { MusicDoc } from "./firestoreCatalog.js";
export const TrackManifestEntrySchema = z.object({
  trackId: z.string().min(1), title: z.string().min(1), storagePath: z.string().min(1),
  format: z.enum(["mp3","wav","m4a","aac"]), mood: MoodSchema, genre: GenreSchema, energy: EnergySchema,
  vocals: VocalsSchema, tags: z.array(UseCaseTagSchema), provider: z.string().min(1), licenseRef: z.string().min(1),
  bpm: z.number().positive().optional(), durationSec: z.number().positive().optional(),
});
export type TrackManifestEntry = z.infer<typeof TrackManifestEntrySchema>;
export const TrackManifestSchema = z.array(TrackManifestEntrySchema).min(1);
export function manifestEntryToDocFields(e: TrackManifestEntry, probed: { bpm: number; durationSec: number }): MusicDoc {
  return { title: e.title, storagePath: e.storagePath, format: e.format, durationSec: e.durationSec ?? probed.durationSec,
    bpm: e.bpm ?? probed.bpm, mood: e.mood, genre: e.genre, energy: e.energy, vocals: e.vocals, tags: e.tags, provider: e.provider, licenseRef: e.licenseRef };
}
