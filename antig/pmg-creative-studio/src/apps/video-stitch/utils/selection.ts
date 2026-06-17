/**
 * selection — pure multi-select logic for the SourcePicker.
 *
 * Tap order IS the initial sequence (the user reorders later on Arrange). Selecting
 * past the cap is ignored (the 9th tap does nothing). Extracted from the component
 * so the rules are unit-tested without rendering.
 */
import { MAX_ASSETS, type PickedAsset } from '../types';

/** Toggle an asset in/out of the ordered selection; respects the MAX_ASSETS cap. */
export function toggleSelection(
  selected: PickedAsset[],
  asset: PickedAsset,
  max: number = MAX_ASSETS,
): PickedAsset[] {
  const i = selected.findIndex((a) => a.assetId === asset.assetId);
  if (i >= 0) return selected.filter((a) => a.assetId !== asset.assetId);
  if (selected.length >= max) return selected; // cap reached — ignore
  return [...selected, asset];
}

/** 1-based position of an asset in the selection, or null if unselected. */
export function orderOf(selected: PickedAsset[], assetId: string): number | null {
  const i = selected.findIndex((a) => a.assetId === assetId);
  return i >= 0 ? i + 1 : null;
}
