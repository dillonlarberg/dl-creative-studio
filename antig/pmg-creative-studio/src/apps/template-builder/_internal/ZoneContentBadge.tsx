import { useState, useRef } from 'react';
import { PhotoIcon } from '@heroicons/react/24/outline';

export interface ZoneContentBadgeProps {
  zoneId: string;
  onUrlSubmit: (zoneId: string, url: string) => void;
}

/**
 * Small badge rendered in the corner of a selected image zone.
 * Clicking opens a URL input popover. On non-empty URL submission, calls onUrlSubmit.
 * Empty input or any cancel path (Escape, backdrop click, close) is a no-op.
 */
export function ZoneContentBadge({ zoneId, onUrlSubmit }: ZoneContentBadgeProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    setUrl('');
    setOpen(true);
    // Focus input on next tick
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSubmit() {
    const trimmed = url.trim();
    if (trimmed) {
      onUrlSubmit(zoneId, trimmed);
    }
    // Empty or cancel: discard, no callback
    setOpen(false);
    setUrl('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') {
      setOpen(false);
      setUrl('');
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      setOpen(false);
      setUrl('');
    }
  }

  return (
    <div className="absolute bottom-1 right-1 z-10">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center justify-center w-6 h-6 rounded bg-white/90 border border-gray-300 shadow-sm hover:bg-white transition-colors"
        title="Set image URL"
      >
        <PhotoIcon className="h-3.5 w-3.5 text-gray-600" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={handleBackdropClick}
        >
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80">
            <p className="text-sm font-medium text-gray-900 mb-2">Set image URL</p>
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://..."
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setOpen(false); setUrl(''); }}
                className="text-sm px-3 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
