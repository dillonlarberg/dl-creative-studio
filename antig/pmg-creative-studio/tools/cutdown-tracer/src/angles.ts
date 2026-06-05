/**
 * The three fixed creative angles for V1. Each angle provides (a) prompt guidance
 * that biases which beats get selected, and (b) a deterministic playback ordering
 * applied after selection. The grid still owns timing; the angle owns order + bias.
 */
import type { Angle, Segment } from "./types.js";

export const ANGLES = ["narrative", "highlights", "punchy"] as const satisfies readonly Angle[];

/** Human/AI-facing guidance injected into the selection prompt for each angle. */
export function angleGuidance(angle: Angle): string {
  switch (angle) {
    case "narrative":
      return "Choose beats that form a story arc: setup, a turn, and a payoff. Favor continuity and a sense of progression over raw intensity.";
    case "highlights":
      return "Choose the highest-impact, most engaging beats — the moments a viewer would clip and share. Intensity over continuity.";
    case "punchy":
      return "Choose hook-dense beats for a fast, attention-grabbing cut. Lead with the single strongest moment; keep momentum high throughout.";
  }
}

/** A short label used as the default description prefix and for logs. */
export function angleLabel(angle: Angle): string {
  return { narrative: "Narrative", highlights: "Highlights", punchy: "Punchy" }[angle];
}

/** Deterministic playback ordering per angle. Pure; returns a new array. */
export function orderSegments(angle: Angle, segs: Segment[]): Segment[] {
  const copy = [...segs];
  switch (angle) {
    case "narrative":
      return copy.sort((a, b) => a.startSec - b.startSec);
    case "highlights":
    case "punchy":
      // Same ordering by design: punchy diverges from highlights in selection
      // guidance, not playback order. Strongest first is satisfied by score-desc.
      return copy.sort((a, b) => b.score - a.score);
  }
}
