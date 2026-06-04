/** sign-url — print the getDownloadURL for a bucket object (debug). */
import "dotenv/config";
import { initializeApp, getApps } from "firebase-admin/app";
import { getStorage, getDownloadURL } from "firebase-admin/storage";

async function main(): Promise<void> {
  const obj = process.argv[2];
  if (!obj) {
    console.error("usage: tsx scripts/sign-url.ts <object-path>");
    process.exit(1);
  }
  const bucket = process.env.GCS_BUCKET ?? "automated-creative-e10d7.firebasestorage.app";
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT ?? "automated-creative-e10d7", storageBucket: bucket });
  }
  console.log(await getDownloadURL(getStorage().bucket().file(obj)));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
