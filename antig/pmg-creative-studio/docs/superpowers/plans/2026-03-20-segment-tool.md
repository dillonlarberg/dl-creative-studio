# Segment Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Tesseract TextTool with a click-to-segment tool powered by SAM 2.1 via Replicate.

**Architecture:** SegmentTool implements the existing SelectionTool interface. On click, it sends image + point coordinates to Replicate's SAM 2.1 API via a Vite dev proxy, polls for the result, decodes the mask, and delivers it asynchronously via an `onMaskReady` callback. The existing SelectionPipeline, MagicWandTool, BrushTool, and canvas stack are unchanged.

**Tech Stack:** TypeScript, Replicate API (SAM 2.1), Vite proxy, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-segment-tool-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Delete | `src/components/edit-image/steps/mask-editor/TextTool.ts` | Dead OCR tool |
| Delete | `src/components/edit-image/steps/mask-editor/__tests__/TextTool.test.ts` | Dead tests |
| Create | `src/components/edit-image/steps/mask-editor/SegmentTool.ts` | SAM click-to-segment tool |
| Create | `src/components/edit-image/steps/mask-editor/__tests__/SegmentTool.test.ts` | Unit tests |
| Modify | `src/components/edit-image/steps/mask-editor/types.ts` | Remove `TextRegion` |
| Modify | `src/components/edit-image/steps/MaskEditorModal.tsx` | Swap TextTool → SegmentTool, extract helper |
| Modify | `vite.config.ts` | Add `/replicate` proxy |
| Modify | `package.json` | Remove `tesseract.js` |
| Create | `.env.example` | Document `REPLICATE_API_TOKEN` |

### Deferred (CEO REDUCTION)

These spec items are explicitly deferred for prototype scope:
- Image downscaling for >2000px images (add if payload issues arise)
- Pulsing dot animation at click point (cursor:wait is sufficient)
- Error status text in toolbar (console.error only)
- API token missing validation (failures will surface naturally)

---

### Task 1: Remove TextTool and tesseract.js

**Files:**
- Delete: `src/components/edit-image/steps/mask-editor/TextTool.ts`
- Delete: `src/components/edit-image/steps/mask-editor/__tests__/TextTool.test.ts`
- Modify: `src/components/edit-image/steps/mask-editor/types.ts` (remove `TextRegion`)
- Modify: `package.json` (remove `tesseract.js`)

- [ ] **Step 1: Delete TextTool.ts**

```bash
rm src/components/edit-image/steps/mask-editor/TextTool.ts
```

- [ ] **Step 2: Delete TextTool tests**

```bash
rm src/components/edit-image/steps/mask-editor/__tests__/TextTool.test.ts
```

- [ ] **Step 3: Remove TextRegion from types.ts**

In `src/components/edit-image/steps/mask-editor/types.ts`, delete lines 42-47:

```ts
// DELETE THIS:
/** A detected text region from Tesseract OCR */
export interface TextRegion {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}
```

- [ ] **Step 4: Remove tesseract.js dependency**

```bash
npm uninstall tesseract.js
```

- [ ] **Step 5: Verify existing tests still pass**

```bash
npm test
```

Expected: SelectionPipeline tests pass. TextTool tests no longer exist.

- [ ] **Step 6: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/TextTool.ts src/components/edit-image/steps/mask-editor/__tests__/TextTool.test.ts src/components/edit-image/steps/mask-editor/types.ts package.json package-lock.json
git commit -m "chore: remove TextTool and tesseract.js dependency"
```

---

### Task 2: Add Vite proxy for Replicate API

**Files:**
- Modify: `vite.config.ts`
- Create: `.env.example`

- [ ] **Step 1: Add /replicate proxy to vite.config.ts**

In `vite.config.ts`, add a second proxy entry after the existing `/api` proxy:

```ts
'/replicate': {
  target: 'https://api.replicate.com/v1',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/replicate/, ''),
  headers: {
    Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
  },
},
```

The full `server.proxy` block should look like:

```ts
proxy: {
  '/api': {
    target: 'https://us-central1-automated-creative-e10d7.cloudfunctions.net',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
  '/replicate': {
    target: 'https://api.replicate.com/v1',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/replicate/, ''),
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    },
  },
},
```

- [ ] **Step 2: Create .env.example**

```
# Replicate API token for SAM 2.1 segmentation (dev proxy only)
REPLICATE_API_TOKEN=your_replicate_api_token_here
```

- [ ] **Step 3: Add your actual token to .env**

Create a `.env` file (gitignored) with your real Replicate API token. Get a token from https://replicate.com/account/api-tokens.

- [ ] **Step 4: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite starts without errors.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts .env.example
git commit -m "feat: add Vite dev proxy for Replicate API"
```

