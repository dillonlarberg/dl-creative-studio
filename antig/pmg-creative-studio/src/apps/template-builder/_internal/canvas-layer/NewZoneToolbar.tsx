import { PhotoIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../../utils/cn';

export interface NewZoneToolbarProps {
  placementMode: 'image' | 'text' | null;
  onEnterPlacementMode: (mode: 'image' | 'text') => void;
  onCancelPlacementMode: () => void;
}

export function NewZoneToolbar({
  placementMode,
  onEnterPlacementMode,
  onCancelPlacementMode,
}: NewZoneToolbarProps) {
  function handleClick(mode: 'image' | 'text') {
    if (placementMode === mode) {
      onCancelPlacementMode();
    } else {
      onEnterPlacementMode(mode);
    }
  }

  return (
    <div className="flex items-center gap-1 mb-1">
      <button
        type="button"
        onClick={() => handleClick('image')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors',
          placementMode === 'image'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
        )}
        title={placementMode === 'image' ? 'Cancel (Esc)' : 'Draw an image zone on the canvas'}
      >
        <PhotoIcon className="h-3.5 w-3.5" />
        + Image Zone
      </button>
      <button
        type="button"
        onClick={() => handleClick('text')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors',
          placementMode === 'text'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
        )}
        title={placementMode === 'text' ? 'Cancel (Esc)' : 'Draw a text zone on the canvas'}
      >
        <DocumentTextIcon className="h-3.5 w-3.5" />
        + Text Zone
      </button>
      {placementMode && (
        <span className="text-xs text-blue-600 ml-1">
          Draw a rectangle on the canvas — Esc to cancel
        </span>
      )}
    </div>
  );
}
