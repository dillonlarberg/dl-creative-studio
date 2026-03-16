import { PencilBrush } from 'fabric';
import type { Canvas as FabricCanvas } from 'fabric';
import type { BrushMode } from './types';
import {
  mirrorPathToMask,
  updateBrush,
  setupBrushCursor,
  updateBrushCursor,
} from './maskUtils';

export interface BrushToolConfig {
  fabricCanvas: FabricCanvas;
  maskCanvas: HTMLCanvasElement;
  initialMaskData: ImageData;
}

export class BrushTool {
  private config: BrushToolConfig;
  private cursor: any = null;
  private mode: BrushMode = 'keep';
  private size: number = 20;
  private opacity: number = 100;
  private pathCreatedHandler: ((e: any) => void) | null = null;

  constructor(config: BrushToolConfig) {
    this.config = config;
  }

  activate(mode: BrushMode, size: number, opacity: number): void {
    this.mode = mode;
    this.size = size;
    this.opacity = opacity;

    const canvas = this.config.fabricCanvas as any;
    canvas.isDrawingMode = true;

    canvas.freeDrawingBrush = new PencilBrush(canvas);
    updateBrush(canvas, this.mode, this.size, this.opacity);

    this.cursor = setupBrushCursor(canvas, this.mode, this.size);

    this.pathCreatedHandler = (e: any) => {
      const path = e.path;
      if (!path) return;
      if (path.data == null) path.data = {};
      path.data.maskMode = this.mode;
      mirrorPathToMask(path, this.config.maskCanvas);
    };
    canvas.on('path:created', this.pathCreatedHandler);
  }

  deactivate(): void {
    const canvas = this.config.fabricCanvas as any;
    canvas.isDrawingMode = false;

    if (this.cursor) {
      canvas.remove(this.cursor);
      this.cursor = null;
    }

    if (this.pathCreatedHandler) {
      canvas.off('path:created', this.pathCreatedHandler);
      this.pathCreatedHandler = null;
    }

    // Restore default cursors
    canvas.defaultCursor = 'default';
    canvas.freeDrawingCursor = 'crosshair';
  }

  updateSettings(mode: BrushMode, size: number, opacity: number): void {
    this.mode = mode;
    this.size = size;
    this.opacity = opacity;
    const canvas = this.config.fabricCanvas as any;
    updateBrush(canvas, mode, size, opacity);
    if (this.cursor) {
      updateBrushCursor(this.cursor, mode, size);
    }
  }

  undo(): void {
    const canvas = this.config.fabricCanvas as any;
    const objects = canvas.getObjects();
    const paths = objects.filter((o: any) => o.type === 'path');
    if (paths.length === 0) return;

    const lastPath = paths[paths.length - 1];
    canvas.remove(lastPath);

    // Restore mask from initial state
    const maskCtx = this.config.maskCanvas.getContext('2d')!;
    maskCtx.putImageData(this.config.initialMaskData, 0, 0);

    // Replay remaining paths
    const remainingPaths = paths.slice(0, -1);
    for (const p of remainingPaths) {
      mirrorPathToMask(p, this.config.maskCanvas);
    }

    canvas.renderAll();
  }
}
