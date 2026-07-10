import { useState, useRef, useEffect } from 'react';
import { PhotoIcon } from '@heroicons/react/24/outline';

export interface ZoneContentBadgeProps {
  zoneId: string;
  /** If true the URL input opens immediately without clicking the badge icon. */
  autoOpen?: boolean;
  onUrlSubmit: (zoneId: string, url: string) => void;
}

/**
 * Small badge at the zone corner that opens an INLINE popover for setting an image URL.
 * No fullscreen overlay — the popover is positioned relative to the badge.
 */
export function ZoneContentBadge({ zoneId, autoOpen = false, onUrlSubmit }: ZoneContentBadgeProps) {
  const [open, setOpen] = useState(autoOpen);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  function handleSubmit() {
    const trimmed = url.trim();
    if (trimmed) onUrlSubmit(zoneId, trimmed);
    setOpen(false);
    setUrl('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') { setOpen(false); setUrl(''); }
  }

  return (
    <div className="absolute bottom-1 right-1">
      {/* Badge trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center w-6 h-6 rounded bg-white/90 border border-gray-300 shadow-sm hover:bg-white transition-colors"
        title="Set image URL"
      >
        <PhotoIcon className="h-3.5 w-3.5 text-gray-600" />
      </button>

      {/* Inline popover — appears above-left of the badge */}
      {open && (
        <div
          className="absolute bottom-full right-0 mb-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2.5 z-30"
          style={{ width: 220 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] font-semibold text-gray-800 mb-1.5">Image URL</p>
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://..."
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-2"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => { setOpen(false); setUrl(''); }}
              className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="text-xs px-2.5 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
