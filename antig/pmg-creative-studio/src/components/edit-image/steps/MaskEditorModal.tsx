import { useEffect, useRef, useState, useCallback } from 'react';
import { XMarkIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { proxyUrl } from '../utils/proxyUrl';
import { applyMaskToAlpha } from '../utils/applyMaskToAlpha';

interface MaskEditorModalProps {
  originalImageUrl: string;
  extractedImageUrl: string;
  maskDataUrl?: string;
  onConfirm: (refinedImageUrl: string, maskDataUrl: string) => void;
  onCancel: () => void;
}

type BrushMode = 'keep' | 'erase';

// Max display dimensions for the canvas element within the modal
const MAX_DISPLAY_WIDTH = 800;
const MAX_DISPLAY_HEIGHT = 550;
const MIN_ZOOM_FACTOR = 0.5;  // Allow zooming out to 50% of fit scale
const MAX_ZOOM = 4;

// ── Module-level helpers ──────────────────────────────────────────────

/** Load an image element, optionally with crossOrigin for CORS-safe pixel access */
function loadImg(url: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors && url.startsWith('http')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

/** Helper: canvas.toBlob() as a Promise */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert canvas to blob'));
    }, 'image/png');
  });
}

/**
 * Build initial mask canvas + red tint overlay from the extracted foreground's alpha.
 * Case B in the spec: first edit after API extraction.
 */
async function buildMaskFromAlpha(
  extractedImg: HTMLImageElement,
  w: number,
  h: number,
): Promise<{ maskCanvas: HTMLCanvasElement; tintBlobUrl: string }> {
  const readCanvas = document.createElement('canvas');
  readCanvas.width = w;
  readCanvas.height = h;
  const readCtx = readCanvas.getContext('2d')!;
  readCtx.drawImage(extractedImg, 0, 0, w, h);
  const extractedData = readCtx.getImageData(0, 0, w, h);
  const pixels = extractedData.data;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskData = maskCtx.createImageData(w, h);
  const maskPixels = maskData.data;

  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = w;
  tintCanvas.height = h;
  const tintCtx = tintCanvas.getContext('2d')!;
  const tintData = tintCtx.createImageData(w, h);
  const tintPixels = tintData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    maskPixels[i] = alpha;
    maskPixels[i + 1] = alpha;
    maskPixels[i + 2] = alpha;
    maskPixels[i + 3] = 255;
    tintPixels[i] = 255;
    tintPixels[i + 1] = 0;
    tintPixels[i + 2] = 0;
    tintPixels[i + 3] = Math.round((1 - alpha / 255) * 102);
  }

  maskCtx.putImageData(maskData, 0, 0);
  tintCtx.putImageData(tintData, 0, 0);

  const tintBlob = await canvasToBlob(tintCanvas);
  const tintBlobUrl = URL.createObjectURL(tintBlob);
  return { maskCanvas, tintBlobUrl };
}

/**
 * Build initial mask canvas + red tint overlay from a saved mask data URL.
 * Case A in the spec: re-editing.
 */
async function buildMaskFromSaved(
  maskImg: HTMLImageElement,
  w: number,
  h: number,
): Promise<{ maskCanvas: HTMLCanvasElement; tintBlobUrl: string }> {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.drawImage(maskImg, 0, 0, w, h);
  const maskData = maskCtx.getImageData(0, 0, w, h);
  const maskPixels = maskData.data;

  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = w;
  tintCanvas.height = h;
  const tintCtx = tintCanvas.getContext('2d')!;
  const tintData = tintCtx.createImageData(w, h);
  const tintPixels = tintData.data;

  for (let i = 0; i < maskPixels.length; i += 4) {
    const luminance = maskPixels[i];
    tintPixels[i] = 255;
    tintPixels[i + 1] = 0;
    tintPixels[i + 2] = 0;
    tintPixels[i + 3] = Math.round((1 - luminance / 255) * 102);
  }

  tintCtx.putImageData(tintData, 0, 0);
  const tintBlob = await canvasToBlob(tintCanvas);
  const tintBlobUrl = URL.createObjectURL(tintBlob);
  return { maskCanvas, tintBlobUrl };
}

/**
 * Mirror a Fabric path object onto the hidden mask canvas.
 * Uses custom `data.maskMode` tag instead of brittle color string matching.
 */
