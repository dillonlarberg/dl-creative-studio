import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasLayer } from './useCanvasLayer';
import { MIN_ZONE_PX } from './canvasCoords';

const ZONES = {
  zoneA: { x: 10, y: 10, w: 100, h: 50 },
  zoneB: { x: 200, y: 200, w: 80, h: 40 },
};

function setup(allZoneBoundsDisplay = ZONES) {
  const onZoneSelect = vi.fn<[string | null], void>();
  const { result } = renderHook(() =>
    useCanvasLayer({ allZoneBoundsDisplay, onZoneSelect }),
  );
  return { result, onZoneSelect };
}

describe('useCanvasLayer — selectId', () => {
  it('non-additive replaces selection and calls onZoneSelect with the id', () => {
    const { result, onZoneSelect } = setup();
    act(() => result.current.selectId('zoneA', false));
    expect(result.current.selectedIds).toEqual(new Set(['zoneA']));
    expect(onZoneSelect).toHaveBeenLastCalledWith('zoneA');
  });

  it('additive extends selection and calls onZoneSelect(null) for multi-select', () => {
    const { result, onZoneSelect } = setup();
    act(() => result.current.selectId('zoneA', false));
    act(() => result.current.selectId('zoneB', true));
    expect(result.current.selectedIds).toEqual(new Set(['zoneA', 'zoneB']));
    expect(onZoneSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('useCanvasLayer — clearSelection', () => {
  it('empties selectedIds and calls onZoneSelect(null)', () => {
    const { result, onZoneSelect } = setup();
    act(() => result.current.selectId('zoneA', false));
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
    expect(onZoneSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('useCanvasLayer — enterPlacementMode', () => {
  it('activates placement mode', () => {
    const { result } = setup();
    act(() => result.current.enterPlacementMode('text'));
    expect(result.current.placementMode).toBe('text');
  });

  it('toggles off when the same mode is clicked twice', () => {
    const { result } = setup();
    act(() => result.current.enterPlacementMode('image'));
    act(() => result.current.enterPlacementMode('image'));
    expect(result.current.placementMode).toBeNull();
  });

  it('switches mode when a different mode is clicked', () => {
    const { result } = setup();
    act(() => result.current.enterPlacementMode('text'));
    act(() => result.current.enterPlacementMode('image'));
    expect(result.current.placementMode).toBe('image');
  });
});

describe('useCanvasLayer — finishPlacement', () => {
  beforeEach(() => vi.useFakeTimers());

  it('returns null and stays in placement mode when drawn area is below MIN_ZONE_PX', () => {
    const { result } = setup();
    act(() => result.current.enterPlacementMode('text'));
    act(() => result.current.startPlacement(0, 0));
    act(() => result.current.updatePlacement(MIN_ZONE_PX - 1, MIN_ZONE_PX - 1));
    let ret: ReturnType<typeof result.current.finishPlacement>;
    act(() => { ret = result.current.finishPlacement(); });
    expect(ret!).toBeNull();
    expect(result.current.placementMode).toBe('text');
  });

  it('returns the rect when drawn area meets MIN_ZONE_PX', () => {
    const { result } = setup();
    act(() => result.current.enterPlacementMode('text'));
    act(() => result.current.startPlacement(5, 5));
    act(() => result.current.updatePlacement(5 + MIN_ZONE_PX, 5 + MIN_ZONE_PX));
    let ret: ReturnType<typeof result.current.finishPlacement>;
    act(() => { ret = result.current.finishPlacement(); });
    expect(ret).not.toBeNull();
    expect(ret!.w).toBeGreaterThanOrEqual(MIN_ZONE_PX);
    expect(ret!.h).toBeGreaterThanOrEqual(MIN_ZONE_PX);
  });
});

describe('useCanvasLayer — finishLasso', () => {
  it('selects zones whose bounds overlap the lasso rect', () => {
    const { result, onZoneSelect } = setup();
    // Lasso covers zoneA (10,10,100,50) but not zoneB (200,200,80,40)
    act(() => result.current.startLasso(0, 0));
    act(() => result.current.updateLasso(50, 30));
    act(() => result.current.finishLasso());
    expect(result.current.selectedIds).toEqual(new Set(['zoneA']));
    expect(onZoneSelect).toHaveBeenLastCalledWith('zoneA');
  });

  it('clears selection and calls onZoneSelect(null) when lasso hits no zones', () => {
    const { result, onZoneSelect } = setup();
    act(() => result.current.selectId('zoneA', false));
    // Lasso in empty area (500, 500) to (600, 600)
    act(() => result.current.startLasso(500, 500));
    act(() => result.current.updateLasso(600, 600));
    act(() => result.current.finishLasso());
    expect(result.current.selectedIds.size).toBe(0);
    expect(onZoneSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('useCanvasLayer — deleteSelected', () => {
  it('calls onDelete only for custom zone IDs (not wireframe IDs)', () => {
    const { result } = setup();
    act(() => result.current.selectId('zoneA', false));
    act(() => result.current.selectId('custom-1', true));

    const onDelete = vi.fn<[string], void>();
    act(() =>
      result.current.deleteSelected(new Set(['custom-1']), onDelete),
    );
    expect(onDelete).toHaveBeenCalledWith('custom-1');
    expect(onDelete).not.toHaveBeenCalledWith('zoneA');
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('clears selection even when no custom zones are selected', () => {
    const { result } = setup();
    act(() => result.current.selectId('zoneA', false));
    const onDelete = vi.fn<[string], void>();
    act(() => result.current.deleteSelected(new Set(), onDelete));
    expect(onDelete).not.toHaveBeenCalled();
    expect(result.current.selectedIds.size).toBe(0);
  });
});
