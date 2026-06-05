/**
 * shotstack-status — fetch the full status/error of a Shotstack render by id.
 * Use to inspect a failed render without re-running the whole pipeline.
 *
 * Run:  npm run shotstack-status <renderId>
 */
import "dotenv/config";

const BASES = ["https://api.shotstack.io/edit/stage", "https://api.shotstack.io/stage"];

async function main(): Promise<void> {
  const id = process.argv[2];
  const key = process.env.SHOTSTACK_API_KEY;
  if (!id) {
    console.error("✗ usage: npm run shotstack-status <renderId>");
    process.exit(1);
  }
  if (!key) {
    console.error("✗ SHOTSTACK_API_KEY not set");
    process.exit(1);
  }
  for (const base of BASES) {
    const res = await fetch(`${base}/render/${id}`, { headers: { "x-api-key": key } });
    if (res.status === 403 || res.status === 404) continue;
    const json = await res.json().catch(() => ({}));
    console.log(`base ${base} (${res.status}):`);
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  console.error("✗ render id not found on either host");
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
