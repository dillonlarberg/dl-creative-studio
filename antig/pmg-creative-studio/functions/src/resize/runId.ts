// MAINTAINED IN PARALLEL with tools/resize-tracer/src/runId.ts — see TODO(resize-pipeline-extract).
import { randomBytes } from "node:crypto";

export function makeRunId(fixtureBasename: string, targetLabel: string): string {
  const iso = new Date().toISOString().replace(/:/g, "-").replace(/Z$/, "");
  const random = randomBytes(2).toString("hex");
  const safeFixture = fixtureBasename.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeTarget = targetLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${iso}-${random}-${safeFixture}-${safeTarget}`;
}
