/**
 * Format a number of seconds as `m:ss` (e.g. 83 → "1:23", 5 → "0:05").
 * Fractional seconds are floored; negative input clamps to zero.
 */
export function fmtTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
