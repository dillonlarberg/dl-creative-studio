import { useState, useEffect } from 'react';
import { TrashIcon, RssIcon, PencilSquareIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { CustomZone, ZoneBound } from '../types';
import { cn } from '../../../utils/cn';

export interface ZoneInspectorProps {
  zone: CustomZone;
  displayBound: ZoneBound;
  canvasHeight: number;
  feedColumns: string[];
  /** Current feed row sample values for preview */
  feedSampleRow?: Record<string, unknown>;
  onDelete: () => void;
  onContentUpdate: (patch: { fieldId?: string; textContent?: string }) => void;
}

type SourceMode = 'static' | 'feed' | 'ai';

export function ZoneInspector({
  zone,
  displayBound,
  canvasHeight,
  feedColumns,
  feedSampleRow,
  onDelete,
  onContentUpdate,
}: ZoneInspectorProps) {
  // Determine initial source mode from the zone's current data
  const initialMode: SourceMode = zone.fieldId ? 'feed' : zone.textContent ? 'static' : 'static';
  const [mode, setMode] = useState<SourceMode>(initialMode);
  const [staticText, setStaticText] = useState(zone.textContent ?? '');
  const [selectedColumn, setSelectedColumn] = useState(zone.fieldId ?? '');

  // Sync state if zone data changes externally
  useEffect(() => {
    setStaticText(zone.textContent ?? '');
    setSelectedColumn(zone.fieldId ?? '');
    setMode(zone.fieldId ? 'feed' : 'static');
  }, [zone.id, zone.fieldId, zone.textContent]);

  // Position: above the zone if there's room, below if zone is near the top
  const CARD_HEIGHT = zone.type === 'text' ? 130 : 40;
  const spaceAbove = displayBound.y;
  const showAbove = spaceAbove > CARD_HEIGHT + 8;
  const cardTop = showAbove
    ? displayBound.y - CARD_HEIGHT - 8
    : displayBound.y + displayBound.h + 8;

  const cardLeft = Math.min(displayBound.x, Math.max(0, displayBound.x));
  const cardWidth = Math.max(220, Math.min(280, displayBound.w));

  function handleModeChange(next: SourceMode) {
    setMode(next);
    if (next === 'feed') {
      onContentUpdate({ fieldId: selectedColumn || undefined, textContent: undefined });
    } else if (next === 'static') {
      onContentUpdate({ fieldId: undefined, textContent: staticText || undefined });
    } else {
      onContentUpdate({ fieldId: undefined, textContent: undefined });
    }
  }

  function handleColumnChange(col: string) {
    setSelectedColumn(col);
    onContentUpdate({ fieldId: col || undefined, textContent: undefined });
  }

  function handleStaticChange(text: string) {
    setStaticText(text);
    onContentUpdate({ fieldId: undefined, textContent: text || undefined });
  }

  const previewValue =
    mode === 'feed' && selectedColumn && feedSampleRow
      ? String(feedSampleRow[selectedColumn] ?? '')
      : mode === 'static'
      ? staticText
      : '';

  return (
    <div
      style={{
        position: 'absolute',
        top: cardTop,
        left: cardLeft,
        width: cardWidth,
        zIndex: 20,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Action bar: zone label + delete */}
      <div className="flex items-center justify-between bg-gray-900 text-white px-2 py-1 rounded-t text-[11px] font-medium">
        <span className="flex items-center gap-1 opacity-80">
          {zone.type === 'text' ? (
            <PencilSquareIcon className="h-3 w-3" />
          ) : (
            <RssIcon className="h-3 w-3" />
          )}
          {zone.type === 'text' ? 'Text zone' : 'Image zone'}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-0.5 text-red-300 hover:text-red-100 transition-colors"
          title="Delete zone"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content editor — text zones only */}
      {zone.type === 'text' && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b shadow-lg p-2 space-y-2">
          {/* Source mode tabs */}
          <div className="flex rounded overflow-hidden border border-gray-200 text-[10px] font-medium">
            {(['static', 'feed', 'ai'] as SourceMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={cn(
                  'flex-1 py-1 flex items-center justify-center gap-0.5 transition-colors',
                  mode === m
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {m === 'ai' && <SparklesIcon className="h-2.5 w-2.5" />}
                {m === 'static' ? 'Static' : m === 'feed' ? 'Feed' : 'AI'}
              </button>
            ))}
          </div>

          {/* Static text input */}
          {mode === 'static' && (
            <input
              type="text"
              value={staticText}
              onChange={(e) => handleStaticChange(e.target.value)}
              placeholder="Type text…"
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          )}

          {/* Feed column picker */}
          {mode === 'feed' && (
            <select
              value={selectedColumn}
              onChange={(e) => handleColumnChange(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— pick a column —</option>
              {feedColumns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          )}

          {/* AI placeholder */}
          {mode === 'ai' && (
            <p className="text-[10px] text-gray-500 text-center py-1">
              AI-generated text — configure in Ask Alli on the left panel.
            </p>
          )}

          {/* Preview value */}
          {previewValue && (
            <p className="text-[10px] text-gray-400 truncate border-t border-gray-100 pt-1">
              Preview: <span className="text-gray-700 font-medium">{previewValue}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
