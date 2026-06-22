import { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect as KonvaRect } from 'react-konva';
import type Konva from 'konva';
import type { ZoneBound, CustomZone } from '../types';
import { toDisplay, toNative, clampNative } from './canvas-layer/canvasCoords';
import { ZoneRect } from './canvas-layer/ZoneRect';
import { NewZoneToolbar } from './canvas-layer/NewZoneToolbar';
import { ZoneContentBadge } from './ZoneContentBadge';
import { ZoneInspector } from './ZoneInspector';
import { useCanvasLayer } from './canvas-layer/useCanvasLayer';

export interface CanvasLayerProps {
  // geometry (zone-reporter reports in adSize coords)
  zoneBounds: Record<string, ZoneBound>;
  adSize: number;
  displaySize: number;

  // overrides from stepData (adSize coords)
  zoneOverrides: Record<string, ZoneBound>;
  customZones: CustomZone[];

  // selection
  selectedZoneId: string | null;
  onZoneSelect: (id: string | null) => void;

  // mutations — all bounds in adSize (native) coords
  onZoneMove: (id: string, bounds: ZoneBound) => void;
  onZoneResize: (id: string, bounds: ZoneBound) => void;
  onZoneCreate: (zone: Omit<CustomZone, 'id'>) => void;
  onZoneReset: (id: string) => void;
  onZoneDelete: (id: string) => void;
  onZoneAsset: (zoneId: string, assetUrl: string, isWireframe: boolean) => void;

  // when a slot field is being click-mapped, the Stage must not capture pointer events
  activeSlotField: string | null;

  // inline zone inspector (feed column / static text / delete)
  feedColumns: string[];
  feedSampleRow?: Record<string, unknown>;
  onZoneContentUpdate: (id: string, patch: { fieldId?: string; textContent?: string }) => void;

  // fired when the container resizes (caller clears zoneBounds to re-request from iframe)
  onResizeDetected?: () => void;
}

