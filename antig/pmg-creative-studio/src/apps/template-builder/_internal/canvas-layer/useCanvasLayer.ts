import { useState, useCallback, useRef, useEffect } from 'react';
import type { ZoneBound } from '../../types';
import { MIN_ZONE_PX } from './canvasCoords';

export interface LassoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UseCanvasLayerOptions {
  /** All zone IDs currently on canvas (wireframe + custom), used for lasso hit-testing. */
  allZoneBoundsDisplay: Record<string, ZoneBound>;
  onZoneSelect: (id: string | null) => void;
}

export interface UseCanvasLayerReturn {
  selectedIds: Set<string>;
  lassoRect: LassoRect | null;
  placementMode: 'image' | 'text' | null;
  placementRect: LassoRect | null;
  /** Display-space ref for the current displaySize — updated synchronously by ResizeObserver. */
  pendingDisplaySizeRef: React.MutableRefObject<number>;
  enterPlacementMode: (mode: 'image' | 'text') => void;
  cancelPlacementMode: () => void;
  startLasso: (x: number, y: number) => void;
  updateLasso: (x: number, y: number) => void;
  finishLasso: () => void;
  startPlacement: (x: number, y: number) => void;
  updatePlacement: (x: number, y: number) => void;
  finishPlacement: () => LassoRect | null;
  selectId: (id: string, additive: boolean) => void;
  clearSelection: () => void;
  deleteSelected: (customZoneIds: Set<string>, onDelete: (id: string) => void) => void;
}

export function useCanvasLayer({
  allZoneBoundsDisplay,
  onZoneSelect,
}: UseCanvasLayerOptions): UseCanvasLayerReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);
  const [placementMode, setPlacementMode] = useState<'image' | 'text' | null>(null);
  const [placementRect, setPlacementRect] = useState<LassoRect | null>(null);

  // Lasso origin in display coords
  const lassoOriginRef = useRef<{ x: number; y: number } | null>(null);
  // Placement draw origin in display coords
  const placementOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Updated synchronously in ResizeObserver to avoid stale-displaySize race
  const pendingDisplaySizeRef = useRef<number>(0);

  // ── Selection sync: call onZoneSelect only when single selection ──────────
  const syncSelection = useCallback(
    (next: Set<string>) => {
      if (next.size === 1) {
        onZoneSelect([...next][0]);
      } else {
        onZoneSelect(null);
      }
    },
    [onZoneSelect],
  );

  const selectId = useCallback(
    (id: string, additive: boolean) => {
      setSelectedIds((prev) => {
        const next = additive ? new Set([...prev, id]) : new Set([id]);
        syncSelection(next);
        return next;
      });
    },
    [syncSelection],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    onZoneSelect(null);
  }, [onZoneSelect]);

  // ── Lasso ─────────────────────────────────────────────────────────────────
  const startLasso = useCallback((x: number, y: number) => {
    lassoOriginRef.current = { x, y };
    setLassoRect({ x, y, w: 0, h: 0 });
  }, []);

  const updateLasso = useCallback((x: number, y: number) => {
    const origin = lassoOriginRef.current;
    if (!origin) return;
    setLassoRect({
      x: Math.min(origin.x, x),
      y: Math.min(origin.y, y),
      w: Math.abs(x - origin.x),
      h: Math.abs(y - origin.y),
    });
  }, []);

  const finishLasso = useCallback(() => {
    setLassoRect((rect) => {
      if (!rect) return null;
      // Lasso: any-overlap model (single pixel). Zero matches clears selectedIds.
      const hit = new Set<string>();
      for (const [id, bound] of Object.entries(allZoneBoundsDisplay)) {
        const overlaps =
          rect.x < bound.x + bound.w &&
          rect.x + rect.w > bound.x &&
          rect.y < bound.y + bound.h &&
          rect.y + rect.h > bound.y;
        if (overlaps) hit.add(id);
      }
      setSelectedIds(hit);
      syncSelection(hit);
      lassoOriginRef.current = null;
      return null;
    });
  }, [allZoneBoundsDisplay, syncSelection]);

  // ── Placement mode ────────────────────────────────────────────────────────
  const enterPlacementMode = useCallback((mode: 'image' | 'text') => {
    setPlacementMode((prev) => (prev === mode ? null : mode));
    setPlacementRect(null);
  }, []);

  const cancelPlacementMode = useCallback(() => {
    setPlacementMode(null);
    setPlacementRect(null);
    placementOriginRef.current = null;
  }, []);

  const startPlacement = useCallback((x: number, y: number) => {
    placementOriginRef.current = { x, y };
    setPlacementRect({ x, y, w: 0, h: 0 });
  }, []);

  const updatePlacement = useCallback((x: number, y: number) => {
    const origin = placementOriginRef.current;
    if (!origin) return;
    setPlacementRect({
      x: Math.min(origin.x, x),
      y: Math.min(origin.y, y),
      w: Math.abs(x - origin.x),
      h: Math.abs(y - origin.y),
    });
  }, []);

  /**
   * Finalise the placement rect. Returns the rect if large enough, or null if
   * the drawn area is below MIN_ZONE_PX — in that case placement mode is kept
   * active so the user can try again.
   */
  const finishPlacement = useCallback((): LassoRect | null => {
    const rect = placementRect;
    if (!rect || Math.min(rect.w, rect.h) < MIN_ZONE_PX) {
      // Zone too small — discard rect, stay in placement mode
      setPlacementRect(null);
      placementOriginRef.current = null;
      return null;
    }
    setPlacementRect(null);
    placementOriginRef.current = null;
    return rect;
  }, [placementRect]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (placementMode) {
          cancelPlacementMode();
        } else {
          clearSelection();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [placementMode, cancelPlacementMode, clearSelection]);

  // ── Delete / Backspace ─────────────────────────────────────────────────────
  const deleteSelected = useCallback(
    (customZoneIds: Set<string>, onDelete: (id: string) => void) => {
      for (const id of selectedIds) {
        if (customZoneIds.has(id)) {
          onDelete(id);
        }
        // Wireframe zones: no-op (cannot be deleted)
      }
      clearSelection();
    },
    [selectedIds, clearSelection],
  );

  return {
    selectedIds,
    lassoRect,
    placementMode,
    placementRect,
    pendingDisplaySizeRef,
    enterPlacementMode,
    cancelPlacementMode,
    startLasso,
    updateLasso,
    finishLasso,
    startPlacement,
    updatePlacement,
    finishPlacement,
    selectId,
    clearSelection,
    deleteSelected,
  };
}
