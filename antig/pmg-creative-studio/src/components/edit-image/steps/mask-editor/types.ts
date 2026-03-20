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

/** Configuration passed to selection tools on activation */
export interface SelectionToolConfig {
  imageData: ImageData;
  overlayCanvas: HTMLCanvasElement;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Common interface for all selection tools.
 * All tools receive the same config; each tool uses what it needs.
 */
export interface SelectionTool {
  activate(config: SelectionToolConfig): void;
  deactivate(): void;
  onEvent(event: CanvasEvent): BinaryMask | null;
  /** Reset any in-progress interaction (e.g., drag state) */
  resetDrag?(): void;
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
