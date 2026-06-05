/**
 * Contract tests for LibrosaTempoDetector — the subprocess boundary (TempoRunner)
 * is MOCKED, so librosa/python are never invoked and the suite stays no-network,
 * no-toolchain. Pins external behavior: parse tempo.py's JSON, enforce a positive
 * BPM, and surface failures clearly.
 */
import { describe, it, expect } from "vitest";
import { LibrosaTempoDetector, type TempoRunner } from "./librosa.js";

const runnerReturning = (stdout: string): TempoRunner => ({ run: async () => stdout });
const runnerRejecting = (err: Error): TempoRunner => ({
  run: async () => {
    throw err;
  },
});

describe("LibrosaTempoDetector", () => {
  it("parses a positive BPM from tempo.py's JSON", async () => {
    const det = new LibrosaTempoDetector(runnerReturning('{"bpm": 122.5}'));
    expect(await det.detect("fake://music/x.mp3")).toEqual({ bpm: 122.5 });
  });

  it("tolerates surrounding whitespace/newlines", async () => {
    const det = new LibrosaTempoDetector(runnerReturning('  {"bpm": 90}\n'));
    expect(await det.detect("x.wav")).toEqual({ bpm: 90 });
  });

  it("rejects a non-positive BPM (schema guard)", async () => {
    const det = new LibrosaTempoDetector(runnerReturning('{"bpm": 0}'));
    await expect(det.detect("x.wav")).rejects.toThrow();
  });

  it("throws a clear error on non-JSON output", async () => {
    const det = new LibrosaTempoDetector(runnerReturning("Traceback: boom"));
    await expect(det.detect("x.wav")).rejects.toThrow(/non-JSON output/);
  });

  it("propagates a subprocess failure (non-zero exit / missing python)", async () => {
    const det = new LibrosaTempoDetector(runnerRejecting(new Error("tempo.py exited 1: no module librosa")));
    await expect(det.detect("x.wav")).rejects.toThrow(/tempo\.py exited 1/);
  });
});
