import { useRef, useEffect } from 'react';
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

  // inline zone inspector (feed column / static text / font / delete)
  feedColumns: string[];
  feedSampleRow?: Record<string, unknown>;
  zoneStyles: Record<string, import('../types').ZoneStyle>;
  onZoneContentUpdate: (id: string, patch: { fieldId?: string; textContent?: string; assetUrl?: string }) => void;
  onZoneStyleUpdate: (id: string, patch: import('../types').ZoneStyle) => void;

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
  zoneStyles,
  onZoneContentUpdate,
  onZoneStyleUpdate,
  onResizeDetected,
}: CanvasLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  // Build merged display-coord bounds for all zones (wireframe + custom)
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

  // Auto-select a newly created zone (created by onZoneCreate which generates ID async).
  // We detect the new zone by watching customZones.length grow.
  const prevCustomZonesCountRef = useRef(customZones.length);
  const autoSelectNextRef = useRef(false);
  useEffect(() => {
    if (autoSelectNextRef.current && customZones.length > prevCustomZonesCountRef.current) {
      const newest = customZones[customZones.length - 1];
      if (newest) selectId(newest.id, false);
      autoSelectNextRef.current = false;
    }
    prevCustomZonesCountRef.current = customZones.length;
  }, [customZones, selectId]);

  // ResizeObserver
  useEffect(() => {
    if (!containerRef.current || !onResizeDetected) return;
    const observer = new ResizeObserver(() => {
      if (containerRef.current) pendingDisplaySizeRef.current = containerRef.current.offsetWidth;
      onResizeDetected();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onResizeDetected, pendingDisplaySizeRef]);

  // Delete/Backspace key for custom zones
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')
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
    return stageRef.current?.getPointerPosition() ?? null;
  }

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.target.getType() !== 'Stage') return;
    const pos = getStagePointer();
    if (!pos) return;
    if (placementMode) startPlacement(pos.x, pos.y);
    else startLasso(pos.x, pos.y);
  }

  function handleStageMouseMove(_e: Konva.KonvaEventObject<MouseEvent>) {
    const pos = getStagePointer();
    if (!pos) return;
    if (placementMode && placementRect) updatePlacement(pos.x, pos.y);
    else if (lassoRect) updateLasso(pos.x, pos.y);
  }

  function toNativeRect(r: ZoneBound): ZoneBound {
    return {
      x: clampNative(toNative(r.x, adSize, displaySize), adSize),
      y: clampNative(toNative(r.y, adSize, displaySize), adSize),
      w: clampNative(toNative(r.w, adSize, displaySize), adSize),
      h: clampNative(toNative(r.h, adSize, displaySize), adSize),
    };
  }

  function handleStageMouseUp() {
    if (placementMode) {
      const rect = finishPlacement();
      if (rect) {
        const native = toNativeRect(rect);
        // Both text and image zones are created immediately — no pending URL dialog.
        // Image zones open ZoneInspector (with URL input) via auto-select.
        onZoneCreate({ type: placementMode, ...native });
        autoSelectNextRef.current = true;
        cancelPlacementMode();
      }
    } else if (lassoRect) {
      finishLasso();
    }
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.target.getType() === 'Stage') clearSelection();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const customZoneIds = new Set(customZones.map((z) => z.id));
  const cursor = placementMode ? 'crosshair' : 'default';

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, zIndex: 10,
      width: displaySize, height: displaySize,
      pointerEvents: activeSlotField !== null ? 'none' : 'auto',
    }}>
      {/* Toolbar floats above the canvas */}
      <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, paddingBottom: 4, pointerEvents: 'auto' }}>
        <NewZoneToolbar
          placementMode={placementMode}
          onEnterPlacementMode={enterPlacementMode}
          onCancelPlacementMode={cancelPlacementMode}
        />
      </div>

      {/* Stage container */}
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: displaySize, height: displaySize }}>
        <Stage
          ref={stageRef}
          width={displaySize}
          height={displaySize}
          style={{ display: 'block', cursor }}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onClick={handleStageClick}
        >
          <Layer>
            {/* Wireframe zones */}
            {Object.entries(zoneBounds).map(([slotId, native]) => {
              const override = zoneOverrides[slotId] ?? native;
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
                  onReset={zoneOverrides[slotId] ? () => onZoneReset(slotId) : undefined}
                />
              );
            })}

            {/* Custom zones */}
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
                x={lassoRect.x} y={lassoRect.y}
                width={lassoRect.w} height={lassoRect.h}
                stroke="#2563eb" strokeWidth={1} dash={[4, 3]}
                fill="rgba(37,99,235,0.05)" listening={false}
              />
            )}

            {/* Placement ghost */}
            {placementRect && (
              <KonvaRect
                x={placementRect.x} y={placementRect.y}
                width={placementRect.w} height={placementRect.h}
                stroke={placementMode === 'image' ? '#059669' : '#7c3aed'}
                strokeWidth={1.5} dash={[4, 3]}
                fill={placementMode === 'image' ? 'rgba(5,150,105,0.08)' : 'rgba(124,58,237,0.08)'}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      </div>

      {/* ZoneInspector — for ALL selected custom zones (text + image) */}
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
            zoneStyle={zoneStyles[selectedZoneId]}
            onDelete={() => { onZoneDelete(selectedZoneId); clearSelection(); }}
            onClose={() => clearSelection()}
            onContentUpdate={(patch) => onZoneContentUpdate(selectedZoneId, patch)}
            onStyleUpdate={(patch) => onZoneStyleUpdate(selectedZoneId, patch)}
          />
        );
      })()}

      {/* ZoneContentBadge — asset URL badge on selected WIREFRAME image zones only */}
      {selectedZoneId && !customZoneIds.has(selectedZoneId) && (() => {
        const displayBound = allZoneBoundsDisplay[selectedZoneId];
        if (!displayBound) return null;
        return (
          <div style={{ position: 'absolute', left: displayBound.x, top: displayBound.y, width: displayBound.w, height: displayBound.h, pointerEvents: 'auto' }}>
            <ZoneContentBadge
              zoneId={selectedZoneId}
              onUrlSubmit={(zoneId, url) => onZoneAsset(zoneId, url, true)}
            />
          </div>
        );
      })()}
    </div>
  );
}

export default CanvasLayer;
