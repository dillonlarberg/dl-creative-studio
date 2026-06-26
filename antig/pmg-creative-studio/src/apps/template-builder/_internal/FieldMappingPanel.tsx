import { useState } from 'react';
import {
  ExclamationTriangleIcon,
  XMarkIcon,
  PlusIcon,
  CursorArrowRaysIcon,
  PaintBrushIcon,
} from '@heroicons/react/24/outline';
import { SparklesIcon as SparklesIconSolid } from '@heroicons/react/24/solid';
import type { TemplateBuilderStepData, RequirementField } from '../types';
import type { TemplateSlot } from './discoverSlots';
import type { FeedOverflowRiskMap } from './feedOverflowAnalysis';
import { cn } from '../../../utils/cn';
import { ZoneStyleToolbar } from './ZoneStyleToolbar';
import { IMAGE_COLUMN_KEYWORDS, inferColumnTypes, groupColumnsByInferredType } from './columnUtils';

export interface FieldMappingPanelProps {
  stepData: TemplateBuilderStepData;
  mergeStepData: (partial: Partial<TemplateBuilderStepData>) => void;
  allFields: Array<RequirementField>;
  feedColumns: string[];
  feedSampleData: Array<Record<string, unknown>>;
  discoveredSlots: TemplateSlot[];
  // slot selection mode (clicking a zone in preview to assign)
  activeSlotField: string | null;
  setActiveSlotField: (fieldId: string | null) => void;
  // zone style toolbar
  styleOpenFieldId: string | null;
  setStyleOpenFieldId: (id: string | null) => void;
  // zone coverage style slot
  zoneCoverageStyleSlot: string | null;
  setZoneCoverageStyleSlot: (id: string | null) => void;
  // zone style change handler
  onZoneStyleChange: (slotId: string, partial: import('../types').ZoneStyle) => void;
  getEffectiveSlotId: (fieldId: string) => string;
  slotUseCounts: Record<string, string[]>;
  // Ask Alli
  onOpenAskAlli: (fieldId: string) => void;
  // add-field open state (lifted to DesignStep so PreviewPanel can also open it)
  addFieldOpen: boolean;
  setAddFieldOpen: (v: boolean) => void;
  // add-field slot selection mode
  addFieldSelectingSlot: boolean;
  setAddFieldSelectingSlot: (v: boolean) => void;
  addFieldPendingSlot: string | null;
  setAddFieldPendingSlot: (v: string | null) => void;
  overflowZoneIds?: Set<string>;
  feedOverflowRisk?: FeedOverflowRiskMap;
  highlightedCoverageSlot?: string | null;
  onCoverageSlotHighlight?: (id: string | null) => void;
}