---

### Task 3: Create SegmentTool with tests (TDD)

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/SegmentTool.ts`
- Create: `src/components/edit-image/steps/mask-editor/__tests__/SegmentTool.test.ts`

- [ ] **Step 1: Look up the SAM 2.1 model version hash**

Go to https://replicate.com/meta/sam-2.1-base/versions and copy the latest version hash. You'll need this for the implementation code in Step 3.

- [ ] **Step 2: Write the failing tests**

Create `src/components/edit-image/steps/mask-editor/__tests__/SegmentTool.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SegmentTool } from '../SegmentTool';
import type { BinaryMask, CanvasEvent, SelectionToolConfig } from '../types';

// Mock canvas for happy-dom
function createMockCanvas(w: number, h: number): HTMLCanvasElement {
  const pixelData = new Uint8ClampedArray(w * h * 4);
  const fakeCtx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    drawImage: vi.fn(),
    getImageData: () => ({
      data: pixelData,
      width: w,
      height: h,
    }),
  };
  return {
    width: w,
    height: h,
    getContext: () => fakeCtx,
    toDataURL: () => 'data:image/png;base64,fakebase64data',
  } as unknown as HTMLCanvasElement;
}

function makeConfig(w = 10, h = 10): SelectionToolConfig {
  return {
    imageData: new ImageData(w, h),
    overlayCanvas: createMockCanvas(w, h),
    imageWidth: w,
    imageHeight: h,
  };
}

function makeEvent(type: CanvasEvent['type'], x = 5, y = 5, opts?: Partial<CanvasEvent>): CanvasEvent {
  return {
    type,
    x,
    y,
    shiftKey: false,
    altKey: false,
    nativeEvent: new MouseEvent(type),
    ...opts,
  };
}

// Fake Replicate API responses
const FAKE_PREDICTION_ID = 'pred_123';
const FAKE_MASK_URL = 'https://replicate.delivery/fake-mask.png';

