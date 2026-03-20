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
  // SegmentTool does not read imageData — use a minimal stub to satisfy the type
  const imageData = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as unknown as ImageData;
  return {
    imageData,
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

const FAKE_PREDICTION_ID = 'pred_123';
const FAKE_MASK_URL = 'https://replicate.delivery/fake-mask.png';

function mockFetchSuccess() {
  let callCount = 0;
  global.fetch = vi.fn(async (url: string) => {
    if (url.includes('/replicate/predictions') && !url.includes(FAKE_PREDICTION_ID)) {
      return {
        ok: true,
        json: async () => ({ id: FAKE_PREDICTION_ID, status: 'processing' }),
      } as Response;
    }
    if (url.includes(FAKE_PREDICTION_ID)) {
      callCount++;
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
    tool.onEvent(makeEvent('mousedown', 3, 3));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('calls onMaskReady on successful segmentation', async () => {
    mockFetchSuccess();
    tool.onEvent(makeEvent('mousedown'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalled();
  });

  it('resets isProcessing on API failure', async () => {
    mockFetchFailure();
    tool.onEvent(makeEvent('mousedown'));
    await vi.advanceTimersByTimeAsync(1000);
    mockFetchSuccess();
    tool.onEvent(makeEvent('mousedown'));
    expect(fetch).toHaveBeenCalled();
  });

  it('destroy aborts in-flight request', () => {
    mockFetchSuccess();
    tool.onEvent(makeEvent('mousedown'));
    tool.destroy();
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
