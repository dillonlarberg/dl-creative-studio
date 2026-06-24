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
import { cn } from '../../../utils/cn';

export type ZoneFieldInfo = {
  fieldId: string;
  fieldLabel: string;
  fieldType: 'text' | 'image';
  columnMapped?: string;
};

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
  feedSampleData?: Array<Record<string, unknown>>;
  feedRowIndex?: number;
  onFeedRowChange?: (i: number) => void;
  zoneStyles: Record<string, import('../types').ZoneStyle>;
  clientSlug: string;
  onZoneContentUpdate: (id: string, patch: { fieldId?: string; textContent?: string; assetUrl?: string }) => void;
  onZoneStyleUpdate: (id: string, patch: import('../types').ZoneStyle) => void;

  // zone status badges
  mappedZoneIds?: Set<string>;
  overflowZoneIds?: Set<string>;

  // zone → field label mapping for hover identification and wireframe zone panel
  zoneFieldMap?: Record<string, ZoneFieldInfo>;

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
  feedSampleData,
  feedRowIndex,
  onFeedRowChange,
  zoneStyles,
  clientSlug,
  onZoneContentUpdate,
  onZoneStyleUpdate,
  mappedZoneIds,
  overflowZoneIds,
  zoneFieldMap,
  onResizeDetected,
}: CanvasLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

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
                  onHoverChange={(h) => setHoveredZoneId(h ? slotId : null)}
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
                onHoverChange={(h) => setHoveredZoneId(h ? zone.id : null)}
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

      {/* Zone status badges — green = mapped, amber = unmapped or overflowing */}
      {!placementMode && Object.entries(allZoneBoundsDisplay).map(([zoneId, bounds]) => {
        if (zoneId === selectedZoneId) return null;
        const isCustom = customZoneIds.has(zoneId);
        const customZone = isCustom ? customZones.find((z) => z.id === zoneId) : null;
        const isMapped = (mappedZoneIds?.has(zoneId) ?? false) || (isCustom && customZone?.fieldId != null);
        const hasOverflow = overflowZoneIds?.has(zoneId) ?? false;
        return (
          <div key={`status-${zoneId}`} style={{
            position: 'absolute',
            left: bounds.x + bounds.w - 5,
            top: bounds.y - 4,
            width: 8, height: 8, borderRadius: '50%',
            background: isMapped && !hasOverflow ? '#16a34a' : '#f59e0b',
            border: '1.5px solid white',
            pointerEvents: 'none', zIndex: 20,
          }} />
        );
      })}

      {/* Zone hover label — shows the zone ID so users can identify zones */}
      {hoveredZoneId && hoveredZoneId !== selectedZoneId && (() => {
        const bounds = allZoneBoundsDisplay[hoveredZoneId];
        if (!bounds) return null;
        return (
          <div key={`label-${hoveredZoneId}`} style={{
            position: 'absolute',
            left: bounds.x + 4,
            top: bounds.y + 4,
            pointerEvents: 'none',
            zIndex: 25,
          }}>
            <span style={{
              display: 'inline-block',
              background: 'rgba(15,23,42,0.82)',
              color: 'white',
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
            }}>
              {zoneFieldMap?.[hoveredZoneId]?.fieldLabel ?? hoveredZoneId.replace(/[-_]/g, ' ')}
            </span>
          </div>
        );
      })()}

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
            feedSampleData={feedSampleData}
            feedRowIndex={feedRowIndex}
            onFeedRowChange={onFeedRowChange}
            zoneStyle={zoneStyles[selectedZoneId]}
            clientSlug={clientSlug}
            onDelete={() => { onZoneDelete(selectedZoneId); clearSelection(); }}
            onClose={() => clearSelection()}
            onContentUpdate={(patch) => onZoneContentUpdate(selectedZoneId, patch)}
            onStyleUpdate={(patch) => onZoneStyleUpdate(selectedZoneId, patch)}
          />
        );
      })()}

      {/* Wireframe zone info panel + ZoneContentBadge */}
      {selectedZoneId && !customZoneIds.has(selectedZoneId) && (() => {
        const displayBound = allZoneBoundsDisplay[selectedZoneId];
        if (!displayBound) return null;
        const info = zoneFieldMap?.[selectedZoneId];
        const isImageZone = info?.fieldType === 'image';
        const panelW = 196;
        const rightEdge = displayBound.x + displayBound.w + 8 + panelW;
        const panelLeft = rightEdge <= displaySize
          ? displayBound.x + displayBound.w + 8
          : displayBound.x - panelW - 8;
        const panelTop = Math.max(0, Math.min(displayBound.y, displaySize - 320));
        const currentVal = info?.columnMapped && feedSampleRow
          ? String(feedSampleRow[info.columnMapped] ?? '').trim()
          : undefined;
        const zoneStyle = zoneStyles[selectedZoneId];
        // Native (adSize) coords — what gets stored in zoneOverrides
        const nativeBounds = zoneOverrides[selectedZoneId] ?? zoneBounds[selectedZoneId];

        function patchNativeBounds(patch: Partial<ZoneBound>) {
          if (!nativeBounds) return;
          onZoneMove(selectedZoneId!, { ...nativeBounds, ...patch });
        }

        return (
          <>
            {/* Image URL badge sits inside the zone bounds */}
            <div style={{ position: 'absolute', left: displayBound.x, top: displayBound.y, width: displayBound.w, height: displayBound.h, pointerEvents: 'auto' }}>
              <ZoneContentBadge
                zoneId={selectedZoneId}
                onUrlSubmit={(zoneId, url) => onZoneAsset(zoneId, url, true)}
              />
            </div>

            {/* Field info panel floats beside the zone */}
            <div
              style={{ position: 'absolute', left: panelLeft, top: panelTop, width: panelW, zIndex: 30, pointerEvents: 'auto' }}
              className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-gray-50 border-b border-gray-100 rounded-t-xl">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-700 truncate">
                  {info?.fieldLabel ?? selectedZoneId.replace(/[-_]/g, ' ')}
                </span>
                <span className={cn(
                  'text-[7px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-md shrink-0',
                  isImageZone ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                )}>
                  {isImageZone ? 'Image' : 'Text'}
                </span>
              </div>

              <div className="p-2.5 space-y-2">
                {/* Mapped column + current value */}
                {info?.columnMapped ? (
                  <div className="space-y-0.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[8px] font-bold text-gray-400 shrink-0">Col</span>
                      <span className="text-[9px] font-semibold text-gray-600 truncate">{info.columnMapped}</span>
                    </div>
                    {currentVal && (
                      <p className="text-[8px] text-gray-400 truncate leading-snug" title={currentVal}>
                        {currentVal}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[8px] text-amber-500 font-medium">No column mapped yet</p>
                )}

                {/* Position & dimensions */}
                {nativeBounds && (
                  <div className="pt-1.5 border-t border-gray-50 space-y-1.5">
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.15em]">Position & Size</span>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      {(['x', 'y', 'w', 'h'] as const).map((key) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="text-[8px] font-bold text-gray-400 w-3 shrink-0 uppercase">{key}</span>
                          <input
                            type="number"
                            value={Math.round(nativeBounds[key])}
                            min={0} max={adSize}
                            className="flex-1 min-w-0 px-1 py-0.5 rounded border border-gray-200 text-[9px] font-mono text-center focus:border-blue-400 outline-none"
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!isNaN(v) && v >= 0) patchNativeBounds({ [key]: v });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text formatting (text zones only) */}
                {!isImageZone && (
                  <div className="pt-1.5 border-t border-gray-50 space-y-1.5">
                    {/* Alignment */}
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-bold text-gray-400 shrink-0">Align</span>
                      <div className="flex gap-1">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button key={align} type="button"
                            title={`Align ${align}`}
                            onClick={() => onZoneStyleUpdate(selectedZoneId, { textAlign: zoneStyle?.textAlign === align ? undefined : align })}
                            className={cn(
                              'w-6 h-6 rounded text-[10px] flex items-center justify-center border transition-colors',
                              zoneStyle?.textAlign === align
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                            )}
                          >
                            {align === 'left' ? '⬅' : align === 'center' ? '≡' : '➡'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Font size */}
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-bold text-gray-400 shrink-0">Size</span>
                      <input
                        type="number"
                        value={zoneStyle?.fontSize ?? ''}
                        placeholder="auto"
                        min={6} max={120}
                        className="w-14 px-1.5 py-0.5 rounded-lg border border-gray-200 text-[9px] font-mono text-center focus:border-blue-400 outline-none"
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!isNaN(v) && v >= 6) onZoneStyleUpdate(selectedZoneId, { fontSize: v });
                        }}
                      />
                      {zoneStyle?.fontSize && (
                        <button
                          type="button"
                          className="text-[8px] text-gray-300 hover:text-gray-500 transition-colors"
                          onClick={() => onZoneStyleUpdate(selectedZoneId, { fontSize: undefined })}
                        >
                          reset
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

export default CanvasLayer;
