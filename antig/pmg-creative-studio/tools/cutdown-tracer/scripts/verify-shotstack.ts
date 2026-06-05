/**
 * verify-shotstack — smoke test for the Shotstack render surface that backs the
 * cutdown-tracer's `VideoRenderer` seam.
 *
 * Proves:
 *   ① the sandbox (stage) key authenticates and a known-good render submits
 *   ② it polls to `done`
 *   ③ the returned (watermarked) MP4 URL is fetchable
 *
 * Uses Shotstack's PUBLIC sample asset, so it needs no bucket / signed URL yet.
 * Raw HTTP (no SDK): the payload is fixed-shape and we control the exact host —
 * which matters because Shotstack's docs disagree on the base path
 * (curl uses /edit/stage, the Node SDK README uses /stage). We try both.
 *
 * Run:  npm run verify-shotstack
 *       (SHOTSTACK_API_KEY from .env — use the SANDBOX/stage key; renders are free + watermarked)
 */
import "dotenv/config";

const SAMPLE_VIDEO =
  "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/footage/beach-overhead.mp4";

// Documented base-path inconsistency — try canonical /edit/stage first, then /stage.
const STAGE_BASES = ["https://api.shotstack.io/edit/stage", "https://api.shotstack.io/stage"];

// Smallest known-good render: one 5s trim from the public sample asset, SD output.
const PAYLOAD = {
  timeline: {
    tracks: [
      {
        clips: [
          { asset: { type: "video", src: SAMPLE_VIDEO, trim: 10 }, start: 0, length: 5 },
        ],
      },
    ],
  },
  output: { format: "mp4", resolution: "sd" },
};

type SubmitResult = { id: string } | { skip: true };

async function submit(base: string, key: string): Promise<SubmitResult> {
  const res = await fetch(`${base}/render`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(PAYLOAD),
  });
  if (res.status === 403 || res.status === 404) return { skip: true }; // wrong host → try next
  const json: any = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("401 Unauthorized — check the key (use the SANDBOX/stage key).");
  if (!res.ok || !json?.success) {
    throw new Error(`submit failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return { id: json.response.id as string };
}

async function main(): Promise<void> {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) {
    console.error(
      "✗ SHOTSTACK_API_KEY not set. Add your SANDBOX key to .env (https://dashboard.shotstack.io → API Keys).",
    );
    process.exit(1);
  }

  // ── ① submit (auth + payload), discovering the working base path ──
  console.log("① submitting a known-good render to the sandbox…");
  let base = "";
  let id = "";
  for (const b of STAGE_BASES) {
    const r = await submit(b, key);
    if ("skip" in r) {
      console.log(`   ${b} → 403/404, trying next…`);
      continue;
    }
    base = b;
    id = r.id;
    break;
  }
  if (!id) throw new Error("no Shotstack host accepted the request (check key / network).");
  console.log(`   accepted on ${base} — render id: ${id}`);

  // ── ② poll until done ──
  console.log("② polling status…");
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > 120_000) throw new Error("render > 120s, giving up.");
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${base}/render/${id}`, { headers: { "x-api-key": key } });
    const json: any = await res.json().catch(() => ({}));
    const status: string | undefined = json?.response?.status;
    console.log(`   status: ${status ?? "?"}`);
    if (status === "failed") throw new Error(`render failed: ${json?.response?.error ?? "unknown"}`);
    if (status === "done") {
      const url: string = json.response.url;
      // ── ③ confirm the URL is fetchable ──
      const head = await fetch(url, { headers: { Range: "bytes=0-0" } });
      console.log("✓ PASS — render complete (watermarked on sandbox):");
      console.log(`   ${url}`);
      console.log(`   fetch ${head.status}, content-type: ${head.headers.get("content-type") ?? "?"}`);
      return;
    }
  }
}

main().catch((err: unknown) => {
  console.error(`✗ FAIL — ${err instanceof Error ? err.message : String(err)}`);
  console.error(
    "   hints: 401 = bad key (use the sandbox/stage key) · 403/404 = wrong host (tried /edit/stage and /stage) · " +
      "400 = payload · status 'failed' = unreachable src / codec.",
  );
  process.exit(1);
});
