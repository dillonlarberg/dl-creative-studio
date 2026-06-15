import { getFirestore } from "firebase-admin/firestore";
import { getStorage, getDownloadURL } from "firebase-admin/storage";
import ffmpegStatic from "ffmpeg-static";
import { makeCutdownBrain } from "./engine/cutdownBrain";
import { makeFfmpegReelRenderer } from "./engine/ffmpegReel";
import { makeFfmpegClipExtractor } from "./engine/ffmpeg";
import { makeFfmpegStoryboard } from "./engine/storyboard";
import { FirestoreMusicCatalog, type FirestoreLike } from "./engine/firestoreCatalog";

// ffmpeg-static ships the binary path; the engine reads FFMPEG_BIN.
if (ffmpegStatic) process.env.FFMPEG_BIN = ffmpegStatic;

export function makeCutdownDeps(geminiKey: string) {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const sign = (objectPath: string) => getDownloadURL(bucket.file(objectPath));
  const catalog = new FirestoreMusicCatalog(db as unknown as FirestoreLike, sign);
  return {
    catalog,
    brain: makeCutdownBrain(geminiKey),
    renderer: makeFfmpegReelRenderer(),
    clipExtractor: makeFfmpegClipExtractor(),
    storyboard: makeFfmpegStoryboard(),
    sign,
    bucket,
  };
}
