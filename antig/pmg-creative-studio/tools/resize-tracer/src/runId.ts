import { randomBytes } from "node:crypto";

// Format: ISO-with-ms (colons -> dashes) + 4-char random hex + fixture + target.
// Example: 2026-05-07T15-42-08.142-a3f1-creative-01-9x16
export function makeRunId(fixtureBasename: string, targetLabel: string): string {
  const iso = new Date().toISOString().replace(/:/g, "-").replace(/Z$/, "");
  const random = randomBytes(2).toString("hex");
  const safeFixture = fixtureBasename.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeTarget = targetLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${iso}-${random}-${safeFixture}-${safeTarget}`;
}
