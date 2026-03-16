import MagicWand from 'magic-wand-tool';
import type { BinaryMask, CanvasEvent, SelectionTool } from './types';

const DEFAULT_THRESHOLD = 15;
const BLUR_RADIUS = 5;

interface MagicWandState {
  imageData: ImageData | null;
  image: { data: Uint8Array; width: number; height: number; bytes: number } | null;
  downPoint: { x: number; y: number } | null;
  currentThreshold: number;
  isActive: boolean;
}

export class MagicWandTool implements SelectionTool {
  private state: MagicWandState = {
    imageData: null,
    image: null,
    downPoint: null,
    currentThreshold: DEFAULT_THRESHOLD,
    isActive: false,
  };

  activate(imageData: ImageData): void {
    this.state.imageData = imageData;
    this.state.image = {
      data: new Uint8Array(imageData.data.buffer),
      width: imageData.width,
      height: imageData.height,
      bytes: 4,
    };
    this.state.isActive = true;
  }

  deactivate(): void {
    this.state.isActive = false;
    this.state.downPoint = null;
    this.state.currentThreshold = DEFAULT_THRESHOLD;
  }

  onEvent(event: CanvasEvent): BinaryMask | null {
    if (!this.state.isActive || !this.state.image) return null;

    switch (event.type) {
      case 'mousedown':
        return this.handleMouseDown(event);
      case 'mousemove':
        return this.handleMouseMove(event);
      case 'mouseup':
        return this.handleMouseUp();
      default:
        return null;
    }
  }

  /** Get the current threshold (for UI display) */
  getThreshold(): number {
    return this.state.currentThreshold;
  }

  private handleMouseDown(event: CanvasEvent): BinaryMask | null {
    this.state.downPoint = { x: Math.round(event.x), y: Math.round(event.y) };
    this.state.currentThreshold = DEFAULT_THRESHOLD;
    return this.computeMask(this.state.downPoint.x, this.state.downPoint.y);
  }

  private handleMouseMove(event: CanvasEvent): BinaryMask | null {
    if (!this.state.downPoint) return null;

    const p = { x: Math.round(event.x), y: Math.round(event.y) };
    if (p.x === this.state.downPoint.x && p.y === this.state.downPoint.y) {
      return null;
    }

    const dx = p.x - this.state.downPoint.x;
    const dy = p.y - this.state.downPoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const sign = adx > ady ? dx / adx : dy / ady;
    const scaledSign = sign < 0 ? sign / 5 : sign / 3;

    const newThreshold = Math.min(
      Math.max(DEFAULT_THRESHOLD + Math.floor(scaledSign * len), 1),
      255,
    );

    if (newThreshold === this.state.currentThreshold) return null;

    this.state.currentThreshold = newThreshold;
    return this.computeMask(this.state.downPoint.x, this.state.downPoint.y);
  }

  private handleMouseUp(): BinaryMask | null {
    this.state.downPoint = null;
    return null;
  }

  private computeMask(x: number, y: number): BinaryMask | null {
    if (!this.state.image) return null;

    let mask = MagicWand.floodFill(
      this.state.image,
      x,
      y,
      this.state.currentThreshold,
      null,
      true,
    );

    if (!mask) return null;

    mask = MagicWand.gaussBlurOnlyBorder(mask, BLUR_RADIUS);

    return {
      data: mask.data,
      width: mask.width,
      height: mask.height,
      bounds: mask.bounds,
    };
  }
}
