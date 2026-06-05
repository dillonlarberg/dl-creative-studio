// Tracer-only run-id helper. NOTE: tools/resize-tracer/src/runId.ts keeps a separate prototype copy.
import { randomBytes } from "node:crypto";

export function makeRunId(fixtureBasename: string, targetLabel: string): string {
  const iso = new Date().toISOString().replace(/:/g, "-").replace(/Z$/, "");
  const random = randomBytes(2).toString("hex");
  const safeFixture = fixtureBasename.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeTarget = targetLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${iso}-${random}-${safeFixture}-${safeTarget}`;
}