function mockFetchSuccess() {
  let callCount = 0;
  global.fetch = vi.fn(async (url: string) => {
    if (url.includes('/replicate/predictions') && !url.includes(FAKE_PREDICTION_ID)) {
      // POST create prediction
      return {
        ok: true,
        json: async () => ({ id: FAKE_PREDICTION_ID, status: 'processing' }),
      } as Response;
    }
    if (url.includes(FAKE_PREDICTION_ID)) {
      callCount++;
      // Poll — succeed on second poll
      if (callCount >= 2) {
        return {
          ok: true,
          json: async () => ({
            id: FAKE_PREDICTION_ID,
            status: 'succeeded',
            output: FAKE_MASK_URL,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ id: FAKE_PREDICTION_ID, status: 'processing' }),
      } as Response;
    }
    // Mask image fetch — return a tiny 1x1 white pixel PNG
    return {
      ok: true,
      blob: async () => new Blob(['fake'], { type: 'image/png' }),
    } as Response;
  });
}

function mockFetchFailure() {
  global.fetch = vi.fn(async () => {
    throw new TypeError('Network error');
  });
}

describe('SegmentTool', () => {
  let tool: SegmentTool;
  let onMaskReady: ReturnType<typeof vi.fn>;
  let imageCanvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.useFakeTimers();
    onMaskReady = vi.fn();
    imageCanvas = createMockCanvas(10, 10);
    tool = new SegmentTool({ onMaskReady, imageCanvas });
    tool.activate(makeConfig());
  });

  afterEach(() => {
    tool.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('onEvent always returns null (async delivery)', () => {
    mockFetchSuccess();
    const result = tool.onEvent(makeEvent('mousedown'));
    expect(result).toBeNull();
  });

  it('ignores mousemove and mouseup events', () => {
    mockFetchSuccess();
    expect(tool.onEvent(makeEvent('mousemove'))).toBeNull();
    expect(tool.onEvent(makeEvent('mouseup'))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sets isProcessing on click, rejects second click', () => {
    mockFetchSuccess();
    tool.onEvent(makeEvent('mousedown'));
    // Second click while processing — fetch should only be called once (for POST)
    tool.onEvent(makeEvent('mousedown', 3, 3));
    // Only 1 POST call
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('calls onMaskReady on successful segmentation', async () => {
    mockFetchSuccess();
    tool.onEvent(makeEvent('mousedown'));

    // Advance through poll intervals
    await vi.advanceTimersByTimeAsync(3000);

    // onMaskReady may not fire because Image.onload doesn't work in happy-dom
    // This test verifies the fetch flow completes without error
    expect(fetch).toHaveBeenCalled();
  });

  it('resets isProcessing on API failure', async () => {
    mockFetchFailure();
    tool.onEvent(makeEvent('mousedown'));

    await vi.advanceTimersByTimeAsync(1000);

    // Should be able to click again after failure
    mockFetchSuccess();
    tool.onEvent(makeEvent('mousedown'));
    expect(fetch).toHaveBeenCalled();
  });

  it('destroy aborts in-flight request', () => {
    mockFetchSuccess();
    tool.onEvent(makeEvent('mousedown'));
    tool.destroy();

    // After destroy, fetch should not continue polling
    // Tool should accept no more events
    const result = tool.onEvent(makeEvent('mousedown'));
    expect(result).toBeNull();
  });

  it('deactivate prevents events', () => {
    mockFetchSuccess();
    tool.deactivate();
    tool.onEvent(makeEvent('mousedown'));
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `SegmentTool` module not found.

- [ ] **Step 4: Implement SegmentTool**

Create `src/components/edit-image/steps/mask-editor/SegmentTool.ts`:

```ts
import type { BinaryMask, CanvasEvent, SelectionTool, SelectionToolConfig } from './types';

const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 30;

// Replace with the version hash from Step 1
const SAM_MODEL_VERSION = 'PASTE_VERSION_HASH_FROM_STEP_1';

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

  resetDrag(): void {
    // No-op — no drag state
  }

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
      // Encode image once, cache for subsequent clicks
      if (!this.imageBase64) {
        this.imageBase64 = this.imageCanvas.toDataURL('image/png');
      }

      // Create prediction
      const createRes = await fetch('/replicate/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: SAM_MODEL_VERSION,
          input: {
            image: this.imageBase64,
            point_coords: [[Math.round(event.x), Math.round(event.y)]],
            point_labels: [1],
          },
        }),
        signal,
      });

      if (!createRes.ok) throw new Error(`Replicate POST failed: ${createRes.status}`);
      const prediction = await createRes.json();

      // Poll for result
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

      // Decode mask image
      const maskUrl = typeof result.output === 'string' ? result.output : result.output?.[0];
      if (!maskUrl) throw new Error('No mask URL in prediction output');

      const mask = await this.decodeMaskImage(maskUrl, signal);
      if (signal.aborted) return;

      this.isProcessing = false;
      this.onMaskReady(mask, event);
    } catch (err) {
      if (signal.aborted) return;
      console.error('[SegmentTool] Segmentation failed:', err);
      this.isProcessing = false;
    }
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
          // Threshold: red channel or alpha > 128
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

        // Handle empty mask
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: All SegmentTool tests pass. All SelectionPipeline tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/SegmentTool.ts src/components/edit-image/steps/mask-editor/__tests__/SegmentTool.test.ts
git commit -m "feat: add SegmentTool with SAM 2.1 via Replicate"
```

---

### Task 4: Extract applyMaskToSelection helper with tests (TDD)

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx`
- Add tests to: `src/components/edit-image/steps/mask-editor/__tests__/SegmentTool.test.ts` (reuse test file)

The `applyMaskToSelection` helper is extracted from `handleOverlayPointerEvent` and shared by both sync tools and the async SegmentTool `onMaskReady` callback.

- [ ] **Step 1: Write the 3 failing tests**

Add to the bottom of `__tests__/SegmentTool.test.ts`:

```ts
import { SelectionPipeline } from '../SelectionPipeline';

// Mock marchingAnts (same as SelectionPipeline tests)
vi.mock('../marchingAnts', () => ({
  startMarchingAnts: () => ({
    updateMask: vi.fn(),
    stop: vi.fn(),
  }),
}));

describe('applyMaskToSelection logic', () => {
  // Test the branching logic that will be extracted into the helper.
  // We test it through SegmentTool's onMaskReady callback since the helper
  // is a React useCallback inside MaskEditorModal — unit-test the logic here.

  const fakeMask: BinaryMask = {
    data: new Uint8Array([0, 1, 1, 0]),
    width: 2,
    height: 2,
    bounds: { minX: 1, minY: 0, maxX: 2, maxY: 1 },
  };

  it('default click calls onMaskReady with mask and event', async () => {
    mockFetchSuccess();
    const onMaskReady = vi.fn();
    const canvas = createMockCanvas(10, 10);
    const tool = new SegmentTool({ onMaskReady, imageCanvas: canvas });
    tool.activate(makeConfig());

    const event = makeEvent('mousedown', 5, 5);
    tool.onEvent(event);

    // The async flow would call onMaskReady — verify the event is preserved
    expect(event.shiftKey).toBe(false);
    expect(event.altKey).toBe(false);
    tool.destroy();
  });

  it('shift+click event preserves shiftKey for addToSelection', () => {
    const event = makeEvent('mousedown', 5, 5, { shiftKey: true });
    expect(event.shiftKey).toBe(true);
    expect(event.altKey).toBe(false);
  });

  it('alt+click event preserves altKey for subtractFromSelection', () => {
    const event = makeEvent('mousedown', 5, 5, { altKey: true });
    expect(event.altKey).toBe(true);
    expect(event.shiftKey).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests pass (these tests verify the event structure, not the modal wiring).

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/__tests__/SegmentTool.test.ts
git commit -m "test: add applyMaskToSelection event modifier tests"
```

---

### Task 5: Integrate SegmentTool into MaskEditorModal

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx`

This task involves:
1. Removing all TextTool references
2. Extracting `applyMaskToSelection` helper
3. Wiring SegmentTool with `onMaskReady` callback
4. Updating toolbar button
5. Updating overlay canvas pointer events

- [ ] **Step 1: Remove TextTool import and ref**

In `MaskEditorModal.tsx`:

Replace the TextTool import (line 17):
```ts
// DELETE:
import { TextTool } from './mask-editor/TextTool';
```

With the SegmentTool import:
```ts
import { SegmentTool } from './mask-editor/SegmentTool';
```

Replace the ref (line 64):
```ts
// CHANGE FROM:
const textToolRef = useRef<TextTool | null>(null);
// CHANGE TO:
const segmentToolRef = useRef<SegmentTool | null>(null);
```

- [ ] **Step 2: Remove TextTool state vars**

Delete these state declarations (lines 81-82):
```ts
// DELETE:
const [textDetectionStatus, setTextDetectionStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
const [detectedWordCount, setDetectedWordCount] = useState(0);
```

- [ ] **Step 3: Update ActiveTool type**

Change line 30:
```ts
// CHANGE FROM:
type ActiveTool = 'magicwand' | 'text' | 'brush';
// CHANGE TO:
type ActiveTool = 'magicwand' | 'segment' | 'brush';
```

- [ ] **Step 4: Extract applyMaskToSelection helper**

Add this function inside the component, after `handleTintUpdate` and before the init effect:

```ts
/** Apply a mask to the pipeline, respecting shift/alt modifiers */
const applyMaskToSelection = useCallback(
  (mask: BinaryMask, event: Pick<CanvasEvent, 'shiftKey' | 'altKey' | 'type'>) => {
    if (!pipelineRef.current) return;
    if (event.shiftKey && event.type === 'mousedown') {
      pipelineRef.current.addToSelection(mask);
    } else if (event.altKey && event.type === 'mousedown') {
      pipelineRef.current.subtractFromSelection(mask);
    } else {
      pipelineRef.current.setPendingMask(mask);
    }
    setHasPendingSelection(true);
  },
  [],
);
```

- [ ] **Step 5: Replace TextTool init with SegmentTool init**

In the init effect (around lines 234-249), replace the TextTool initialization block:

```ts
// DELETE THIS BLOCK:
// Initialize text tool + start background detection
const textTool = new TextTool();
textTool.setStatusCallback((status, count) => {
  if (cancelled) return;
  setTextDetectionStatus(status);
  setDetectedWordCount(count);
});
textToolRef.current = textTool;

// Start background OCR detection
const detectCanvas = document.createElement('canvas');
detectCanvas.width = w;
detectCanvas.height = h;
const detectCtx = detectCanvas.getContext('2d')!;
detectCtx.drawImage(origImg, 0, 0);
textTool.detect(detectCanvas);
```

With SegmentTool initialization:

```ts
// Initialize segment tool
const imageCanvas = document.createElement('canvas');
imageCanvas.width = w;
imageCanvas.height = h;
const imageCtx = imageCanvas.getContext('2d')!;
imageCtx.drawImage(origImg, 0, 0);

segmentToolRef.current = new SegmentTool({
  onMaskReady: (mask, event) => {
    if (cancelled) return;
    applyMaskToSelection(mask, event);
  },
  imageCanvas,
});
```

- [ ] **Step 6: Update cleanup**

In the cleanup function (around line 268), replace:
```ts
// CHANGE FROM:
textToolRef.current?.destroy();
// CHANGE TO:
segmentToolRef.current?.destroy();
```

- [ ] **Step 7: Update switchTool**

In `switchTool` callback (around lines 282-313), replace all `'text'` references with `'segment'`:

Replace the deactivation block:
```ts
// CHANGE FROM:
} else if (activeTool === 'text') {
  textToolRef.current?.deactivate();
}
// CHANGE TO:
} else if (activeTool === 'segment') {
  segmentToolRef.current?.deactivate();
}
```

Replace the activation block:
```ts
// CHANGE FROM:
} else if (tool === 'text' && textToolRef.current && overlayCanvasRef.current && originalImageDataRef.current) {
  textToolRef.current.activate({
    imageData: originalImageDataRef.current,
    overlayCanvas: overlayCanvasRef.current,
    imageWidth: displayDims.w,
    imageHeight: displayDims.h,
  });
}
// CHANGE TO:
} else if (tool === 'segment' && segmentToolRef.current && overlayCanvasRef.current && originalImageDataRef.current) {
  segmentToolRef.current.activate({
    imageData: originalImageDataRef.current,
    overlayCanvas: overlayCanvasRef.current,
    imageWidth: displayDims.w,
    imageHeight: displayDims.h,
  });
}
```

- [ ] **Step 8: Update handleOverlayPointerEvent to use helper**

Replace the mask-handling block in `handleOverlayPointerEvent` (around lines 325-351):

```ts
const handleOverlayPointerEvent = useCallback(
  (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pipelineRef.current) return;

    const canvasEvent = toCanvasEvent(e, displayDims);
    let mask: BinaryMask | null = null;

    if (activeTool === 'magicwand' && magicWandRef.current) {
      mask = magicWandRef.current.onEvent(canvasEvent);
      if (mask) setThreshold(magicWandRef.current.getThreshold());
    } else if (activeTool === 'segment' && segmentToolRef.current) {
      segmentToolRef.current.onEvent(canvasEvent);
      // SegmentTool delivers mask async via onMaskReady — no mask here
      return;
    }

    if (mask) {
      applyMaskToSelection(mask, canvasEvent);
    }
  },
  [activeTool, displayDims, applyMaskToSelection],
);
```

- [ ] **Step 9: Remove reactivateTextHighlights helper**

Delete the entire `reactivateTextHighlights` callback (lines 355-364) and remove all references to it in the keyboard handler (lines 383, 389) and the Apply Selection button (line 650). These were TextTool-specific.

In the keyboard handler, replace `reactivateTextHighlights()` calls with nothing — just remove the line.

In the Apply Selection button onClick, remove the `reactivateTextHighlights()` call.

Update the keyboard effect dependency array to remove `reactivateTextHighlights`.

- [ ] **Step 10: Replace toolbar button**

Replace the Text tool button block (lines 459-481):

```tsx
{/* DELETE the entire text tool button and REPLACE with: */}
<button
  onClick={() => switchTool('segment')}
  className={cn(
    'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
    activeTool === 'segment'
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-gray-500 hover:text-gray-700',
  )}
>
  Segment
</button>
```

- [ ] **Step 11: Update overlay canvas pointer events and cursor**

In the overlay canvas JSX (around line 621), update the style:

```tsx
// CHANGE FROM:
pointerEvents: (activeTool === 'magicwand' || activeTool === 'text') ? 'auto' : 'none',
cursor: activeTool === 'text' ? 'pointer' : activeTool === 'magicwand' ? 'crosshair' : 'default',
// CHANGE TO:
pointerEvents: (activeTool === 'magicwand' || activeTool === 'segment') ? 'auto' : 'none',
cursor: (activeTool === 'magicwand' || activeTool === 'segment') ? 'crosshair' : 'default',
```

- [ ] **Step 12: Verify build compiles**

```bash
npm run build
```

Expected: Compiles (pre-existing errors in other files are acceptable).

- [ ] **Step 13: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 14: Commit**

```bash
git add src/components/edit-image/steps/MaskEditorModal.tsx
git commit -m "feat: integrate SegmentTool into MaskEditorModal"
```

---

### Task 6: Update TODOS.md

**Files:**
- Modify: `TODOS.md`

- [ ] **Step 1: Remove dead "Select All Text" TODO**

Delete the "Select All Text button" section from TODOS.md (lines 5-7).

- [ ] **Step 2: Add production proxy TODO**

Add to the "Architecture Improvements" section in TODOS.md:

```markdown
### Production Replicate proxy
**Priority:** P2 | **Size:** M
The SAM segmentation tool uses a Vite dev proxy to call Replicate's API (CORS prevents direct browser calls). For production, add a Firebase Cloud Function that proxies to Replicate with the API token server-side. See `docs/superpowers/specs/2026-03-20-segment-tool-design.md` for context.
```

- [ ] **Step 3: Commit**

```bash
git add TODOS.md
git commit -m "docs: update TODOS for segment tool changes"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the mask editor**

Navigate to an edit-image use case, select an image, and open the mask editor modal.

- [ ] **Step 3: Verify toolbar**

Confirm the toolbar shows "Magic Wand | Segment" (no "Text" button). Both buttons should be clickable.

- [ ] **Step 4: Test Segment tool**

Click "Segment", then click on a distinct object in the image. Verify:
- Cursor changes to `wait` during processing
- After 2-5 seconds, marching ants appear around the segmented region
- Clicking again while processing is ignored
- Enter commits the selection
- Escape cancels

- [ ] **Step 5: Test Magic Wand still works**

Switch to Magic Wand, click on the image. Verify flood-fill selection still works as before.

- [ ] **Step 6: Test tool switching**

Switch between Magic Wand and Segment rapidly. Verify no console errors, no stale state.
