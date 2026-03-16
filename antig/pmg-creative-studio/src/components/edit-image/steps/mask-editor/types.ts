/** Binary selection mask — matches magic-wand-tool output format */
export interface BinaryMask {
  data: Uint8Array;
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Normalized canvas event with image-space coordinates */
export interface CanvasEvent {
  type: 'mousedown' | 'mousemove' | 'mouseup';
  x: number;
  y: number;
  shiftKey: boolean;
  altKey: boolean;
  nativeEvent: MouseEvent;
}

/** Brush mode — shared across tools */
export type BrushMode = 'keep' | 'erase';

/**
 * Common interface for all selection tools.
 * MVP tools only need ImageData. Post-MVP PenTool may extend this
 * to accept a Fabric canvas reference if needed.
 */
export interface SelectionTool {
  activate(imageData: ImageData): void;
  deactivate(): void;
  onEvent(event: CanvasEvent): BinaryMask | null;
}

/** Display dimensions computed during init */
export interface DisplayDims {
  w: number;
  h: number;
  fitScale: number;
  displayW: number;
  displayH: number;
}

/** Undo entry for replay-based undo */
export interface UndoEntry {
  mask: BinaryMask;
  mode: BrushMode;
}
