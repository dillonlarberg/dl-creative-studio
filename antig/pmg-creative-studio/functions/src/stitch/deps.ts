import { getFirestore } from "firebase-admin/firestore";
import { getStorage, getDownloadURL } from "firebase-admin/storage";
import { promises as fs } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { makeFfmpegReelRenderer } from "../cutdown/engine/ffmpegReel";
import { runFfmpeg } from "../cutdown/engine/ffmpeg";
import { FirestoreMusicCatalog, type FirestoreLike } from "../cutdown/engine/firestoreCatalog";
import { buildScaleNormalizeArgs } from "./engine/ffmpegImage";

// ffmpeg-static ships the binary path; the engine reads FFMPEG_BIN.
if (ffmpegStatic) process.env.FFMPEG_BIN = ffmpegStatic;

/**
 * Download a URL to a local file. Spine guard: http/https only (the picker passes
 * datasource creative URLs / a signed music URL).
 * TODO(stitch-ssrf): reuse the resize pipeline's stricter SSRF guard before
 * accepting arbitrary user-supplied URLs at scale.
 */
export async function downloadToFile(url: string, destPath: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`refusing non-http(s) url: ${url.slice(0, 24)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url.slice(0, 80)}`);
  await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

export function makeStitchDeps() {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const sign = (objectPath: string) => getDownloadURL(bucket.file(objectPath));
  const catalog = new FirestoreMusicCatalog(db as unknown as FirestoreLike, sign);
  const ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg";

  const normalize = async (opts: {
    srcPath: string;
    isStill: boolean;
    durationSec: number;
    outPath: string;
  }): Promise<void> => {
    await runFfmpeg(ffmpegBin, buildScaleNormalizeArgs(opts));
  };

  return { db, bucket, sign, catalog, renderer: makeFfmpegReelRenderer(), normalize };
}