export function FieldMappingPanel({
  stepData,
  mergeStepData,
  allFields,
  feedColumns,
  feedSampleData,
  discoveredSlots,
  activeSlotField,
  setActiveSlotField,
  styleOpenFieldId,
  setStyleOpenFieldId,
  zoneCoverageStyleSlot,
  setZoneCoverageStyleSlot,
  onZoneStyleChange,
  getEffectiveSlotId,
  slotUseCounts,
  onOpenAskAlli,
  addFieldOpen,
  setAddFieldOpen,
  addFieldSelectingSlot,
  setAddFieldSelectingSlot,
  addFieldPendingSlot,
  setAddFieldPendingSlot,
  overflowZoneIds,
  feedOverflowRisk,
  highlightedCoverageSlot,
  onCoverageSlotHighlight,
}: FieldMappingPanelProps) {
  const [newFieldPreset, setNewFieldPreset] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'image' | 'currency'>('text');
  const [newFieldCustomLabel, setNewFieldCustomLabel] = useState('');
  const [addFieldError, setAddFieldError] = useState<string | null>(null);
  const [newFieldColumn, setNewFieldColumn] = useState('');
  const [newFieldSourceMode, setNewFieldSourceMode] = useState<'feed' | 'static' | 'ai'>('feed');
  const [newFieldStaticValue, setNewFieldStaticValue] = useState('');
  const [addFieldStyleOpen, setAddFieldStyleOpen] = useState(false);

  const feedMappings = stepData.feedMappings ?? {};
  const fieldTransforms = stepData.fieldTransforms ?? {};
  const customFields = stepData.customFields ?? [];
  const inferredColTypes = inferColumnTypes(
    feedSampleData as Array<Record<string, unknown>>,
    feedColumns
  );

  // Zone coverage progress
  const mappedZoneCount = Object.values(stepData.slotMappings ?? {}).filter(Boolean).length;
  const totalZoneCount = discoveredSlots.length;
  const coveragePct = totalZoneCount > 0 ? Math.round((mappedZoneCount / totalZoneCount) * 100) : 0;
  const allZonesMapped = totalZoneCount > 0 && mappedZoneCount === totalZoneCount;

  // Per-field status dot: green=feed mapped, blue=static set, purple=ai, amber=empty
  function fieldDotColor(fieldId: string): string {
    const mode = stepData.fieldSourceMode?.[fieldId] ?? 'feed';
    if (mode === 'ai') return 'bg-purple-500';
    if (mode === 'feed' && feedMappings[fieldId]) return 'bg-green-500';
    if (mode === 'static' && stepData.staticValues?.[fieldId]) return 'bg-blue-500';
    return 'bg-amber-400';
  }

  if (allFields.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
          Field Mapping
        </h4>
        <span className="text-[9px] text-gray-400 tabular-nums">
          {allFields.filter(f => {
            const m = stepData.fieldSourceMode?.[f.id] ?? 'feed';
            return (m === 'feed' && feedMappings[f.id]) || (m === 'static' && stepData.staticValues?.[f.id]) || m === 'ai';
          }).length}/{allFields.length}
        </span>
      </div>
      {stepData.wireframeFile && discoveredSlots.length === 0 && (
        <p className="text-[9px] text-gray-400 italic">
          No injectable slots found — this template may not support zone assignment.
        </p>
      )}

      {/* Pre-flight issues */}
      {((overflowZoneIds?.size ?? 0) > 0 ||
        Object.keys(feedOverflowRisk ?? {}).length > 0 ||
        allFields.some((f) => {
          const mode = stepData.fieldSourceMode?.[f.id] ?? 'feed';
          return mode === 'feed' && !feedMappings[f.id];
        })) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 space-y-1.5">
          <p className="text-[9px] font-black text-amber-700 uppercase tracking-[0.2em] flex items-center gap-1.5">
            <ExclamationTriangleIcon className="h-3 w-3 shrink-0" />
            Pre-flight issues
          </p>
          {/* Current-row overflow (live iframe check) */}
          {[...(overflowZoneIds ?? [])].map((zoneId) => (
            <p key={`overflow-${zoneId}`} className="text-[9px] text-amber-700 pl-4">
              Zone <span className="font-semibold">{zoneId}</span> — text overflow on current row
            </p>
          ))}
          {/* Feed-wide overflow risk (analysis across all feed rows) */}
          {Object.values(feedOverflowRisk ?? {}).map((risk) => (
            <p key={`feed-risk-${risk.slotId}`} className="text-[9px] text-amber-700 pl-4">
              <span className="font-semibold">{risk.fieldLabel}</span>
              {' '}— at {risk.currentFontSize}px, overflows on ~{risk.overflowRows.toLocaleString()}/{risk.totalRows.toLocaleString()} rows
              {risk.suggestedFontSize != null && (
                <span className="text-amber-600"> · suggested max: {risk.suggestedFontSize}px</span>
              )}
            </p>
          ))}
          {allFields.filter((f) => {
            const mode = stepData.fieldSourceMode?.[f.id] ?? 'feed';
            return mode === 'feed' && !feedMappings[f.id];
          }).map((f) => (
            <p key={`unmapped-${f.id}`} className="text-[9px] text-amber-700 pl-4">
              <span className="font-semibold">{f.label}</span> — no feed column mapped
            </p>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {allFields.map((field) => {
          const currentVal = feedMappings[field.id] ?? '';
          const assignedSlot = (stepData.slotMappings ?? {})[field.id];
          const isSelectingSlot = activeSlotField === field.id;

          return (
            <div
              key={field.id}
              className={cn(
                'py-3 border-b border-gray-100 last:border-0 transition-colors',
                isSelectingSlot && 'bg-blue-50 rounded-xl px-2.5 -mx-2.5'
              )}

            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className={cn('shrink-0 w-1.5 h-1.5 rounded-full mt-px', fieldDotColor(field.id))} />
                <label className="text-[9px] font-black text-gray-700 uppercase tracking-widest flex-1 truncate">
                  {field.label}
                </label>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest shrink-0',
                    field.type === 'image'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-gray-100 text-gray-400'
                  )}
                >
                  {field.type}
                </span>
                {assignedSlot && (slotUseCounts[assignedSlot]?.length ?? 0) > 1 && (
                  <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-red-50 text-red-500 shrink-0" title="Two fields share this slot — only one will render">
                    Dup
                  </span>
                )}
                {discoveredSlots.length > 0 && (
                  <button
                    type="button"
                    title={isSelectingSlot ? 'Cancel zone selection' : 'Click a zone in the preview to assign'}
                    onClick={() => setActiveSlotField(isSelectingSlot ? null : field.id)}
                    className={cn(
                      'h-3.5 w-3.5 transition-colors shrink-0',
                      isSelectingSlot ? 'text-blue-600' : 'text-gray-300 hover:text-blue-500'
                    )}
                  >
                    <CursorArrowRaysIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  title="Edit zone styles"
                  onClick={() => setStyleOpenFieldId(styleOpenFieldId === field.id ? null : field.id)}
                  className={cn(
                    'h-3.5 w-3.5 transition-colors shrink-0',
                    styleOpenFieldId === field.id ? 'text-indigo-600' : 'text-gray-300 hover:text-indigo-500'
                  )}
                >
                  <PaintBrushIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Ask Alli about this field"
                  onClick={() => onOpenAskAlli(field.id)}
                  className="h-3.5 w-3.5 text-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
                >
                  <SparklesIconSolid className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* AI suggested badge + Accept */}
              {stepData.aiSuggestedMappings?.[field.id] && (
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 rounded-full">
                    <SparklesIconSolid className="h-2.5 w-2.5 text-purple-600" />
                    <span className="text-[7px] font-black text-purple-700 uppercase tracking-widest">AI suggested</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...(stepData.aiSuggestedMappings ?? {}) };
                      delete next[field.id];
                      mergeStepData({ aiSuggestedMappings: next });
                    }}
                    className="px-2 py-0.5 rounded-lg border border-green-100 bg-green-50 text-[8px] font-black text-green-700 uppercase tracking-widest hover:bg-green-100 transition-colors"
                  >
                    Accept ✓
                  </button>
                </div>
              )}
              {/* Source mode: Static | Feed | AI */}
              <div className="flex gap-1 mb-2">
                {(['static', 'feed', 'ai'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      const next = { ...(stepData.fieldSourceMode ?? {}), [field.id]: mode };
                      mergeStepData({ fieldSourceMode: next });
                      if (mode === 'ai') {
                        onOpenAskAlli(field.id);
                      }
                    }}
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-[8px] font-semibold border transition-all',
                      (stepData.fieldSourceMode?.[field.id] ?? 'feed') === mode
                        ? mode === 'ai' ? 'bg-purple-600 text-white border-purple-600' : 'bg-blue-600 text-white border-blue-600'
                        : 'bg-transparent text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                    )}
                  >
                    {mode === 'ai' ? '✦ AI' : mode === 'feed' ? 'Feed' : 'Static'}
                  </button>
                ))}
              </div>
              {(stepData.fieldSourceMode?.[field.id] ?? 'feed') === 'static' ? (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder={field.type === 'image' ? 'Paste image URL…' : `Enter ${field.label.toLowerCase()}…`}
                    value={stepData.staticValues?.[field.id] ?? ''}
                    onChange={(e) =>
                      mergeStepData({
                        staticValues: { ...(stepData.staticValues ?? {}), [field.id]: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none text-[10px] font-medium text-gray-800"
                  />
                  {field.type === 'image' && (
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id={`upload-static-${field.id}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (ev.target?.result) {
                              mergeStepData({ staticValues: { ...(stepData.staticValues ?? {}), [field.id]: ev.target.result as string } });
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <label
                        htmlFor={`upload-static-${field.id}`}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 text-[8px] font-black text-gray-500 uppercase tracking-widest hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                        Upload image
                      </label>
                      {stepData.staticValues?.[field.id]?.startsWith('data:') && (
                        <span className="text-[8px] font-bold text-green-600">✓ uploaded</span>
                      )}
                    </label>
                  )}
                </div>
              ) : (stepData.fieldSourceMode?.[field.id] ?? 'feed') === 'ai' ? (
                <div
                  className="w-full px-3 py-2 rounded-xl border-2 border-purple-200 bg-purple-50 text-[9px] font-medium text-purple-800 cursor-pointer hover:bg-purple-100 transition-colors"
                  onClick={() => onOpenAskAlli(field.id)}
                >
                  Generate via Ask Alli →
                </div>
              ) : (
                <>
                  <select
                    value={currentVal}
                    onChange={(e) =>
                      mergeStepData({
                        feedMappings: {
                          ...feedMappings,
                          [field.id]: e.target.value,
                        },
                      })
                    }
                    className={cn(
                      'w-full px-2.5 py-1.5 rounded-lg border outline-none transition-all text-[10px] font-medium text-gray-800 bg-white focus:ring-2',
                      field.type === 'image' && currentVal && !IMAGE_COLUMN_KEYWORDS.some((k) => currentVal.toLowerCase().includes(k))
                        ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-100'
                        : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/10'
                    )}
                  >
                    <option value="">— Select column —</option>
                    {groupColumnsByInferredType(feedColumns, inferredColTypes, field.type).map(({ groupLabel, cols }) => (
                      <optgroup key={groupLabel} label={groupLabel}>
                        {cols.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {field.type === 'image' && currentVal && !IMAGE_COLUMN_KEYWORDS.some((k) => currentVal.toLowerCase().includes(k)) && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <ExclamationTriangleIcon className="h-3 w-3 text-amber-500 shrink-0" />
                      <p className="text-[9px] font-bold text-amber-600">
                        "{currentVal}" may not contain image URLs — check this column has image links, not text or dates.
                      </p>
                    </div>
                  )}
                </>
              )}
              {/* Slot picker */}
              {discoveredSlots.length > 0 && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest shrink-0">Slot</span>
                  {isSelectingSlot ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-[9px] text-blue-600 font-bold">Click a zone in the preview →</span>
                      <button type="button" onClick={() => setActiveSlotField(null)} className="text-[8px] text-gray-400 hover:text-gray-600">cancel</button>
                    </div>
                  ) : (
                    <>
                      <select
                        value={assignedSlot ?? ''}
                        onChange={(e) => {
                          mergeStepData({ slotMappings: { ...(stepData.slotMappings ?? {}), [field.id]: e.target.value } });
                        }}
                        className="flex-1 px-2 py-1 rounded-lg border border-gray-200 focus:border-blue-400 outline-none text-[9px] font-medium text-gray-700 bg-white"
                      >
                        <option value="">— auto —</option>
                        {discoveredSlots.map((slot) => (
                          <option key={slot.slotId} value={slot.slotId}>
                            {slot.isKnown ? slot.label : slot.slotId} ({slot.slotId})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        title="Assign by clicking a zone in the preview"
                        onClick={() => setActiveSlotField(field.id)}
                        className="text-gray-300 hover:text-blue-500 transition-colors"
                      >
                        <CursorArrowRaysIcon className="h-3.5 w-3.5" />
                      </button>
                      {/* Palette button — toggle per-zone style toolbar */}
                      <button
                        type="button"
                        onClick={() => setStyleOpenFieldId(
                          styleOpenFieldId === field.id ? null : field.id
                        )}
                        title="Edit zone styles"
                        className={cn(
                          'p-1 rounded-lg transition-colors',
                          styleOpenFieldId === field.id
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'text-gray-500 hover:text-indigo-500'
                        )}
                      >
                        <PaintBrushIcon className="w-3 h-3" />
                      </button>
                      {assignedSlot && (
                        <button
                          type="button"
                          title="Clear slot"
                          onClick={() => {
                            const next = { ...(stepData.slotMappings ?? {}) };
                            delete next[field.id];
                            mergeStepData({ slotMappings: next });
                          }}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {/* Zone style toolbar — shown when palette button is toggled */}
              {styleOpenFieldId === field.id && (
                <ZoneStyleToolbar
                  slotId={getEffectiveSlotId(field.id)}
                  current={stepData.zoneStyles?.[getEffectiveSlotId(field.id)]}
                  onChange={onZoneStyleChange}
                />
              )}
              {/* Transform badges */}
              {(fieldTransforms[field.id] ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {(fieldTransforms[field.id] ?? []).map((transform) => (
                    <span
                      key={transform}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase tracking-wide"
                    >
                      {transform.replace(/_/g, ' ')}
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...fieldTransforms };
                          next[field.id] = (next[field.id] ?? []).filter((t) => t !== transform);
                          if ((next[field.id] ?? []).length === 0) delete next[field.id];
                          mergeStepData({ fieldTransforms: next });
                        }}
                        className="ml-0.5 text-indigo-400 hover:text-indigo-700 leading-none"
                        title={`Remove ${transform}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {customFields.some((f) => f.id === field.id) && (
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...feedMappings };
                    delete next[field.id];
                    const nextSlots = { ...(stepData.slotMappings ?? {}) };
                    delete nextSlots[field.id];
                    mergeStepData({
                      customFields: customFields.filter((f) => f.id !== field.id),
                      feedMappings: next,
                      slotMappings: nextSlots,
                    });
                  }}
                  className="text-[8px] font-bold text-red-400 hover:text-red-600 uppercase tracking-widest transition-colors mt-0.5"
                >
                  Remove field
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Accept All AI Suggestions */}
      {Object.keys(stepData.aiSuggestedMappings ?? {}).length > 0 && (
        <button
          type="button"
          onClick={() => mergeStepData({ aiSuggestedMappings: {} })}
          className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-[9px] font-black uppercase tracking-[0.2em] hover:bg-purple-700 flex items-center justify-center gap-2 transition-colors mt-2"
        >
          <SparklesIconSolid className="h-3.5 w-3.5" />
          Accept All AI Suggestions
        </button>
      )}

      {/* Zone Coverage */}
      {discoveredSlots.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          {/* Header + count */}
          <div className="flex items-center justify-between mb-2">
            <h4 className={cn(
              'text-[10px] font-black uppercase tracking-[0.2em] transition-colors',
              allZonesMapped ? 'text-green-700' : 'text-gray-400'
            )}>
              {allZonesMapped ? '✓ All Zones Assigned' : 'Zone Coverage'}
            </h4>
            <span className={cn(
              'text-[9px] font-bold tabular-nums transition-colors',
              allZonesMapped ? 'text-green-600' : mappedZoneCount > 0 ? 'text-blue-600' : 'text-gray-400'
            )}>
              {mappedZoneCount}/{totalZoneCount}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-gray-100 rounded-full mb-3 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                allZonesMapped ? 'bg-green-500' : coveragePct >= 50 ? 'bg-blue-500' : 'bg-amber-400'
              )}
              style={{ width: `${coveragePct}%` }}
            />
          </div>

          {/* Zone rows */}
          <div className="space-y-px">
            {discoveredSlots.map((slot) => {
              const isMapped = Object.values(stepData.slotMappings ?? {}).includes(slot.slotId);
              const ownerFieldId = Object.entries(stepData.slotMappings ?? {}).find(([, s]) => s === slot.slotId)?.[0];
              const styleOpen = zoneCoverageStyleSlot === slot.slotId;
              const isHighlighted = highlightedCoverageSlot === slot.slotId;
              return (
                <div key={slot.slotId}>
                  <div
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer',
                      isHighlighted
                        ? 'bg-indigo-50 ring-1 ring-indigo-200'
                        : isMapped ? 'hover:bg-gray-50' : 'hover:bg-amber-50/60'
                    )}
                    onClick={() => onCoverageSlotHighlight?.(isHighlighted ? null : slot.slotId)}
                  >
                    <span className={cn(
                      'shrink-0 w-1.5 h-1.5 rounded-full',
                      isMapped ? 'bg-green-500' : 'bg-amber-400'
                    )} />
                    <span className={cn(
                      'flex-1 text-[9px] font-medium truncate',
                      isMapped ? 'text-gray-500' : 'text-gray-700'
                    )}>
                      {slot.label}
                    </span>
                    <code className="shrink-0 text-[8px] font-mono text-gray-400">{slot.slotId}</code>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={isMapped ? 'Reassign this zone' : 'Assign to a field'}
                        onClick={() => {
                          if (isMapped && ownerFieldId) {
                            setActiveSlotField(ownerFieldId);
                          } else {
                            setAddFieldPendingSlot(slot.slotId);
                            setNewFieldCustomLabel(slot.label);
                            setNewFieldPreset('__custom__');
                            setNewFieldType(IMAGE_COLUMN_KEYWORDS.some((k) => slot.label.toLowerCase().includes(k)) ? 'image' : 'text');
                            setAddFieldOpen(true);
                          }
                        }}
                        className="text-gray-300 hover:text-blue-500 transition-colors"
                      >
                        <CursorArrowRaysIcon className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Edit zone styles"
                        onClick={() => setZoneCoverageStyleSlot(styleOpen ? null : slot.slotId)}
                        className={cn(
                          'transition-colors',
                          styleOpen ? 'text-indigo-600' : 'text-gray-300 hover:text-indigo-500'
                        )}
                      >
                        <PaintBrushIcon className="h-3 w-3" />
                      </button>
                      {!isMapped && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddFieldPendingSlot(slot.slotId);
                            setNewFieldCustomLabel(slot.label);
                            setNewFieldPreset('__custom__');
                            setNewFieldType(IMAGE_COLUMN_KEYWORDS.some((k) => slot.label.toLowerCase().includes(k)) ? 'image' : 'text');
                            setAddFieldOpen(true);
                          }}
                          className="text-[8px] font-semibold text-blue-600 hover:text-blue-800 ml-0.5 transition-colors"
                        >
                          Add →
                        </button>
                      )}
                    </div>
                  </div>
                  {styleOpen && (
                    <div className="px-2 pb-2">
                      <ZoneStyleToolbar
                        slotId={slot.slotId}
                        current={stepData.zoneStyles?.[slot.slotId]}
                        onChange={onZoneStyleChange}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Field */}
      {!addFieldOpen ? (
        <button
          type="button"
          onClick={() => setAddFieldOpen(true)}
          className="flex items-center gap-1.5 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors mt-2"
        >
          <PlusIcon className="h-3 w-3" />
          Add Field
        </button>
      ) : (
        <div className="border border-blue-100 rounded-xl p-4 space-y-4 bg-blue-50/20 mt-3">

          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Add field</p>
            {addFieldPendingSlot && (
              <span className="text-[9px] text-blue-600 font-medium">
                Zone: <code className="font-mono bg-blue-100 px-1 rounded text-blue-700">{addFieldPendingSlot}</code>
              </span>
            )}
          </div>

          {/* Step 1: Field name */}
          <div className="space-y-1.5">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Field name</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Headline, Price, BG Image…"
                value={newFieldCustomLabel}
                autoFocus
                onChange={(e) => {
                  const val = e.target.value;
                  setNewFieldCustomLabel(val);
                  setNewFieldPreset(val.trim() ? '__custom__' : '');
                  setAddFieldError(null);
                }}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none text-[10px] font-medium text-gray-800 bg-white"
              />
              {(['text', 'image'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewFieldType(t)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[8px] font-semibold border transition-all shrink-0',
                    newFieldType === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-400 bg-white hover:border-blue-300 hover:text-gray-600'
                  )}
                >
                  {t === 'text' ? 'Text' : 'Image'}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Data source (appears after field name chosen) */}
          {newFieldPreset && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Data source</p>
              <div className="flex gap-1">
                {(['static', 'feed', 'ai'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setNewFieldSourceMode(mode); setNewFieldStaticValue(''); }}
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-[8px] font-semibold border transition-all',
                      newFieldSourceMode === mode
                        ? mode === 'ai' ? 'bg-purple-600 text-white border-purple-600' : 'bg-blue-600 text-white border-blue-600'
                        : 'bg-transparent text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                    )}
                  >
                    {mode === 'ai' ? '✦ AI' : mode === 'feed' ? 'Feed' : 'Static'}
                  </button>
                ))}
              </div>

              {newFieldSourceMode === 'feed' ? (
                <select
                  value={newFieldColumn}
                  onChange={(e) => setNewFieldColumn(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none text-[10px] font-medium text-gray-800 bg-white"
                >
                  <option value="">— Select feed column —</option>
                  {groupColumnsByInferredType(feedColumns, inferredColTypes, newFieldType).map(({ groupLabel, cols }) => (
                    <optgroup key={groupLabel} label={groupLabel}>
                      {cols.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : newFieldSourceMode === 'static' ? (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder={newFieldType === 'image' ? 'Paste image URL…' : 'Enter static value…'}
                    value={newFieldStaticValue}
                    onChange={(e) => setNewFieldStaticValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none text-[10px] font-medium text-gray-800 bg-white"
                  />
                  {newFieldType === 'image' && (
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id="upload-new-field"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (ev.target?.result) setNewFieldStaticValue(ev.target.result as string);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <label
                        htmlFor="upload-new-field"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 text-[8px] font-semibold text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                        Upload image
                      </label>
                      {newFieldStaticValue.startsWith('data:') && (
                        <span className="text-[8px] font-semibold text-green-600">✓ uploaded</span>
                      )}
                    </label>
                  )}
                </div>
              ) : (
                <div
                  className="w-full px-2.5 py-2 rounded-lg border border-purple-200 bg-purple-50 text-[9px] font-medium text-purple-800 cursor-pointer hover:bg-purple-100 transition-colors"
                  onClick={() => {
                    if (!newFieldPreset) return;
                    const id = newFieldPreset === '__custom__'
                      ? newFieldCustomLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                      : newFieldPreset;
                    const label = newFieldPreset === '__custom__'
                      ? newFieldCustomLabel.trim()
                      : ({ headline_2: 'Headline 2', callout: 'Callout', price: 'Price', background_image: 'Background Image', cta: 'CTA' } as Record<string, string>)[newFieldPreset] ?? newFieldPreset;
                    if (!id || !label) return;
                    const existingCustom = stepData.customFields ?? [];
                    const requirements = allFields.filter((f) => !customFields.some((cf) => cf.id === f.id));
                    if (existingCustom.some((f) => f.id === id) || requirements.some((r) => r.id === id)) {
                      setAddFieldError(`"${label}" already exists — use a different name.`);
                      return;
                    }
                    mergeStepData({
                      customFields: [...existingCustom, { id, label, type: newFieldType }],
                      fieldSourceMode: { ...(stepData.fieldSourceMode ?? {}), [id]: 'ai' },
                      ...(addFieldPendingSlot ? { slotMappings: { ...(stepData.slotMappings ?? {}), [id]: addFieldPendingSlot } } : {}),
                    });
                    setAddFieldOpen(false);
                    setAddFieldPendingSlot(null);
                    setNewFieldPreset('');
                    setNewFieldCustomLabel('');
                    setNewFieldColumn('');
                    setNewFieldSourceMode('feed');
                    setNewFieldStaticValue('');
                    onOpenAskAlli(id);
                  }}
                >
                  Generate via Ask Alli →
                </div>
              )}
            </div>
          )}

          {/* Step 3: Zone assignment (optional, appears after field name chosen) */}
          {discoveredSlots.length > 0 && newFieldPreset && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                Zone <span className="normal-case font-normal text-gray-300">(optional)</span>
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={addFieldPendingSlot ?? ''}
                  onChange={(e) => { setAddFieldPendingSlot(e.target.value || null); setAddFieldSelectingSlot(false); }}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none text-[9px] font-medium text-gray-700 bg-white"
                >
                  <option value="">— Skip for now —</option>
                  {discoveredSlots.map((slot) => (
                    <option key={slot.slotId} value={slot.slotId}>
                      {slot.isKnown ? slot.label : slot.slotId} ({slot.slotId})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title={addFieldSelectingSlot ? 'Cancel — click preview to assign zone' : 'Click a zone in the preview to assign'}
                  onClick={() => setAddFieldSelectingSlot(!addFieldSelectingSlot)}
                  className={cn('shrink-0 transition-colors', addFieldSelectingSlot ? 'text-blue-600' : 'text-gray-400 hover:text-blue-500')}
                >
                  <CursorArrowRaysIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Edit zone styles"
                  disabled={!addFieldPendingSlot}
                  onClick={() => setAddFieldStyleOpen((v) => !v)}
                  className={cn('shrink-0 transition-colors disabled:opacity-30', addFieldStyleOpen ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-500')}
                >
                  <PaintBrushIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              {addFieldSelectingSlot && (
                <p className="text-[8px] font-semibold text-blue-600">Click a zone in the preview →</p>
              )}
              {addFieldStyleOpen && addFieldPendingSlot && (
                <ZoneStyleToolbar
                  slotId={addFieldPendingSlot}
                  current={stepData.zoneStyles?.[addFieldPendingSlot]}
                  onChange={onZoneStyleChange}
                />
              )}
            </div>
          )}

          {/* Actions + hint */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={
                  !newFieldPreset ||
                  (newFieldPreset === '__custom__' && !newFieldCustomLabel.trim()) ||
                  (newFieldSourceMode === 'feed' && !newFieldColumn) ||
                  (newFieldSourceMode === 'static' && !newFieldStaticValue.trim()) ||
                  newFieldSourceMode === 'ai'
                }
                onClick={() => {
                  const id =
                    newFieldPreset === '__custom__'
                      ? newFieldCustomLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                      : newFieldPreset;
                  const label =
                    newFieldPreset === '__custom__'
                      ? newFieldCustomLabel.trim()
                      : ({ headline_2: 'Headline 2', callout: 'Callout', price: 'Price', background_image: 'Background Image', cta: 'CTA' } as Record<string, string>)[newFieldPreset] ?? newFieldPreset;
                  const existingCustom = stepData.customFields ?? [];
                  const requirements = allFields.filter((f) => !customFields.some((cf) => cf.id === f.id));
                  if (existingCustom.some((f) => f.id === id) || requirements.some((r) => r.id === id)) {
                    setAddFieldError(`"${label}" already exists — use a different name.`);
                    return;
                  }
                  setAddFieldError(null);
                  mergeStepData({
                    customFields: [...existingCustom, { id, label, type: newFieldType }],
                    ...(newFieldSourceMode === 'feed'
                      ? { feedMappings: { ...feedMappings, [id]: newFieldColumn } }
                      : { fieldSourceMode: { ...(stepData.fieldSourceMode ?? {}), [id]: 'static' },
                          staticValues: { ...(stepData.staticValues ?? {}), [id]: newFieldStaticValue } }),
                    ...(addFieldPendingSlot ? { slotMappings: { ...(stepData.slotMappings ?? {}), [id]: addFieldPendingSlot } } : {}),
                  });
                  setAddFieldOpen(false);
                  setAddFieldPendingSlot(null);
                  setNewFieldPreset('');
                  setNewFieldCustomLabel('');
                  setNewFieldColumn('');
                  setNewFieldSourceMode('feed');
                  setNewFieldStaticValue('');
                  setAddFieldSelectingSlot(false);
                  setAddFieldStyleOpen(false);
                }}
                className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-blue-700"
              >
                Add field
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddFieldOpen(false);
                  setAddFieldPendingSlot(null);
                  setAddFieldError(null);
                  setNewFieldPreset('');
                  setNewFieldCustomLabel('');
                  setNewFieldColumn('');
                  setNewFieldSourceMode('feed');
                  setNewFieldStaticValue('');
                  setAddFieldSelectingSlot(false);
                  setAddFieldStyleOpen(false);
                }}
                className="py-2 px-3 rounded-lg text-[9px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
            {(() => {
              if (addFieldError) return <p className="text-[8px] font-semibold text-red-500">{addFieldError}</p>;
              if (!newFieldPreset) return <p className="text-[8px] text-gray-400 text-center">Pick a field name to continue</p>;
              if (newFieldSourceMode === 'feed' && !newFieldColumn) return <p className="text-[8px] text-amber-500 text-center">Select a feed column to add</p>;
              if (newFieldSourceMode === 'static' && !newFieldStaticValue.trim()) return <p className="text-[8px] text-amber-500 text-center">Enter a static value to add</p>;
              return null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
