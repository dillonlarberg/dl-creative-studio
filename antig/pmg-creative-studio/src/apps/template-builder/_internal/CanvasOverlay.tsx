import { useEffect, useRef } from 'react';
import type { ZoneBound } from '../types';

// ZoneBound has moved to types.ts — re-exported here for backwards compatibility
// during the CanvasOverlay → CanvasLayer transition. Remove when CanvasOverlay is deleted.
export type { ZoneBound } from '../types';

export interface CanvasOverlayProps {
  zoneBounds: Record<string, ZoneBound>;  // iframe-space coordinates
  adSize: number;                          // e.g. 1024
  displaySize: number;                     // CSS-scaled display pixel size, e.g. 306
  selectedZoneId: string | null;
  onZoneSelect: (slotId: string) => void;
  onResizeDetected?: () => void;           // called when container resizes (to re-request zone-bounds)
}

export function CanvasOverlay({
  zoneBounds,
  adSize,
  displaySize,
  selectedZoneId,
  onZoneSelect,
  onResizeDetected,
}: CanvasOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ResizeObserver: notify parent when container size changes so it can re-request zone-bounds
  useEffect(() => {
    if (!containerRef.current || !onResizeDetected) return;
    const observer = new ResizeObserver(() => {
      onResizeDetected();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onResizeDetected]);

  // Guard after hooks: if adSize or displaySize are invalid, render nothing
  if (!adSize || !displaySize) return null;

  const scale = displaySize / adSize;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {Object.entries(zoneBounds).map(([slotId, bound]) => {
        const left = bound.x * scale;
        const top = bound.y * scale;
        const width = bound.w * scale;
        const height = bound.h * scale;
        const isSelected = slotId === selectedZoneId;

        return (
          <div
            key={slotId}
            onClick={() => onZoneSelect(slotId)}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              border: isSelected ? '2px solid #2563eb' : '1.5px solid rgba(156,163,175,0.5)',
              borderRadius: '2px',
              backgroundColor: isSelected ? 'rgba(37,99,235,0.06)' : 'transparent',
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxSizing: 'border-box',
            }}
          />
        );
      })}
    </div>
  );
}

export default CanvasOverlay;
