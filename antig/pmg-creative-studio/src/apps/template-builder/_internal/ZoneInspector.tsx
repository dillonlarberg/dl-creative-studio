import { useState, useEffect, useRef } from 'react';
import { TrashIcon, CheckIcon, PhotoIcon, DocumentTextIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { CustomZone, ZoneBound, ZoneStyle } from '../types';
import { cn } from '../../../utils/cn';
import { UserImageGallery } from './UserImageGallery';
import { inferColumnTypes, groupColumnsByInferredType } from './columnUtils';

const FONT_FAMILIES = [
  { label: 'Inherit', value: '' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: '"Helvetica Neue", Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Impact', value: 'Impact, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

export interface ZoneInspectorProps {
  zone: CustomZone;
  displayBound: ZoneBound;
  canvasWidth: number;
  canvasHeight: number;
  feedColumns: string[];
  feedSampleRow?: Record<string, unknown>;
  feedSampleData?: Array<Record<string, unknown>>;
  feedRowIndex?: number;
  onFeedRowChange?: (i: number) => void;
  zoneStyle?: ZoneStyle;
  clientSlug: string;
  onDelete: () => void;
  onClose: () => void;
  onContentUpdate: (patch: { fieldId?: string; textContent?: string; assetUrl?: string }) => void;
  onStyleUpdate: (patch: ZoneStyle) => void;
}

type SourceMode = 'static' | 'feed' | 'ai';
type ImageMode = 'url' | 'feed' | 'upload';

const CARD_W = 284;
const CARD_H_TEXT = 250;
const CARD_H_IMAGE = 220;
const GAP = 6;

export function ZoneInspector({
  zone,
  displayBound,
  canvasWidth,
  canvasHeight,
  feedColumns,
  feedSampleRow,
  feedSampleData,
  feedRowIndex,
  onFeedRowChange,
  zoneStyle,
  clientSlug,
  onDelete,
  onClose,
  onContentUpdate,
  onStyleUpdate,
}: ZoneInspectorProps) {
  const initialMode: SourceMode = zone.fieldId ? 'feed' : 'static';
  const [mode, setMode] = useState<SourceMode>(initialMode);
  const [staticText, setStaticText] = useState(zone.textContent ?? '');
  const [selectedColumn, setSelectedColumn] = useState(zone.fieldId ?? '');
  const [imageMode, setImageMode] = useState<ImageMode>(
    zone.fieldId ? 'feed' : zone.assetUrl ? 'url' : 'url'
  );
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Infer column types for grouped feed selects
  const sampleData = feedSampleRow ? [feedSampleRow as Record<string, unknown>] : [];
  const inferredColTypes = inferColumnTypes(sampleData, feedColumns);

  useEffect(() => {
    setStaticText(zone.textContent ?? '');
    setSelectedColumn(zone.fieldId ?? '');
    setMode(zone.fieldId ? 'feed' : 'static');
    setImageMode(zone.fieldId ? 'feed' : zone.assetUrl ? 'url' : 'url');
    setConfirming(false);
  }, [zone.id, zone.fieldId, zone.textContent, zone.assetUrl]);

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

  const inputCls =
    'w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 placeholder-gray-400 ' +
    'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10';

  const IMAGE_TABS: { key: ImageMode; label: string }[] = [
    { key: 'url', label: 'URL' },
    { key: 'feed', label: 'Feed' },
    { key: 'upload', label: 'My uploads' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: CARD_W,
        zIndex: 30,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Header ───────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 rounded-t-xl text-[10px] font-black uppercase tracking-[0.2em]"
        style={{ background: '#2D3142' }}
      >
        <span className="flex items-center gap-1.5 text-white/90">
          <ZoneIcon className="h-3 w-3 opacity-70" />
          {confirming
            ? <span className="text-white/60 font-normal">Save or remove?</span>
            : zone.type === 'text' ? 'Text zone' : 'Image zone'
          }
        </span>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={applyAndClose}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
              title="Cancel"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              title="Close"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded text-red-400/80 hover:text-red-300 hover:bg-white/10 transition-colors"
              title="Delete zone"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={applyAndClose}
              className="p-1 rounded text-green-400/90 hover:text-green-300 hover:bg-white/10 transition-colors"
              title="Done"
            >
              <CheckIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── IMAGE ZONE ───────────────────────────────────────── */}
      {zone.type === 'image' && (
        <div className="bg-white border border-t-0 border-gray-200 rounded-b-xl shadow-xl overflow-hidden">
          {/* Source tabs */}
          <div className="flex border-b border-gray-100">
            {IMAGE_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setImageMode(key)}
                className={cn(
                  'flex-1 py-2 text-[10px] font-semibold transition-colors border-b-2 -mb-px',
                  imageMode === key
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-400 border-transparent hover:text-gray-600',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2.5">
            {imageMode === 'url' && (
              <>
                <input
                  type="url"
                  value={zone.assetUrl ?? ''}
                  onChange={(e) => onContentUpdate({ assetUrl: e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyAndClose(); }}
                  placeholder="Paste image URL…"
                  autoFocus
                  className={inputCls}
                />
                {zone.assetUrl && (
                  <div className="rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                    <img
                      src={zone.assetUrl}
                      alt=""
                      className="w-full h-20 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).closest('div')!.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </>
            )}

            {imageMode === 'feed' && (
              feedColumns.length > 0 ? (
                <>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                    Link a feed column
                  </p>
                  <select
                    value={zone.fieldId ?? ''}
                    onChange={(e) => onContentUpdate({ fieldId: e.target.value || undefined, assetUrl: undefined })}
                    className={inputCls}
                  >
                    <option value="">— Select column —</option>
                    {groupColumnsByInferredType(feedColumns, inferredColTypes, 'image').map(({ groupLabel, cols }) => (
                      <optgroup key={groupLabel} label={groupLabel}>
                        {cols.map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {zone.fieldId && feedSampleRow && (
                    <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-2.5 py-1.5">
                      <span className="text-[9px] font-semibold text-blue-500 shrink-0">Preview</span>
                      <span className="text-[9px] font-medium text-blue-800 truncate">
                        {String(feedSampleRow[zone.fieldId] ?? '—')}
                      </span>
                    </div>
                  )}
                  {feedSampleData && feedSampleData.length > 1 && onFeedRowChange && (
                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                      <button type="button"
                        onClick={() => onFeedRowChange(Math.max(0, (feedRowIndex ?? 0) - 1))}
                        disabled={(feedRowIndex ?? 0) === 0}
                        className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] disabled:opacity-30 hover:text-blue-600 transition-colors">
                        ← Prev
                      </button>
                      <span className="text-[9px] text-gray-400">Row {(feedRowIndex ?? 0) + 1} of {feedSampleData.length}</span>
                      <button type="button"
                        onClick={() => onFeedRowChange(Math.min(feedSampleData.length - 1, (feedRowIndex ?? 0) + 1))}
                        disabled={(feedRowIndex ?? 0) >= feedSampleData.length - 1}
                        className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] disabled:opacity-30 hover:text-blue-800 transition-colors">
                        Next →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[10px] text-gray-400 text-center py-3">No feed columns available.</p>
              )
            )}

            {imageMode === 'upload' && (
              <UserImageGallery
                clientSlug={clientSlug}
                selectedUrl={zone.assetUrl}
                onSelect={(url) => onContentUpdate({ assetUrl: url, fieldId: undefined })}
              />
            )}
          </div>
        </div>
      )}

      {/* ── TEXT ZONE ────────────────────────────────────────── */}
      {zone.type === 'text' && (
        <div className="bg-white border border-t-0 border-gray-200 rounded-b-xl shadow-xl overflow-hidden">
          {/* Source tabs */}
          <div className="flex border-b border-gray-100">
            {(['static', 'feed', 'ai'] as SourceMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors border-b-2 -mb-px',
                  mode === m
                    ? m === 'ai' ? 'text-purple-600 border-purple-500' : 'text-blue-600 border-blue-600'
                    : 'text-gray-400 border-transparent hover:text-gray-600',
                )}
              >
                {m === 'ai' && <SparklesIcon className="h-3 w-3" />}
                {m === 'static' ? 'Static' : m === 'feed' ? 'Feed' : 'AI'}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2">
            {mode === 'static' && (
              <input
                ref={inputRef}
                type="text"
                value={staticText}
                onChange={(e) => handleStaticChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyAndClose(); }}
                placeholder="Type text…"
                className={inputCls}
              />
            )}

            {mode === 'feed' && (
              <>
                <select
                  value={selectedColumn}
                  onChange={(e) => handleColumnChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Pick a column —</option>
                  {groupColumnsByInferredType(feedColumns, inferredColTypes, 'text').map(({ groupLabel, cols }) => (
                    <optgroup key={groupLabel} label={groupLabel}>
                      {cols.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {previewValue && (
                  <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-[9px] font-semibold text-blue-500 shrink-0">Preview</span>
                    <span className="text-[9px] font-medium text-blue-800 truncate">{previewValue}</span>
                  </div>
                )}
                {feedSampleData && feedSampleData.length > 1 && onFeedRowChange && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                    <button type="button"
                      onClick={() => onFeedRowChange(Math.max(0, (feedRowIndex ?? 0) - 1))}
                      disabled={(feedRowIndex ?? 0) === 0}
                      className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] disabled:opacity-30 hover:text-blue-600 transition-colors">
                      ← Prev
                    </button>
                    <span className="text-[9px] text-gray-400">Row {(feedRowIndex ?? 0) + 1} of {feedSampleData.length}</span>
                    <button type="button"
                      onClick={() => onFeedRowChange(Math.min(feedSampleData.length - 1, (feedRowIndex ?? 0) + 1))}
                      disabled={(feedRowIndex ?? 0) >= feedSampleData.length - 1}
                      className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] disabled:opacity-30 hover:text-blue-800 transition-colors">
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}

            {mode === 'ai' && (
              <p className="text-[10px] text-gray-400 text-center py-2">
                Configure in Ask Alli on the left panel.
              </p>
            )}

            {/* ── Font controls ──────────────────────────── */}
            <div className="border-t border-gray-100 pt-2 space-y-2">
              {/* Row 1: B / I / U + alignment + color */}
              <div className="flex items-center gap-0.5">
                <button type="button"
                  onClick={() => onStyleUpdate({ fontWeight: zoneStyle?.fontWeight === 'bold' ? 'normal' : 'bold' })}
                  className={cn('w-6 h-6 rounded text-xs font-bold flex items-center justify-center border transition-colors',
                    zoneStyle?.fontWeight === 'bold' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}
                  title="Bold">B</button>
                <button type="button"
                  onClick={() => onStyleUpdate({ fontStyle: zoneStyle?.fontStyle === 'italic' ? 'normal' : 'italic' })}
                  className={cn('w-6 h-6 rounded text-xs italic flex items-center justify-center border transition-colors',
                    zoneStyle?.fontStyle === 'italic' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}
                  title="Italic">I</button>
                <button type="button"
                  onClick={() => onStyleUpdate({ textDecoration: zoneStyle?.textDecoration === 'underline' ? 'none' : 'underline' })}
                  className={cn('w-6 h-6 rounded text-xs underline flex items-center justify-center border transition-colors',
                    zoneStyle?.textDecoration === 'underline' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}
                  title="Underline">U</button>

                <span className="w-px h-3.5 bg-gray-200 mx-1" />

                {(['left', 'center', 'right'] as const).map((align) => (
                  <button key={align} type="button"
                    onClick={() => onStyleUpdate({ textAlign: align })}
                    className={cn('w-6 h-6 rounded text-[10px] flex items-center justify-center border transition-colors',
                      zoneStyle?.textAlign === align ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}
                    title={`Align ${align}`}>
                    {align === 'left' ? '⬅' : align === 'center' ? '≡' : '➡'}
                  </button>
                ))}

                <span className="w-px h-3.5 bg-gray-200 mx-1" />

                <input type="color"
                  value={zoneStyle?.color ?? '#000000'}
                  onChange={(e) => onStyleUpdate({ color: e.target.value })}
                  className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5"
                  title="Text color"
                />
              </div>

              {/* Row 2: font family + size */}
              <div className="flex items-center gap-1.5">
                <select
                  value={zoneStyle?.fontFamily ?? ''}
                  onChange={(e) => onStyleUpdate({ fontFamily: e.target.value || undefined })}
                  className="flex-1 text-[10px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white min-w-0"
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={8} max={120}
                  value={zoneStyle?.fontSize ?? ''}
                  onChange={(e) => onStyleUpdate({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="px"
                  className="w-14 text-[10px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 text-center bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
