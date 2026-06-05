/**
 * diag-assets — isolate which asset Shotstack rejects, cheaply. Reuses the GCS
 * objects already uploaded (no re-upload, no Gemini), and submits two tiny 5s
 * renders: (A) our source video alone, (B) a known-good public video + our music.
 * Whichever fails is the bad asset.
 *
 * Run:  npm run diag-assets [trackId] [sourceObject]
 *       npm run diag-assets otro_atardecer cutdown-sources/test_02.mp4
 */
import "dotenv/config";
import { initializeApp, getApps } from "firebase-admin/app";
import { getStorage, getDownloadURL } from "firebase-admin/storage";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "automated-creative-e10d7";
const BUCKET = process.env.GCS_BUCKET ?? "automated-creative-e10d7.firebasestorage.app";
const KEY = process.env.SHOTSTACK_API_KEY!;
const BASE = "https://api.shotstack.io/edit/stage";
const PUBLIC_VIDEO =
  "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/footage/beach-overhead.mp4";

async function renderOnce(label: string, tracks: unknown[]): Promise<void> {
  const payload = { timeline: { background: "#000000", tracks }, output: { format: "mp4", resolution: "sd" } };
  const sub = await fetch(`${BASE}/render`, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const subJson: any = await sub.json().catch(() => ({}));
  if (!subJson?.success) {
    console.log(`  ${label}: SUBMIT FAILED ${sub.status}: ${JSON.stringify(subJson).slice(0, 200)}`);
    return;
  }
  const id = subJson.response.id;
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const st: any = await (await fetch(`${BASE}/render/${id}`, { headers: { "x-api-key": KEY } })).json();
    const status = st?.response?.status;
    if (status === "failed") {
      const e = st.response.error;
      console.log(`  ${label}: ❌ FAILED — ${typeof e === "string" ? e : JSON.stringify(e)}`);
      return;
    }
    if (status === "done") {
      console.log(`  ${label}: ✅ OK — ${st.response.url}`);
      return;
    }
  }
}

async function main(): Promise<void> {
  const trackId = process.argv[2] ?? "otro_atardecer";
  const sourceObject = process.argv[3] ?? "cutdown-sources/test_02.mp4";
  if (getApps().length === 0) initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
  const bucket = getStorage().bucket();

  const videoUrl = await getDownloadURL(bucket.file(sourceObject));
  const audioUrl = await getDownloadURL(bucket.file(`sampleMusic/${trackId}.mp3`));
  console.log(`source video: ${sourceObject}`);
  console.log(`music: sampleMusic/${trackId}.mp3\n`);

  console.log("A) our source video alone:");
  await renderOnce("video", [{ clips: [{ asset: { type: "video", src: videoUrl, trim: 0 }, start: 0, length: 5 }] }]);

  console.log("B) public video + our music:");
  await renderOnce("audio", [
    { clips: [{ asset: { type: "video", src: PUBLIC_VIDEO, trim: 0 }, start: 0, length: 5 }] },
    { clips: [{ asset: { type: "audio", src: audioUrl, trim: 0 }, start: 0, length: 5 }] },
  ]);
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
