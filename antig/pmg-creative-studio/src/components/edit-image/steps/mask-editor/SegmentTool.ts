import type { BinaryMask, CanvasEvent, SelectionTool, SelectionToolConfig } from './types';

const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 30;
const SAM_MODEL_VERSION = 'fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83';

interface SegmentToolOptions {
  onMaskReady: (mask: BinaryMask, event: CanvasEvent) => void;
  imageCanvas: HTMLCanvasElement;
}

export class SegmentTool implements SelectionTool {
  private overlayCanvas: HTMLCanvasElement | null = null;
  private imageWidth = 0;
  private imageHeight = 0;
  private isActive = false;
  private isProcessing = false;
  private abortController: AbortController | null = null;
  private onMaskReady: (mask: BinaryMask, event: CanvasEvent) => void;
  private imageBase64: string | null = null;
  private imageCanvas: HTMLCanvasElement;

  constructor(options: SegmentToolOptions) {
    this.onMaskReady = options.onMaskReady;
    this.imageCanvas = options.imageCanvas;
  }

  activate(config: SelectionToolConfig): void {
    this.overlayCanvas = config.overlayCanvas;
    this.imageWidth = config.imageWidth;
    this.imageHeight = config.imageHeight;
    this.isActive = true;
  }

  deactivate(): void {
    this.isActive = false;
    this.abortController?.abort();
    this.abortController = null;
    this.isProcessing = false;
  }

  onEvent(event: CanvasEvent): BinaryMask | null {
    if (!this.isActive || event.type !== 'mousedown' || this.isProcessing) return null;
    this.isProcessing = true;
    this.segment(event);
    return null;
  }

  resetDrag(): void {}

  destroy(): void {
    this.isActive = false;
    this.isProcessing = false;
    this.abortController?.abort();
    this.abortController = null;
    this.overlayCanvas = null;
  }

  private async segment(event: CanvasEvent): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      if (!this.imageBase64) {
        this.imageBase64 = this.imageCanvas.toDataURL('image/png');
      }

      // Retry up to 3 times on 429 (rate limit)
      let createRes: Response | null = null;
      for (let retry = 0; retry < 3; retry++) {
        if (signal.aborted) return;
        createRes = await fetch('/replicate/predictions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: SAM_MODEL_VERSION,
            input: {
              image: this.imageBase64,
            },
          }),
          signal,
        });
        if (createRes.status !== 429) break;
        const retryAfter = (await createRes.json()).retry_after ?? 5;
        console.log(`[SegmentTool] Rate limited, retrying in ${retryAfter}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      }

      if (!createRes?.ok) throw new Error(`Replicate POST failed: ${createRes?.status}`);
      const prediction = await createRes.json();

      let result = prediction;
      let attempts = 0;

      while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < MAX_POLL_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (signal.aborted) return;
        const pollRes = await fetch(`/replicate/predictions/${result.id}`, { signal });
        if (!pollRes.ok) throw new Error(`Replicate poll failed: ${pollRes.status}`);
        result = await pollRes.json();
        attempts++;
      }

      if (result.status !== 'succeeded') {
        throw new Error(`Prediction failed with status: ${result.status}`);
      }

      const output = result.output;
      const maskUrls: string[] = output?.individual_masks ?? [];
      if (maskUrls.length === 0) throw new Error('No individual masks in output');

      // Find the smallest mask that contains the click point
      const clickX = Math.round(event.x);
      const clickY = Math.round(event.y);
      console.log(`[SegmentTool] Got ${maskUrls.length} masks, finding best match for click (${clickX}, ${clickY})`);

      const bestMask = await this.findBestMask(maskUrls, clickX, clickY, signal);
      if (signal.aborted) return;

      if (!bestMask) {
        console.log('[SegmentTool] No mask contains click point');
        this.isProcessing = false;
        return;
      }

      console.log('[SegmentTool] Best mask pixels:', bestMask.data.filter(v => v === 1).length, 'bounds:', bestMask.bounds);
      this.isProcessing = false;
      this.onMaskReady(bestMask, event);
    } catch (err) {
      if (signal.aborted) return;
      console.error('[SegmentTool] Segmentation failed:', err);
      this.isProcessing = false;
    }
  }

  /**
   * Load all mask images, find the smallest one that contains the click point.
   * "Smallest" = fewest pixels set, giving the most precise selection.
   */
  private async findBestMask(
    urls: string[],
    clickX: number,
    clickY: number,
    signal: AbortSignal,
  ): Promise<BinaryMask | null> {
    // Load all masks in parallel
    const masks = await Promise.all(
      urls.map((url) => this.decodeMaskImage(url, signal).catch(() => null)),
    );

    let bestMask: BinaryMask | null = null;
    let bestSize = Infinity;

    for (const mask of masks) {
      if (!mask) continue;

      // Check if click point is inside this mask
      const idx = clickY * this.imageWidth + clickX;
      if (idx < 0 || idx >= mask.data.length || mask.data[idx] !== 1) continue;

      // Count pixels (smaller = more precise)
      let size = 0;
      for (let i = 0; i < mask.data.length; i++) {
        if (mask.data[i] === 1) size++;
      }

      if (size < bestSize) {
        bestSize = size;
        bestMask = mask;
      }
    }

    return bestMask;
  }

  private async decodeMaskImage(url: string, signal: AbortSignal): Promise<BinaryMask> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error('Aborted')); return; }

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = this.imageWidth;
        canvas.height = this.imageHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, this.imageWidth, this.imageHeight);

        const imageData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);
        const data = new Uint8Array(this.imageWidth * this.imageHeight);

        let minX = this.imageWidth, minY = this.imageHeight, maxX = 0, maxY = 0;

        for (let i = 0; i < data.length; i++) {
          const r = imageData.data[i * 4];
          const a = imageData.data[i * 4 + 3];
          if (r > 128 || a > 128) {
            data[i] = 1;
            const x = i % this.imageWidth;
            const y = Math.floor(i / this.imageWidth);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }

        if (maxX < minX) {
          minX = 0; minY = 0; maxX = 0; maxY = 0;
        }

        resolve({
          data,
          width: this.imageWidth,
          height: this.imageHeight,
          bounds: { minX, minY, maxX, maxY },
        });
      };

      img.onerror = () => reject(new Error('Failed to load mask image'));
      img.src = url;
    });
  }
}
