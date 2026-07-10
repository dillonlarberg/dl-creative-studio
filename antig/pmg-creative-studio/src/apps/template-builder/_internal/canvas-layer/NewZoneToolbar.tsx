import { PhotoIcon, DocumentTextIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../../utils/cn';

export interface NewZoneToolbarProps {
  placementMode: 'image' | 'text' | null;
  onEnterPlacementMode: (mode: 'image' | 'text') => void;
  onCancelPlacementMode: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function NewZoneToolbar({
  placementMode,
  onEnterPlacementMode,
  onCancelPlacementMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: NewZoneToolbarProps) {
  function handleClick(mode: 'image' | 'text') {
    if (placementMode === mode) {
      onCancelPlacementMode();
    } else {
      onEnterPlacementMode(mode);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Undo / Redo */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded border transition-colors',
          canUndo
            ? 'bg-white/90 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900'
            : 'bg-white/50 text-gray-300 border-gray-200 cursor-not-allowed',
        )}
      >
        <ArrowUturnLeftIcon className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded border transition-colors mr-1',
          canRedo
            ? 'bg-white/90 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900'
            : 'bg-white/50 text-gray-300 border-gray-200 cursor-not-allowed',
        )}
      >
        <ArrowUturnRightIcon className="h-3 w-3" />
      </button>

      {/* Zone draw tools */}
      <button
        type="button"
        onClick={() => handleClick('image')}
        className={cn(
          'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors',
          placementMode === 'image'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white/90 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900',
        )}
        title={placementMode === 'image' ? 'Cancel (Esc)' : 'Draw an image zone'}
      >
        <PhotoIcon className="h-3 w-3" />
        Image
      </button>
      <button
        type="button"
        onClick={() => handleClick('text')}
        className={cn(
          'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors',
          placementMode === 'text'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white/90 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900',
        )}
        title={placementMode === 'text' ? 'Cancel (Esc)' : 'Draw a text zone'}
      >
        <DocumentTextIcon className="h-3 w-3" />
        Text
      </button>
      {placementMode && (
        <span className="text-[10px] text-indigo-600 font-medium ml-0.5">
          Draw on canvas · Esc cancels
        </span>
      )}
    </div>
  );
}
