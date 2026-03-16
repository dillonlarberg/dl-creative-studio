import { useEffect, useRef, useState, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { proxyUrl } from '../utils/proxyUrl';
import { applyMaskToAlpha } from '../utils/applyMaskToAlpha';

import type { BrushMode, CanvasEvent, DisplayDims } from './mask-editor/types';
import {
  loadImg,
  buildMaskFromAlpha,
  buildMaskFromSaved,
  regenerateTint,
} from './mask-editor/maskUtils';
import { SelectionPipeline } from './mask-editor/SelectionPipeline';
import { MagicWandTool } from './mask-editor/MagicWandTool';
import { BrushTool } from './mask-editor/BrushTool';

interface MaskEditorModalProps {
  originalImageUrl: string;
  extractedImageUrl: string;
  maskDataUrl?: string;
  onConfirm: (refinedImageUrl: string, maskDataUrl: string) => void;
  onCancel: () => void;
}

const MAX_DISPLAY_WIDTH = 800;
const MAX_DISPLAY_HEIGHT = 550;

type ActiveTool = 'magicwand' | 'brush';

export function MaskEditorModal({
  originalImageUrl,
  extractedImageUrl,
  maskDataUrl: savedMaskDataUrl,
  onConfirm,
  onCancel,
}: MaskEditorModalProps) {
  // Canvas refs
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Tool refs
  const pipelineRef = useRef<SelectionPipeline | null>(null);
  const magicWandRef = useRef<MagicWandTool | null>(null);
  const brushToolRef = useRef<BrushTool | null>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);
  const tintBlobUrlRef = useRef<string | null>(null);
  const tintObjRef = useRef<any>(null);
  const initialMaskRef = useRef<ImageData | null>(null);

  // UI state
  const [activeTool, setActiveTool] = useState<ActiveTool>('magicwand');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [brushMode, setBrushMode] = useState<BrushMode>('erase');
  const [brushSize, setBrushSize] = useState(20);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [threshold, setThreshold] = useState(15);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [canApply] = useState(true);
  const [hasPendingSelection, setHasPendingSelection] = useState(false);
  const [displayDims, setDisplayDims] = useState<DisplayDims>({
    w: 0,
    h: 0,
    fitScale: 1,
    displayW: MAX_DISPLAY_WIDTH,
    displayH: MAX_DISPLAY_HEIGHT,
  });

  // ── Tint update callback ──────────────────────────────────────────

  const handleTintUpdate = useCallback(async () => {
    if (!maskCanvasRef.current || !fabricRef.current) return;
    const canvas = fabricRef.current;

    if (tintBlobUrlRef.current) URL.revokeObjectURL(tintBlobUrlRef.current);

    const newTintUrl = await regenerateTint(maskCanvasRef.current);
    tintBlobUrlRef.current = newTintUrl;

    if (tintObjRef.current) {
      canvas.remove(tintObjRef.current);
    }

    const { FabricImage } = await import('fabric');
    const tintImg = await loadImg(newTintUrl);
    const fabricTint = new FabricImage(tintImg, {
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
    });
    canvas.add(fabricTint);
    tintObjRef.current = fabricTint;

    // Ensure tint is above background (index 0) but below brush strokes
    const objects = canvas.getObjects();
    if (objects.length > 1) {
      canvas.moveTo(fabricTint, 0);
    }
    canvas.renderAll();
  }, []);

  // ── Init effect ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const origImg = await loadImg(proxyUrl(originalImageUrl), true);
        if (cancelled) return;

        const w = origImg.naturalWidth;
        const h = origImg.naturalHeight;

        const fitScale = Math.min(MAX_DISPLAY_WIDTH / w, MAX_DISPLAY_HEIGHT / h, 1);
        const displayW = Math.round(w * fitScale);
        const displayH = Math.round(h * fitScale);
        setDisplayDims({ w, h, fitScale, displayW, displayH });

        // Build mask canvas + tint
        let maskCanvas: HTMLCanvasElement;
        let tintBlobUrl: string;
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
        tintBlobUrlRef.current = tintBlobUrl;
        const maskCtx = maskCanvas.getContext('2d')!;
        initialMaskRef.current = maskCtx.getImageData(0, 0, w, h);

        // Cache original image data for selection tools
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(origImg, 0, 0);
        originalImageDataRef.current = tempCtx.getImageData(0, 0, w, h);

        // Wait for DOM reflow
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (cancelled || !displayCanvasRef.current) return;

        // Initialize Fabric.js
        const fabric = await import('fabric');
        if (cancelled || !displayCanvasRef.current) return;

        const canvas = new fabric.Canvas(displayCanvasRef.current, {
          isDrawingMode: false, // Magic wand is default, not brush
          width: w,
          height: h,
          selection: false,
        });
        fabricRef.current = canvas;

        // Background image
        const bgFabric = new fabric.FabricImage(origImg);
        bgFabric.set({ left: 0, top: 0, originX: 'left', originY: 'top' });
        canvas.backgroundImage = bgFabric;

        // Tint overlay
        const tintImg = await loadImg(tintBlobUrl);
        if (cancelled) return;
        const tintFabric = new fabric.FabricImage(tintImg);
        tintFabric.set({
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top',
          selectable: false,
          evented: false,
        });
        canvas.add(tintFabric);
        tintObjRef.current = tintFabric;

        // Initialize selection pipeline
        if (overlayCanvasRef.current) {
          pipelineRef.current = new SelectionPipeline({
            overlayCanvas: overlayCanvasRef.current,
            maskCanvas,
            initialMaskData: maskCtx.getImageData(0, 0, w, h),
            onTintUpdate: handleTintUpdate,
          });
        }

        // Initialize magic wand tool
        magicWandRef.current = new MagicWandTool();
        magicWandRef.current.activate(originalImageDataRef.current!);

        // Initialize brush tool (created but NOT activated)
        brushToolRef.current = new BrushTool({
          fabricCanvas: canvas,
          maskCanvas,
          initialMaskData: initialMaskRef.current!,
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
      pipelineRef.current?.destroy();
      magicWandRef.current?.deactivate();
      brushToolRef.current?.deactivate();
      if (tintBlobUrlRef.current) URL.revokeObjectURL(tintBlobUrlRef.current);
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
      maskCanvasRef.current = null;
      initialMaskRef.current = null;
      tintObjRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tool switching ────────────────────────────────────────────────

  const switchTool = useCallback(
    (tool: ActiveTool) => {
      if (tool === activeTool) return;

      // Cancel any pending selection
      pipelineRef.current?.cancel();
      setHasPendingSelection(false);

      if (activeTool === 'brush') {
        brushToolRef.current?.deactivate();
        // Snapshot mask so pipeline undo doesn't cross brush work
        pipelineRef.current?.snapshotInitialMask();
      }

      if (tool === 'brush') {
        brushToolRef.current?.activate(brushMode, brushSize, brushOpacity);
      }

      setActiveTool(tool);
    },
    [activeTool, brushMode, brushSize, brushOpacity],
  );

  // ── Brush settings sync ───────────────────────────────────────────

  useEffect(() => {
    if (activeTool === 'brush' && brushToolRef.current) {
      brushToolRef.current.updateSettings(brushMode, brushSize, brushOpacity);
    }
  }, [brushMode, brushSize, brushOpacity, activeTool]);

  // ── Overlay canvas event handling (magic wand) ────────────────────

  const handleOverlayPointerEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool !== 'magicwand' || !magicWandRef.current || !pipelineRef.current) return;

      const canvasEvent: CanvasEvent = {
        type: e.type === 'mousedown' ? 'mousedown' : e.type === 'mousemove' ? 'mousemove' : 'mouseup',
        x: Math.min(Math.max(e.nativeEvent.offsetX / displayDims.fitScale, 0), displayDims.w - 1),
        y: Math.min(Math.max(e.nativeEvent.offsetY / displayDims.fitScale, 0), displayDims.h - 1),
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        nativeEvent: e.nativeEvent,
      };

      const mask = magicWandRef.current.onEvent(canvasEvent);
      if (mask) {
        if (canvasEvent.shiftKey && canvasEvent.type === 'mousedown') {
          pipelineRef.current.addToSelection(mask);
        } else if (canvasEvent.altKey && canvasEvent.type === 'mousedown') {
          pipelineRef.current.subtractFromSelection(mask);
        } else {
          pipelineRef.current.setPendingMask(mask);
        }
        setThreshold(magicWandRef.current.getThreshold());
        setHasPendingSelection(true);
      }
    },
    [activeTool, displayDims],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        pipelineRef.current?.commit(brushMode);
        setHasPendingSelection(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        pipelineRef.current?.cancel();
        setHasPendingSelection(false);
      } else if (e.key === 'x' || e.key === 'X') {
        setBrushMode((prev) => (prev === 'keep' ? 'erase' : 'keep'));
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (activeTool === 'brush') {
          brushToolRef.current?.undo();
        } else {
          pipelineRef.current?.undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, brushMode]);

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
          {/* Tool selector */}
          <div className="flex p-1 bg-gray-200 rounded-xl">
            <button
              onClick={() => switchTool('magicwand')}
              className={cn(
                'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                activeTool === 'magicwand'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              Magic Wand
            </button>
          </div>

          {/* Keep/Erase toggle */}
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

          {/* Threshold display (magic wand only) */}
          {activeTool === 'magicwand' && (
            <span className="text-[9px] font-bold text-gray-400">
              Threshold: {threshold}
            </span>
          )}

          {/* Advanced toggle */}
          <button
            onClick={() => {
              const next = !showAdvanced;
              setShowAdvanced(next);
              if (next) switchTool('brush');
              else switchTool('magicwand');
            }}
            className="text-[9px] font-bold text-gray-500 underline hover:text-gray-700 transition-colors"
          >
            {showAdvanced ? 'Hide Advanced' : 'Advanced'}
          </button>

          {/* Brush controls (shown when advanced/brush active) */}
          {showAdvanced && activeTool === 'brush' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Size
                </span>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-24 accent-blue-600"
                />
                <span className="text-[9px] font-bold text-gray-400 w-6 text-right">
                  {brushSize}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Opacity
                </span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={brushOpacity}
                  onChange={(e) => setBrushOpacity(Number(e.target.value))}
                  className="w-24 accent-blue-600"
                />
                <span className="text-[9px] font-bold text-gray-400 w-8 text-right">
                  {brushOpacity}%
                </span>
              </div>
            </>
          )}

          {/* Keyboard hints */}
          <div className="ml-auto flex items-center gap-2 text-[8px] text-gray-400 font-bold uppercase tracking-widest">
            <span>Enter: apply</span>
            <span>Esc: cancel</span>
            <span>X: toggle</span>
            <span>⌘Z: undo</span>
          </div>
        </div>

        {/* Canvas area */}
        <div
          className="flex items-center justify-center p-6 bg-gray-100 overflow-hidden"
          style={{ minHeight: '400px' }}
        >
          {isLoading && !error && (
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
              Loading editor...
            </p>
          )}
          {error && !isLoading && (
            <div className="text-center space-y-2">
              <p className="text-[10px] font-bold text-red-500">{error}</p>
              <p className="text-[9px] text-gray-400">
                Check network connection and try again
              </p>
            </div>
          )}

          <div
            style={{
              width: displayDims.displayW,
              height: displayDims.displayH,
              overflow: 'hidden',
              visibility: isLoading ? 'hidden' : 'visible',
              position: 'relative',
            }}
          >
            <div
              style={{
                transform: `scale(${displayDims.fitScale})`,
                transformOrigin: 'top left',
                width: displayDims.w || undefined,
                height: displayDims.h || undefined,
                position: 'relative',
              }}
            >
              {/* Fabric.js display canvas */}
              <canvas ref={displayCanvasRef} className="rounded-xl shadow-sm" />

              {/* Selection overlay canvas (marching ants) */}
              <canvas
                ref={overlayCanvasRef}
                width={displayDims.w || 1}
                height={displayDims.h || 1}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  pointerEvents: activeTool === 'magicwand' ? 'auto' : 'none',
                  cursor: activeTool === 'magicwand' ? 'crosshair' : 'default',
                }}
                onMouseDown={handleOverlayPointerEvent}
                onMouseMove={handleOverlayPointerEvent}
                onMouseUp={handleOverlayPointerEvent}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          {/* Apply Selection button (visible when pending) */}
          {hasPendingSelection && (
            <button
              onClick={() => {
                pipelineRef.current?.commit(brushMode);
                setHasPendingSelection(false);
              }}
              className="rounded-xl border border-blue-300 bg-blue-50 px-6 py-2.5 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-100 transition-all"
            >
              Apply Selection (Enter)
            </button>
          )}
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