export function CanvasLayer({
  zoneBounds,
  adSize,
  displaySize,
  zoneOverrides,
  customZones,
  selectedZoneId,
  onZoneSelect,
  onZoneMove,
  onZoneResize,
  onZoneCreate,
  onZoneReset,
  onZoneDelete,
  onZoneAsset,
  activeSlotField,
  feedColumns,
  feedSampleRow,
  onZoneContentUpdate,
  onResizeDetected,
}: CanvasLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  // Pending image placement rect — shown as URL input after drawing
  const [pendingImageRect, setPendingImageRect] = useState<ZoneBound | null>(null);

  // Build merged display-coord bounds for all zones (wireframe + custom)
  // Used by useCanvasLayer for lasso hit-testing
  const allZoneBoundsDisplay: Record<string, ZoneBound> = {};
  for (const [id, native] of Object.entries(zoneBounds)) {
    const override = zoneOverrides[id] ?? native;
    allZoneBoundsDisplay[id] = {
      x: toDisplay(override.x, adSize, displaySize),
      y: toDisplay(override.y, adSize, displaySize),
      w: toDisplay(override.w, adSize, displaySize),
      h: toDisplay(override.h, adSize, displaySize),
    };
  }
  for (const zone of customZones) {
    allZoneBoundsDisplay[zone.id] = {
      x: toDisplay(zone.x, adSize, displaySize),
      y: toDisplay(zone.y, adSize, displaySize),
      w: toDisplay(zone.w, adSize, displaySize),
      h: toDisplay(zone.h, adSize, displaySize),
    };
  }

  const {
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
  } = useCanvasLayer({ allZoneBoundsDisplay, onZoneSelect });

  // ResizeObserver — update pendingDisplaySizeRef synchronously to avoid stale-displaySize race
  useEffect(() => {
    if (!containerRef.current || !onResizeDetected) return;
    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        pendingDisplaySizeRef.current = containerRef.current.offsetWidth;
      }
      onResizeDetected();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onResizeDetected, pendingDisplaySizeRef]);

  // react-konva handles its own Stage cleanup on unmount — do not call stage.destroy() manually.
  // Doing so in StrictMode dev double-invokes effects, which destroys the Stage on the first
  // mount/unmount cycle and leaves a broken canvas on the second mount.

  // Delete/Backspace key: delete selected custom zones
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Only handle if focus is on the canvas area, not a text input
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')
      ) return;
      const customIds = new Set(customZones.map((z) => z.id));
      deleteSelected(customIds, onZoneDelete);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customZones, deleteSelected, onZoneDelete]);

  if (!adSize || !displaySize) return null;

  // ── Stage event handlers ─────────────────────────────────────────────────

  function getStagePointer(): { x: number; y: number } | null {
    const pos = stageRef.current?.getPointerPosition();
    return pos ?? null;
  }

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    // Only handle mousedown on Stage background (not on a zone Rect)
    // e.target is a Konva node; Stage background is the Stage itself
    if (e.target.getType() !== 'Stage') return;
    const pos = getStagePointer();
    if (!pos) return;
    if (placementMode) {
      startPlacement(pos.x, pos.y);
    } else {
      startLasso(pos.x, pos.y);
    }
  }

  function handleStageMouseMove(_e: Konva.KonvaEventObject<MouseEvent>) {
    const pos = getStagePointer();
    if (!pos) return;
    if (placementMode && placementRect) {
      updatePlacement(pos.x, pos.y);
    } else if (lassoRect) {
      updateLasso(pos.x, pos.y);
    }
  }

  function toNativeRect(displayRect: ZoneBound): ZoneBound {
    // placementRect is in display (Konva) coords — must convert to adSize native coords
    // before storing, because CanvasLayer renders zones as toDisplay(native, adSize, displaySize)
    return {
      x: clampNative(toNative(displayRect.x, adSize, displaySize), adSize),
      y: clampNative(toNative(displayRect.y, adSize, displaySize), adSize),
      w: clampNative(toNative(displayRect.w, adSize, displaySize), adSize),
      h: clampNative(toNative(displayRect.h, adSize, displaySize), adSize),
    };
  }

  function handleStageMouseUp() {
    if (placementMode) {
      const rect = finishPlacement();
      if (rect) {
        const native = toNativeRect(rect);
        if (placementMode === 'text') {
          onZoneCreate({ type: 'text', ...native });
          cancelPlacementMode();
        } else {
          // Store in native coords so handleImageUrlSubmit can pass directly to onZoneCreate
          setPendingImageRect(native);
          cancelPlacementMode();
        }
      }
    } else if (lassoRect) {
      finishLasso();
    }
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    // Clicking Stage background (not a zone) deselects all
    if (e.target.getType() === 'Stage') {
      clearSelection();
    }
  }

  function handleImageUrlSubmit(_zoneId: string, url: string) {
    if (pendingImageRect && url.trim()) {
      onZoneCreate({
        type: 'image',
        x: pendingImageRect.x,
        y: pendingImageRect.y,
        w: pendingImageRect.w,
        h: pendingImageRect.h,
        assetUrl: url.trim(),
      });
    }
    setPendingImageRect(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const customZoneIds = new Set(customZones.map((z) => z.id));

  // Cursor: crosshair while drawing a new zone; zones set their own cursor on hover.
  const cursor = placementMode ? 'crosshair' : 'default';

  return (
    // Root overlay: fills the inner wrapper exactly.
    // When activeSlotField is set (slot-mapping mode), the whole overlay becomes
    // transparent so clicks reach the iframe. Otherwise the Stage captures events.
    <div style={{
      position: 'absolute', top: 0, left: 0, zIndex: 10,
      width: displaySize, height: displaySize,
      pointerEvents: activeSlotField !== null ? 'none' : 'auto',
    }}>

      {/* Toolbar: floats ABOVE the canvas via bottom:100%, never overlays the ad */}
      <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, paddingBottom: 4, pointerEvents: 'auto' }}>
        <NewZoneToolbar
          placementMode={placementMode}
          onEnterPlacementMode={enterPlacementMode}
          onCancelPlacementMode={cancelPlacementMode}
        />
      </div>

      {/* Stage container: ResizeObserver target + Konva canvas */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', top: 0, left: 0, width: displaySize, height: displaySize }}
      >
      <Stage
        ref={stageRef}
        width={displaySize}
        height={displaySize}
        // Do NOT set pixelRatio manually — Konva handles HiDPI correctly.
        style={{
          display: 'block',
          cursor,
        }}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onClick={handleStageClick}
      >
        <Layer>
          {/* Wireframe zones (moved/resized via zoneOverrides) */}
          {Object.entries(zoneBounds).map(([slotId, native]) => {
            const override = zoneOverrides[slotId] ?? native;
            const hasOverride = Boolean(zoneOverrides[slotId]);
            return (
              <ZoneRect
                key={slotId}
                id={slotId}
                x={toDisplay(override.x, adSize, displaySize)}
                y={toDisplay(override.y, adSize, displaySize)}
                w={toDisplay(override.w, adSize, displaySize)}
                h={toDisplay(override.h, adSize, displaySize)}
                isSelected={selectedIds.has(slotId)}
                isWireframe
                adSize={adSize}
                displaySize={displaySize}
                onSelect={() => selectId(slotId, false)}
                onMove={(bounds) => onZoneMove(slotId, bounds)}
                onResize={(bounds) => onZoneResize(slotId, bounds)}
                onReset={hasOverride ? () => onZoneReset(slotId) : undefined}
              />
            );
          })}

          {/* Custom (user-drawn) zones */}
          {customZones.map((zone) => (
            <ZoneRect
              key={zone.id}
              id={zone.id}
              x={toDisplay(zone.x, adSize, displaySize)}
              y={toDisplay(zone.y, adSize, displaySize)}
              w={toDisplay(zone.w, adSize, displaySize)}
              h={toDisplay(zone.h, adSize, displaySize)}
              isSelected={selectedIds.has(zone.id)}
              isWireframe={false}
              adSize={adSize}
              displaySize={displaySize}
              onSelect={() => selectId(zone.id, false)}
              onMove={(bounds) => onZoneMove(zone.id, bounds)}
              onResize={(bounds) => onZoneResize(zone.id, bounds)}
            />
          ))}

          {/* Lasso rubber-band */}
          {lassoRect && (
            <KonvaRect
              x={lassoRect.x}
              y={lassoRect.y}
              width={lassoRect.w}
              height={lassoRect.h}
              stroke="#2563eb"
              strokeWidth={1}
              dash={[4, 3]}
              fill="rgba(37,99,235,0.05)"
              listening={false}
            />
          )}

          {/* Placement ghost rect */}
          {placementRect && (
            <KonvaRect
              x={placementRect.x}
              y={placementRect.y}
              width={placementRect.w}
              height={placementRect.h}
              stroke={placementMode === 'image' ? '#059669' : '#7c3aed'}
              strokeWidth={1.5}
              dash={[4, 3]}
              fill={
                placementMode === 'image'
                  ? 'rgba(5,150,105,0.08)'
                  : 'rgba(124,58,237,0.08)'
              }
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      </div>{/* end containerRef / Stage container */}

      {/* ZoneInspector — inline editor + trash for selected CUSTOM zones */}
      {selectedZoneId && customZoneIds.has(selectedZoneId) && (() => {
        const zone = customZones.find((z) => z.id === selectedZoneId);
        const displayBound = allZoneBoundsDisplay[selectedZoneId];
        if (!zone || !displayBound) return null;
        return (
          <ZoneInspector
            zone={zone}
            displayBound={displayBound}
            canvasWidth={displaySize}
            canvasHeight={displaySize}
            feedColumns={feedColumns}
            feedSampleRow={feedSampleRow}
            onDelete={() => { onZoneDelete(selectedZoneId); clearSelection(); }}
            onClose={() => clearSelection()}
            onContentUpdate={(patch) => onZoneContentUpdate(selectedZoneId, patch)}
          />
        );
      })()}

      {/* ZoneContentBadge — asset URL picker badge on selected image zones */}
      {selectedZoneId && (() => {
        const isCustom = customZoneIds.has(selectedZoneId);
        const isImage = isCustom
          ? customZones.find((z) => z.id === selectedZoneId)?.type === 'image'
          : true; // wireframe zones are treated as image zones for asset fill
        if (!isImage) return null;
        // Custom image zones use ZoneInspector (above); wireframe zones get the badge
        if (isCustom) return null;

        const displayBound = allZoneBoundsDisplay[selectedZoneId];
        if (!displayBound) return null;

        return (
          <div
            style={{
              position: 'absolute',
              left: displayBound.x,
              top: displayBound.y,
              width: displayBound.w,
              height: displayBound.h,
              pointerEvents: 'auto',
            }}
          >
            <ZoneContentBadge
              zoneId={selectedZoneId}
              onUrlSubmit={(zoneId, url) => onZoneAsset(zoneId, url, true)}
            />
          </div>
        );
      })()}

      {/* URL dialog for pending image placement */}
      {pendingImageRect && (
        <div style={{ pointerEvents: 'auto' }}>
          <ZoneContentBadge
            zoneId="__pending_image__"
            onUrlSubmit={handleImageUrlSubmit}
          />
        </div>
      )}
    </div>
  );
}

export default CanvasLayer;
