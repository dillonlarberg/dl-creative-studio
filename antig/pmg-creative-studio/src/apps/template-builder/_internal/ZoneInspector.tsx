import { useState, useEffect, useRef } from 'react';
import { TrashIcon, CheckIcon, PhotoIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/outline';
import type { CustomZone, ZoneBound } from '../types';
import { cn } from '../../../utils/cn';

export interface ZoneInspectorProps {
  zone: CustomZone;
  displayBound: ZoneBound;
  canvasWidth: number;
  canvasHeight: number;
  feedColumns: string[];
  feedSampleRow?: Record<string, unknown>;
  onDelete: () => void;
  onClose: () => void;
  onContentUpdate: (patch: { fieldId?: string; textContent?: string }) => void;
}

type SourceMode = 'static' | 'feed' | 'ai';

const CARD_W = 240;
const CARD_H_TEXT = 148;
const CARD_H_IMAGE = 40;
const GAP = 6;

export function ZoneInspector({
  zone,
  displayBound,
  canvasWidth,
  canvasHeight,
  feedColumns,
  feedSampleRow,
  onDelete,
  onClose,
  onContentUpdate,
}: ZoneInspectorProps) {
  const initialMode: SourceMode = zone.fieldId ? 'feed' : 'static';
  const [mode, setMode] = useState<SourceMode>(initialMode);
  const [staticText, setStaticText] = useState(zone.textContent ?? '');
  const [selectedColumn, setSelectedColumn] = useState(zone.fieldId ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStaticText(zone.textContent ?? '');
    setSelectedColumn(zone.fieldId ?? '');
    setMode(zone.fieldId ? 'feed' : 'static');
  }, [zone.id, zone.fieldId, zone.textContent]);

  useEffect(() => {
    if (zone.type === 'text' && mode === 'static') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [zone.id, zone.type, mode]);

  const cardH = zone.type === 'text' ? CARD_H_TEXT : CARD_H_IMAGE;

  // Position: prefer above the zone; if not enough room, go below.
  // Horizontally: align to zone left, but clamp so card stays on canvas.
  const spaceAbove = displayBound.y - GAP;
  const spaceBelow = canvasHeight - (displayBound.y + displayBound.h) - GAP;
  const placeAbove = spaceAbove >= cardH || spaceAbove >= spaceBelow;

  const top = placeAbove
    ? displayBound.y - cardH - GAP
    : displayBound.y + displayBound.h + GAP;
  const left = Math.max(0, Math.min(displayBound.x, canvasWidth - CARD_W - 4));

  function applyAndClose() {
    if (mode === 'static') {
      onContentUpdate({ fieldId: undefined, textContent: staticText || undefined });
    } else if (mode === 'feed') {
      onContentUpdate({ fieldId: selectedColumn || undefined, textContent: undefined });
    } else {
      onContentUpdate({ fieldId: undefined, textContent: undefined });
    }
    onClose();
  }

  function handleModeChange(next: SourceMode) {
    setMode(next);
    // Immediate apply so preview updates live
    if (next === 'feed') {
      onContentUpdate({ fieldId: selectedColumn || undefined, textContent: undefined });
    } else if (next === 'static') {
      onContentUpdate({ fieldId: undefined, textContent: staticText || undefined });
    } else {
      onContentUpdate({ fieldId: undefined, textContent: undefined });
    }
  }

  function handleStaticChange(text: string) {
    setStaticText(text);
    onContentUpdate({ fieldId: undefined, textContent: text || undefined });
  }

  function handleColumnChange(col: string) {
    setSelectedColumn(col);
    onContentUpdate({ fieldId: col || undefined, textContent: undefined });
  }

  const previewValue =
    mode === 'feed' && selectedColumn && feedSampleRow
      ? String(feedSampleRow[selectedColumn] ?? '')
      : mode === 'static' ? staticText : '';

  const ZoneIcon = zone.type === 'text' ? DocumentTextIcon : PhotoIcon;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: CARD_W,
        zIndex: 20,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between bg-gray-900 text-white px-2 py-1 rounded-t text-[11px] font-medium">
        <span className="flex items-center gap-1 opacity-75">
          <ZoneIcon className="h-3 w-3" />
          {zone.type === 'text' ? 'Text zone' : 'Image zone'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDelete}
            className="p-0.5 text-red-400 hover:text-red-200 transition-colors rounded"
            title="Delete zone"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={applyAndClose}
            className="p-0.5 text-green-400 hover:text-green-200 transition-colors rounded"
            title="Done"
          >
            <CheckIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body — text zones only */}
      {zone.type === 'text' && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b shadow-lg px-2 pt-1.5 pb-2 space-y-1.5">
          {/* Source tabs */}
          <div className="flex rounded overflow-hidden border border-gray-200 text-[10px] font-semibold">
            {(['static', 'feed', 'ai'] as SourceMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={cn(
                  'flex-1 py-1 flex items-center justify-center gap-0.5 transition-colors',
                  mode === m ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50',
                )}
              >
                {m === 'ai' && <SparklesIcon className="h-2.5 w-2.5" />}
                {m === 'static' ? 'Static' : m === 'feed' ? 'Feed' : 'AI'}
              </button>
            ))}
          </div>

          {mode === 'static' && (
            <input
              ref={inputRef}
              type="text"
              value={staticText}
              onChange={(e) => handleStaticChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyAndClose(); }}
              placeholder="Type text…"
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          )}

          {mode === 'feed' && (
            <select
              value={selectedColumn}
              onChange={(e) => handleColumnChange(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— pick a column —</option>
              {feedColumns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          )}

          {mode === 'ai' && (
            <p className="text-[10px] text-gray-400 text-center py-0.5">
              Configure in Ask Alli on the left panel.
            </p>
          )}

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
