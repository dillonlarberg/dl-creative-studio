import { useEffect, useRef, useState } from 'react';
import { Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { ZoneBound } from '../../types';
import { toNative, clampNative } from './canvasCoords';

export interface ZoneRectProps {
  id: string;
  /** Display (Konva) coords — already scaled by CanvasLayer before passing in. */
  x: number;
  y: number;
  w: number;
  h: number;
  isSelected: boolean;
  /** Wireframe zones can be moved/resized but not deleted. */
  isWireframe: boolean;
  adSize: number;
  displaySize: number;
  onSelect: () => void;
  onMove: (bounds: ZoneBound) => void;
  onResize: (bounds: ZoneBound) => void;
  onReset?: () => void;
  onHoverChange?: (hovered: boolean) => void;
}

export function ZoneRect({
  id,
  x,
  y,
  w,
  h,
  isSelected,
  adSize,
  displaySize,
  onSelect,
  onMove,
  onResize,
  onReset,
  onHoverChange,
}: ZoneRectProps) {
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [hovered, setHovered] = useState(false);

  // Attach/detach Transformer when selection changes
  useEffect(() => {
    if (isSelected && trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    // Restore move cursor after drag
    const stage = node.getStage();
    if (stage) stage.container().style.cursor = 'move';

    const nx = clampNative(toNative(node.x(), adSize, displaySize), adSize);
    const ny = clampNative(toNative(node.y(), adSize, displaySize), adSize);
    const nw = clampNative(toNative(node.width(), adSize, displaySize), adSize);
    const nh = clampNative(toNative(node.height(), adSize, displaySize), adSize);
    onMove({ x: nx, y: ny, w: nw, h: nh });
  }

  function handleTransformEnd() {
    const node = rectRef.current;
    if (!node) return;
    // CRITICAL: bake scaleX/scaleY into width/height before converting to native.
    // Konva stores resize as scale factors — not baking them causes wrong dimensions.
    const bakedW = node.width() * node.scaleX();
    const bakedH = node.height() * node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    node.width(bakedW);
    node.height(bakedH);

    const nx = clampNative(toNative(node.x(), adSize, displaySize), adSize);
    const ny = clampNative(toNative(node.y(), adSize, displaySize), adSize);
    const nw = clampNative(toNative(bakedW, adSize, displaySize), adSize);
    const nh = clampNative(toNative(bakedH, adSize, displaySize), adSize);
    onResize({ x: nx, y: ny, w: nw, h: nh });
  }

  return (
    <>
      <Rect
        ref={rectRef}
        id={id}
        x={x}
        y={y}
        width={w}
        height={h}
        stroke={isSelected ? '#2563eb' : hovered ? '#6366f1' : 'rgba(99,102,241,0.45)'}
        strokeWidth={isSelected ? 2 : hovered ? 2 : 1.5}
        dash={isSelected ? undefined : hovered ? undefined : [5, 4]}
        fill={isSelected ? 'rgba(37,99,235,0.07)' : hovered ? 'rgba(99,102,241,0.05)' : 'transparent'}
        cornerRadius={3}
        draggable
        hitStrokeWidth={12}
        onMouseEnter={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'move';
          setHovered(true);
          onHoverChange?.(true);
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'default';
          setHovered(false);
          onHoverChange?.(false);
        }}
        onDragStart={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'grabbing';
        }}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onContextMenu={(e) => { e.evt.preventDefault(); onReset?.(); }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          // Canva-style: solid blue border, round white handles with blue stroke
          borderStroke="#2563eb"
          borderStrokeWidth={1.5}
          borderDash={[]}
          anchorFill="white"
          anchorStroke="#2563eb"
          anchorStrokeWidth={1.5}
          anchorSize={8}
          anchorCornerRadius={4}
          enabledAnchors={[
            'top-left', 'top-right', 'bottom-left', 'bottom-right',
            'top-center', 'bottom-center', 'middle-left', 'middle-right',
          ]}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 8 || newBox.height < 8) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
