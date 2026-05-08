import { promises as fs } from "node:fs";
import path from "node:path";
import { CritiqueSchema, type Critique } from "./schema.js";

export const CRITIQUES_PATH = path.resolve(
  process.cwd(),
  "critiques.jsonl",
);

// Append a critique entry as a single JSONL line. Propagates fs errors
// (caller must surface to UI as 500). Validates with zod first.
export async function appendCritique(entry: Critique): Promise<void> {
  const validated = CritiqueSchema.parse(entry);
  const line = JSON.stringify(validated) + "\n";
  await fs.appendFile(CRITIQUES_PATH, line, "utf8");
}

export async function readCritiques(): Promise<Critique[]> {
  let raw: string;
  try {
    raw = await fs.readFile(CRITIQUES_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const out: Critique[] = [];
  for (const line of lines) {
    try {
      const obj: unknown = JSON.parse(line);
      out.push(CritiqueSchema.parse(obj));
    } catch {
      // Skip malformed lines silently — log file may be hand-edited.
    }
  }
  return out;
}
