import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';

interface MaskEditorModalProps {
  originalImageUrl: string;
  extractedImageUrl: string;
  onConfirm: (refinedImageUrl: string) => void;
  onCancel: () => void;
}

type BrushMode = 'add' | 'remove';

export function MaskEditorModal({
  originalImageUrl,
  extractedImageUrl,
  onConfirm,
  onCancel,
}: MaskEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const [brushMode, setBrushMode] = useState<BrushMode>('remove');
  const [brushSize, setBrushSize] = useState(20);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Load image as HTMLImageElement without crossOrigin to avoid CORS blocks
    // from external CDNs (Alli, Replicate). Canvas will be tainted but we
    // only need to display images here, not export pixel data.
    const loadImg = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
      });

    const initFabric = async () => {
      // Pre-load images without crossOrigin so external CDNs don't block them
      const [bgHtml, fgHtml] = await Promise.all([
        loadImg(originalImageUrl),
        loadImg(extractedImageUrl),
      ]);
      if (cancelled) return;

      // Dynamic import to avoid SSR issues and reduce initial bundle
      const fabric = await import('fabric');
      if (cancelled || !canvasRef.current) return;

      const canvas = new fabric.Canvas(canvasRef.current, {
        isDrawingMode: true,
        width: 800,
        height: 600,
      });
      fabricRef.current = canvas;

      // Load the original image as background using pre-loaded element
      const bgImg = new fabric.FabricImage(bgHtml);
      if (cancelled) return;

      // Scale to fit canvas
      const scale = Math.min(800 / bgImg.width!, 600 / bgImg.height!);
      bgImg.scale(scale);
      canvas.backgroundImage = bgImg;

      // Load extracted image as overlay to show current mask
      const fgImg = new fabric.FabricImage(fgHtml);
      if (cancelled) return;

      fgImg.scale(scale);
      fgImg.set({ selectable: false, evented: false, opacity: 0.7 });
      canvas.add(fgImg);

      // Configure brush
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = brushSize;
      updateBrushColor(canvas, brushMode);

      canvas.renderAll();
      setIsLoading(false);
    };

    initFabric();

    return () => {
      cancelled = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateBrushColor = (canvas: any, mode: BrushMode) => {
    if (!canvas?.freeDrawingBrush) return;
    // Green = add to selection (keep), Red = remove from selection (erase)
    canvas.freeDrawingBrush.color = mode === 'add'
      ? 'rgba(0, 255, 0, 0.4)'
      : 'rgba(255, 0, 0, 0.4)';
  };

  useEffect(() => {
    if (fabricRef.current) {
      updateBrushColor(fabricRef.current, brushMode);
    }
  }, [brushMode]);

  useEffect(() => {
    if (fabricRef.current?.freeDrawingBrush) {
      fabricRef.current.freeDrawingBrush.width = brushSize;
    }
  }, [brushSize]);

  const handleConfirm = () => {
    // For now, return the extracted image as-is.
    // Full mask application will be implemented when the backend supports it.
    // The paint strokes are visual — actual mask refinement requires
    // sending the mask data to the extraction API or processing client-side.
    onConfirm(extractedImageUrl);
  };

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
        <div className="flex items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100">
          {/* Brush mode toggle */}
          <div className="flex p-1 bg-gray-200 rounded-xl">
            {(['add', 'remove'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBrushMode(mode)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                  brushMode === mode
                    ? mode === 'add'
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'bg-red-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {mode === 'add' ? 'Keep' : 'Erase'}
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
        </div>

        {/* Canvas */}
        <div className="flex items-center justify-center p-6 bg-gray-100 min-h-[400px]">
          {isLoading && (
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
              Loading editor...
            </p>
          )}
          <canvas
            ref={canvasRef}
            className={cn('rounded-xl shadow-sm', isLoading && 'hidden')}
          />
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
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            Apply Refinement
          </button>
        </div>
      </div>
    </div>
  );
}