function mirrorPathToMask(
  fabricPath: any,
  maskCanvas: HTMLCanvasElement,
): void {
  const ctx = maskCanvas.getContext('2d')!;
  const isKeep = fabricPath.data?.maskMode === 'keep';
  const opacity = fabricPath.opacity ?? 1;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = isKeep ? `rgba(255,255,255,${opacity})`
                           : `rgba(0,0,0,${opacity})`;
  ctx.lineWidth = fabricPath.strokeWidth || 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const left = fabricPath.left ?? 0;
  const top = fabricPath.top ?? 0;
  const offsetX = fabricPath.pathOffset?.x ?? 0;
  const offsetY = fabricPath.pathOffset?.y ?? 0;
  ctx.translate(left - offsetX, top - offsetY);

  const pathStr = fabricPath.path?.map((seg: any[]) => seg.join(' ')).join(' ') || '';
  const path2D = new Path2D(pathStr);
  ctx.stroke(path2D);
  ctx.restore();
}

/** Update brush appearance based on mode, size, opacity */
function updateBrush(
  canvas: any,
  mode: BrushMode,
  size: number,
  opacity: number,
): void {
  if (!canvas?.freeDrawingBrush) return;
  const normalizedOpacity = opacity / 100;
  canvas.freeDrawingBrush.color = mode === 'keep'
    ? `rgba(0, 255, 0, ${normalizedOpacity * 0.5})`
    : `rgba(255, 0, 0, ${normalizedOpacity * 0.4})`;
  canvas.freeDrawingBrush.width = size;
}

/** Setup brush cursor — a custom Fabric Circle that follows the mouse */
function setupBrushCursor(canvas: any, fabric: any): any {
  const cursor = new fabric.Circle({
    radius: 10,
    fill: 'transparent',
    stroke: 'rgba(255,0,0,0.6)',
    strokeWidth: 1.5,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    excludeFromExport: true,
  });
  cursor.set('visible', false);
  canvas.add(cursor);

  canvas.defaultCursor = 'none';
  canvas.freeDrawingCursor = 'none';

  canvas.on('mouse:move', (e: any) => {
    // Use getScenePoint to get coordinates in natural (scene) space,
    // which accounts for Fabric's zoom/pan viewport transform
    const pointer = canvas.getScenePoint(e.e);
    cursor.set({ left: pointer.x, top: pointer.y, visible: true });
    cursor.bringToFront();
    canvas.renderAll();
  });

  canvas.on('mouse:out', () => {
    cursor.set('visible', false);
    canvas.renderAll();
  });

  return cursor;
}

/** Update brush cursor appearance to match current mode and size */
function updateBrushCursor(cursor: any, mode: BrushMode, size: number): void {
  if (!cursor) return;
  cursor.set({
    radius: size / 2,
    stroke: mode === 'keep' ? 'rgba(0,255,0,0.6)' : 'rgba(255,0,0,0.6)',
  });
}

// ── Component ─────────────────────────────────────────────────────────

