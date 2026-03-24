import { useEffect, useRef, useState, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Canvas as FabricCanvas, FabricImage } from 'fabric';
import { cn } from '../../../utils/cn';
import { proxyUrl } from '../utils/proxyUrl';
import { applyMaskToAlpha } from '../utils/applyMaskToAlpha';

import type { BinaryMask, BrushMode, CanvasEvent, DisplayDims } from './mask-editor/types';
import {
  loadImg,
  buildMaskFromAlpha,
  buildMaskFromSaved,
  regenerateTint,
} from './mask-editor/maskUtils';
import { SelectionPipeline } from './mask-editor/SelectionPipeline';
import { MagicWandTool } from './mask-editor/MagicWandTool';
import { BrushTool } from './mask-editor/BrushTool';
import { SegmentTool } from './mask-editor/SegmentTool';

interface MaskEditorModalProps {
  originalImageUrl: string;
  extractedImageUrl: string;
  maskDataUrl?: string;
  onConfirm: (refinedImageUrl: string, maskDataUrl: string) => void;
  onCancel: () => void;
}

const MAX_DISPLAY_WIDTH = 800;
const MAX_DISPLAY_HEIGHT = 550;

type ActiveTool = 'magicwand' | 'segment' | 'brush';

/** Convert a React mouse event to image-space CanvasEvent */
function toCanvasEvent(
  e: React.MouseEvent<HTMLCanvasElement>,
  dims: DisplayDims,
): CanvasEvent {
  return {
    type: e.type === 'mousedown' ? 'mousedown' : e.type === 'mousemove' ? 'mousemove' : 'mouseup',
    x: Math.min(Math.max(e.nativeEvent.offsetX / dims.fitScale, 0), dims.w - 1),
    y: Math.min(Math.max(e.nativeEvent.offsetY / dims.fitScale, 0), dims.h - 1),
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    nativeEvent: e.nativeEvent,
  };
}

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
  const fabricRef = useRef<FabricCanvas | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Tool refs
  const pipelineRef = useRef<SelectionPipeline | null>(null);
  const magicWandRef = useRef<MagicWandTool | null>(null);
  const brushToolRef = useRef<BrushTool | null>(null);
  const segmentToolRef = useRef<SegmentTool | null>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);
  const tintBlobUrlRef = useRef<string | null>(null);
  const tintObjRef = useRef<any>(null);
  const initialMaskRef = useRef<ImageData | null>(null);

  // UI state
  const [activeTool, setActiveTool] = useState<ActiveTool>('magicwand');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectionMode, setSelectionMode] = useState<BrushMode>('erase');
  const [brushSize, setBrushSize] = useState(20);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [threshold, setThreshold] = useState(15);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [hasPendingSelection, setHasPendingSelection] = useState(false);
  const [displayDims, setDisplayDims] = useState<DisplayDims>({
    w: 0,
    h: 0,
    fitScale: 1,
    displayW: MAX_DISPLAY_WIDTH,
    displayH: MAX_DISPLAY_HEIGHT,
  });

  // ── Tint update callback (D2: try/catch + toast) ─────────────────

  const handleTintUpdate = useCallback(async () => {
    if (!maskCanvasRef.current || !fabricRef.current) return;
    const canvas = fabricRef.current;

    try {
      if (tintBlobUrlRef.current) URL.revokeObjectURL(tintBlobUrlRef.current);

      const newTintUrl = await regenerateTint(maskCanvasRef.current);
      tintBlobUrlRef.current = newTintUrl;

      if (tintObjRef.current) {
        canvas.remove(tintObjRef.current);
      }

      const tintImg = await loadImg(newTintUrl);
      const fabricTint = new FabricImage(tintImg, {
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
      });

      // D5: Insert at index 0 directly to avoid visual flash
      canvas.insertAt(0, fabricTint);
      tintObjRef.current = fabricTint;
      canvas.renderAll();
    } catch (err) {
      console.error('[MaskEditor] Tint update failed:', err);
      setError('Tint preview failed — mask still saved. Try committing again.');
    }
  }, []);

  // ── applyMaskToSelection helper ───────────────────────────────────

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
        if (cancelled || !displayCanvasRef.current) return;

        const canvas = new FabricCanvas(displayCanvasRef.current, {
          isDrawingMode: false,
          width: w,
          height: h,
          selection: false,
        });
        fabricRef.current = canvas;

        // Background image
        const bgFabric = new FabricImage(origImg);
        bgFabric.set({ left: 0, top: 0, originX: 'left', originY: 'top' });
        canvas.backgroundImage = bgFabric;

        // Tint overlay
        const tintImg = await loadImg(tintBlobUrl);
        if (cancelled) return;
        const tintFabric = new FabricImage(tintImg);
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

        // D1: Initialize magic wand tool with config object
        magicWandRef.current = new MagicWandTool();
        magicWandRef.current.activate({
          imageData: originalImageDataRef.current!,
          overlayCanvas: overlayCanvasRef.current!,
          imageWidth: w,
          imageHeight: h,
        });

        // Initialize brush tool (created but NOT activated)
        brushToolRef.current = new BrushTool({
          fabricCanvas: canvas,
          maskCanvas,
          initialMaskData: initialMaskRef.current!,
        });

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
      segmentToolRef.current?.destroy();
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

      // Deactivate current tool
      if (activeTool === 'brush') {
        brushToolRef.current?.deactivate();
        pipelineRef.current?.snapshotInitialMask();
      } else if (activeTool === 'segment') {
        segmentToolRef.current?.deactivate();
      }

      // Activate new tool
      if (tool === 'brush') {
        brushToolRef.current?.activate(selectionMode, brushSize, brushOpacity);
      } else if (tool === 'segment' && segmentToolRef.current && overlayCanvasRef.current && originalImageDataRef.current) {
        segmentToolRef.current.activate({
          imageData: originalImageDataRef.current,
          overlayCanvas: overlayCanvasRef.current,
          imageWidth: displayDims.w,
          imageHeight: displayDims.h,
        });
      }

      setActiveTool(tool);
    },
    [activeTool, selectionMode, brushSize, brushOpacity, displayDims],
  );

  // ── Brush settings sync ───────────────────────────────────────────

  useEffect(() => {
    if (activeTool === 'brush' && brushToolRef.current) {
      brushToolRef.current.updateSettings(selectionMode, brushSize, brushOpacity);
    }
  }, [selectionMode, brushSize, brushOpacity, activeTool]);

  // ── Overlay canvas event handling (magic wand + segment tool) ─────

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
        return;
      }

      if (mask) {
        applyMaskToSelection(mask, canvasEvent);
      }
    },
    [activeTool, displayDims, applyMaskToSelection],
  );

  // ── Keyboard shortcuts (D4: resetDrag, D8: invert) ───────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // D8: Cmd+Shift+I → invert selection (check before other Cmd combos)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        pipelineRef.current?.invertSelection();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        pipelineRef.current?.commit(selectionMode);
        // D4: Reset drag state to prevent stale downPoint
        magicWandRef.current?.resetDrag();
        setHasPendingSelection(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        pipelineRef.current?.cancel();
        magicWandRef.current?.resetDrag();
        setHasPendingSelection(false);
      } else if (e.key === 'x' || e.key === 'X') {
        setSelectionMode((prev) => (prev === 'keep' ? 'erase' : 'keep'));
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (activeTool === 'brush') {
          brushToolRef.current?.undo();
        } else {
          pipelineRef.current?.undo();
          magicWandRef.current?.resetDrag();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, selectionMode]);

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
          </div>

          {/* Keep/Erase toggle */}
          <div className="flex p-1 bg-gray-200 rounded-xl">
            {(['keep', 'erase'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSelectionMode(mode)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                  selectionMode === mode
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
            <span>⌘⇧I: invert</span>
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

              {/* Selection overlay canvas (marching ants + text highlights) */}
              <canvas
                ref={overlayCanvasRef}
                width={displayDims.w || 1}
                height={displayDims.h || 1}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  pointerEvents: (activeTool === 'magicwand' || activeTool === 'segment') ? 'auto' : 'none',
                  cursor: (activeTool === 'magicwand' || activeTool === 'segment') ? 'crosshair' : 'default',
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
          {/* Invert + Apply Selection buttons (visible when pending) */}
          {hasPendingSelection && (
            <>
              <button
                onClick={() => {
                  pipelineRef.current?.invertSelection();
                }}
                className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-2.5 text-[10px] font-black text-purple-600 uppercase tracking-widest hover:bg-purple-100 transition-all"
              >
                Invert
              </button>
              <button
                onClick={() => {
                  pipelineRef.current?.commit(selectionMode);
                  magicWandRef.current?.resetDrag();
                  setHasPendingSelection(false);
                }}
                className="rounded-xl border border-blue-300 bg-blue-50 px-6 py-2.5 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-100 transition-all"
              >
                Apply Selection (Enter)
              </button>
            </>
          )}
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-6 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-gray-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isApplying}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-40"
          >
            {isApplying ? 'Applying...' : 'Apply Refinement'}
          </button>
        </div>
      </div>
    </div>
  );
}
