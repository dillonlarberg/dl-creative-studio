// Single location for all display ↔ adSize (native) coordinate conversions.
// No other file may perform scale math — always import from here.
//
// Coordinate model:
//   - adSize coords: the coordinate system of the wireframe HTML (e.g. 1080px)
//   - display coords: the CSS pixel size of the Konva Stage (e.g. 306px)
//   - scale = displaySize / adSize
//
// Storage rule: zoneOverrides and customZones are always stored in adSize coords
// so the data is resolution-independent. Convert to display coords only for rendering.

/** Minimum zone dimension in display pixels. Zones smaller than this are discarded. */
export const MIN_ZONE_PX = 16;

/**
 * Convert a single coordinate from adSize (native) space to display (Konva) space.
 * Returns 0 if either size is 0 (no NaN/Infinity propagation).
 */
export function toDisplay(
  nativeCoord: number,
  adSize: number,
  displaySize: number,
): number {
  if (adSize === 0 || displaySize === 0) return 0;
  return nativeCoord * (displaySize / adSize);
}

/**
 * Convert a single coordinate from display (Konva) space back to adSize (native) space.
 * Returns 0 if either size is 0.
 */
export function toNative(
  displayCoord: number,
  adSize: number,
  displaySize: number,
): number {
  if (adSize === 0 || displaySize === 0) return 0;
  return displayCoord / (displaySize / adSize);
}

/**
 * Clamp a native (adSize) coordinate to [0, adSize].
 * Negative values become 0; values > adSize become adSize.
 */
export function clampNative(val: number, adSize: number): number {
  return Math.max(0, Math.min(val, adSize));
}