export function MaskEditorModal({
  originalImageUrl,
  extractedImageUrl,
  maskDataUrl: savedMaskDataUrl,
  onConfirm,
  onCancel,
}: MaskEditorModalProps) {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const fabricModuleRef = useRef<any>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialMaskRef = useRef<ImageData | null>(null);
  const cursorRef = useRef<any>(null);
  const currentBrushModeRef = useRef<BrushMode>('erase');

  const [brushMode, setBrushMode] = useState<BrushMode>('erase');
  const [brushSize, setBrushSize] = useState(20);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [canApply, setCanApply] = useState(true);
  const [zoomPercent, setZoomPercent] = useState(100);

  // Track natural image dimensions and the fit-to-view scale
  const imageDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const fitScaleRef = useRef(1);
  // Track display canvas element dimensions
  const displayDimsRef = useRef<{ dw: number; dh: number }>({ dw: MAX_DISPLAY_WIDTH, dh: MAX_DISPLAY_HEIGHT });

  // ── Zoom helpers ────────────────────────────────────────────────────

  const zoomTo = useCallback((targetZoom: number, centerX?: number, centerY?: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const fitScale = fitScaleRef.current;
    const clamped = Math.max(fitScale * MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM, targetZoom));

    const F = fabricModuleRef.current;
    if (!F) return;
    if (centerX !== undefined && centerY !== undefined) {
      canvas.zoomToPoint(new F.Point(centerX, centerY), clamped);
    } else {
      const { dw, dh } = displayDimsRef.current;
      canvas.zoomToPoint(new F.Point(dw / 2, dh / 2), clamped);
    }
    canvas.renderAll();
    setZoomPercent(Math.round((clamped / fitScale) * 100));
  }, []);

  const handleFitToView = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const fitScale = fitScaleRef.current;
    // Reset viewport: zoom to fitScale, centered at origin
    canvas.setViewportTransform([fitScale, 0, 0, fitScale, 0, 0]);
    canvas.renderAll();
    setZoomPercent(100);
  }, []);

  // ── Init effect ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    let tintBlobUrl = '';

    const init = async () => {
      try {
        const origImg = await loadImg(proxyUrl(originalImageUrl), true);
        if (cancelled) return;

        const w = origImg.naturalWidth;
        const h = origImg.naturalHeight;
        imageDimsRef.current = { w, h };

        // Calculate fit-to-view scale: natural image → display element
        const fitScale = Math.min(MAX_DISPLAY_WIDTH / w, MAX_DISPLAY_HEIGHT / h, 1);
        fitScaleRef.current = fitScale;

        // Display dimensions = what the canvas element is in the DOM
        const displayW = Math.round(w * fitScale);
        const displayH = Math.round(h * fitScale);
        displayDimsRef.current = { dw: displayW, dh: displayH };

        // Build mask canvas + tint
        let maskCanvas: HTMLCanvasElement;
        if (savedMaskDataUrl) {
          const maskImg = await loadImg(savedMaskDataUrl);
          if (cancelled) return;
          ({ maskCanvas, tintBlobUrl } = await buildMaskFromSaved(maskImg, w, h));
        } else {
          const extractedImg = await loadImg(proxyUrl(extractedImageUrl), true);
          if (cancelled) return;
          ({ maskCanvas, tintBlobUrl } = await buildMaskFromAlpha(extractedImg, w, h));
        }

        maskCanvasRef.current = maskCanvas;
        const maskCtx = maskCanvas.getContext('2d')!;
        initialMaskRef.current = maskCtx.getImageData(0, 0, w, h);

        // Initialize Fabric.js — canvas element at DISPLAY dimensions
        const fabric = await import('fabric');
        if (cancelled || !displayCanvasRef.current) return;
        fabricModuleRef.current = fabric;

        const canvas = new fabric.Canvas(displayCanvasRef.current, {
          isDrawingMode: true,
          width: displayW,
          height: displayH,
          selection: false,
        });
        fabricRef.current = canvas;

        // Use Fabric's native zoom instead of CSS transform.
        // This ensures pointer coordinates are correctly mapped from
        // screen space → natural image coordinates.
        canvas.setZoom(fitScale);

        // Layer 1: Original image as background (at natural dimensions — Fabric zooms it)
        const bgFabric = new fabric.FabricImage(origImg);
        canvas.backgroundImage = bgFabric;

        // Layer 2: Red tint overlay
        const tintImg = await loadImg(tintBlobUrl);
        if (cancelled) return;
        const tintFabric = new fabric.FabricImage(tintImg);
        tintFabric.set({ selectable: false, evented: false });
        canvas.add(tintFabric);

        // Configure brush
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = brushSize;
        updateBrush(canvas, 'erase', brushSize, brushOpacity);

        // Brush cursor
        const cursor = setupBrushCursor(canvas, fabric);
        cursorRef.current = cursor;
        updateBrushCursor(cursor, 'erase', brushSize);

        // Mouse wheel zoom
        canvas.on('mouse:wheel', (opt: any) => {
          const e = opt.e as WheelEvent;
          e.preventDefault();
          e.stopPropagation();

          const currentZoom = canvas.getZoom();
          // Smooth zoom: multiply by a factor based on scroll delta
          const zoomFactor = 0.999 ** e.deltaY;
          const newZoom = Math.max(
            fitScale * MIN_ZOOM_FACTOR,
            Math.min(MAX_ZOOM, currentZoom * zoomFactor),
          );

          canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), newZoom);
          canvas.renderAll();
          setZoomPercent(Math.round((newZoom / fitScale) * 100));
        });

        // Stroke mirroring: path:created → tag + mirror to mask canvas
        canvas.on('path:created', (e: any) => {
          const path = e.path;
          if (!path || !maskCanvasRef.current) return;

          path.data = { maskMode: currentBrushModeRef.current };

          const mc = maskCanvasRef.current;
          if (mc.width !== w || mc.height !== h) {
            console.error('Mask canvas dimension mismatch — disabling Apply');
            setCanApply(false);
            return;
          }

          mirrorPathToMask(path, mc);
        });

        canvas.renderAll();
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize editor');
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (tintBlobUrl) URL.revokeObjectURL(tintBlobUrl);
      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Brush control effects ─────────────────────────────────────────

  useEffect(() => {
    currentBrushModeRef.current = brushMode;
    if (fabricRef.current) {
      updateBrush(fabricRef.current, brushMode, brushSize, brushOpacity);
      updateBrushCursor(cursorRef.current, brushMode, brushSize);
    }
  }, [brushMode, brushSize, brushOpacity]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'x' || e.key === 'X') {
        setBrushMode(prev => prev === 'keep' ? 'erase' : 'keep');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      // Cmd+0 / Ctrl+0 to fit to view
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        handleFitToView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFitToView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Undo ──────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    const canvas = fabricRef.current;
    const mc = maskCanvasRef.current;
    if (!canvas || !mc || !initialMaskRef.current) return;

    const objects = canvas.getObjects();
    const paths = objects.filter((o: any) => o.type === 'path');
    if (paths.length === 0) return;

    const lastPath = paths[paths.length - 1];
    canvas.remove(lastPath);
    canvas.renderAll();

    const maskCtx = mc.getContext('2d')!;
    maskCtx.putImageData(initialMaskRef.current, 0, 0);

    const remainingPaths = paths.slice(0, -1);
    for (const path of remainingPaths) {
      mirrorPathToMask(path, mc);
    }
  }, []);

  // ── Apply refinement ──────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!maskCanvasRef.current) return;
    setIsApplying(true);
    setError(null);

    try {
      const maskDataUrl = maskCanvasRef.current.toDataURL('image/png');
      const refinedForeground = await applyMaskToAlpha(
        proxyUrl(originalImageUrl),
        maskCanvasRef.current,
      );
      onConfirm(refinedForeground, maskDataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply refinement');
      setIsApplying(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[880px] w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
            Refine Selection
          </h3>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
          {/* Brush mode toggle */}
          <div className="flex p-1 bg-gray-200 rounded-xl">
            {(['keep', 'erase'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBrushMode(mode)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                  brushMode === mode
                    ? mode === 'keep'
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'bg-red-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {mode === 'keep' ? 'Keep' : 'Erase'}
              </button>
            ))}
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Size</span>
            <input
              type="range"
              min={5}
              max={80}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-24 accent-blue-600"
            />
            <span className="text-[9px] font-bold text-gray-400 w-6 text-right">{brushSize}</span>
          </div>

          {/* Brush opacity */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Opacity</span>
            <input
              type="range"
              min={1}
              max={100}
              value={brushOpacity}
              onChange={(e) => setBrushOpacity(Number(e.target.value))}
              className="w-24 accent-blue-600"
            />
            <span className="text-[9px] font-bold text-gray-400 w-8 text-right">{brushOpacity}%</span>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => zoomTo((fabricRef.current?.getZoom() ?? fitScaleRef.current) / 1.25)}
              className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all"
              title="Zoom out"
            >
              <MagnifyingGlassMinusIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleFitToView}
              className="rounded-lg px-2 py-0.5 text-[9px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-200 transition-all"
              title="Fit to view (⌘0)"
            >
              {zoomPercent}%
            </button>
            <button
              onClick={() => zoomTo((fabricRef.current?.getZoom() ?? fitScaleRef.current) * 1.25)}
              className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all"
              title="Zoom in"
            >
              <MagnifyingGlassPlusIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Keyboard hints */}
          <div className="flex items-center gap-2 text-[8px] text-gray-400 font-bold uppercase tracking-widest">
            <span>X: toggle</span>
            <span>⌘Z: undo</span>
            <span>Scroll: zoom</span>
          </div>
        </div>

        {/* Canvas area — no CSS transform wrapper, Fabric handles zoom natively */}
        <div className="flex items-center justify-center p-6 bg-gray-100 overflow-hidden"
             style={{ minHeight: '400px' }}>
          {isLoading && !error && (
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
              Loading editor...
            </p>
          )}
          {error && !isLoading && (
            <div className="text-center space-y-2">
              <p className="text-[10px] font-bold text-red-500">{error}</p>
              <p className="text-[9px] text-gray-400">Check network connection and try again</p>
            </div>
          )}
          <div className={cn(isLoading && 'hidden')}>
            <canvas
              ref={displayCanvasRef}
              className="rounded-xl shadow-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-6 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-gray-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isApplying || !canApply}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-40"
          >
            {isApplying ? 'Applying...' : 'Apply Refinement'}
          </button>
        </div>
      </div>
    </div>
  );
}
