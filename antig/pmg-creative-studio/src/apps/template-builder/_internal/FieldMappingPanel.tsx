import { useState } from 'react';
import {
  SparklesIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  PlusIcon,
  CursorArrowRaysIcon,
  PaintBrushIcon,
} from '@heroicons/react/24/outline';
import { SparklesIcon as SparklesIconSolid } from '@heroicons/react/24/solid';
import type { TemplateBuilderStepData, RequirementField } from '../types';
import type { TemplateSlot } from './discoverSlots';
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
  // add-field slot selection mode
  addFieldSelectingSlot: boolean;
  setAddFieldSelectingSlot: (v: boolean) => void;
  addFieldPendingSlot: string | null;
  setAddFieldPendingSlot: (v: string | null) => void;
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
  addFieldSelectingSlot,
  setAddFieldSelectingSlot,
  addFieldPendingSlot,
  setAddFieldPendingSlot,
}: FieldMappingPanelProps) {
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
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

  if (allFields.length === 0) return null;

  return (
    <div className="space-y-4">
      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
        Field Mapping
      </h4>
      {stepData.wireframeFile && discoveredSlots.length === 0 && (
        <p className="text-[9px] text-gray-400 italic">
          No injectable slots found — this template may not support zone assignment.
        </p>
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
                'space-y-1.5 p-3 rounded-xl transition-all border-2',
                isSelectingSlot ? 'bg-blue-50 border-blue-200' : 'border-transparent'
              )}
              onMouseEnter={() => setHoveredField(field.id)}
              onMouseLeave={() => setHoveredField(null)}
            >
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest flex-1">
                  {field.label}
                </label>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest',
                    field.type === 'image'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-gray-100 text-gray-400'
                  )}
                >
                  {field.type}
                </span>
                {assignedSlot && (slotUseCounts[assignedSlot]?.length ?? 0) > 1 && (
                  <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-red-50 text-red-500" title="Two fields share this slot — only one will render">
                    Dup slot
                  </span>
                )}
                {/* Cursor — click-assign zone in preview */}
                {discoveredSlots.length > 0 && (
                  <button
                    type="button"
                    title={isSelectingSlot ? 'Cancel zone selection' : 'Click a zone in the preview to assign'}
                    onClick={() => setActiveSlotField(isSelectingSlot ? null : field.id)}
                    className={cn(
                      'h-4 w-4 transition-colors shrink-0',
                      isSelectingSlot ? 'text-blue-600' : 'text-gray-300 hover:text-blue-500'
                    )}
                  >
                    <CursorArrowRaysIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Paintbrush — toggle zone style toolbar */}
                <button
                  type="button"
                  title="Edit zone styles"
                  onClick={() => setStyleOpenFieldId(styleOpenFieldId === field.id ? null : field.id)}
                  className={cn(
                    'h-4 w-4 transition-colors shrink-0',
                    styleOpenFieldId === field.id ? 'text-indigo-600' : 'text-gray-300 hover:text-indigo-500'
                  )}
                >
                  <PaintBrushIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Ask Alli about this field"
                  onClick={() => onOpenAskAlli(field.id)}
                  className="h-4 w-4 text-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
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
              <div className="flex gap-1 mb-1">
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
                      'px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wide transition-colors',
                      (stepData.fieldSourceMode?.[field.id] ?? 'feed') === mode
                        ? mode === 'ai' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {mode === 'ai' ? '✦ AI' : mode}
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
                    className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none text-[10px] font-bold text-gray-900"
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
                      'w-full px-3 py-2 rounded-xl border-2 focus:ring-4 outline-none transition-all text-[10px] font-bold text-gray-900 bg-white',
                      field.type === 'image' && currentVal && !IMAGE_COLUMN_KEYWORDS.some((k) => currentVal.toLowerCase().includes(k))
                        ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-50'
                        : 'border-gray-100 focus:border-blue-600 focus:ring-blue-50'
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
                        className="flex-1 px-2 py-1 rounded-xl border-2 border-gray-100 focus:border-blue-400 outline-none text-[9px] font-medium text-gray-700 bg-white"
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

      {/* Zone Coverage panel — shows slot mapping status */}
      {discoveredSlots.length > 0 && (
        <div className="mt-4 rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Zone Coverage</span>
            <span className="text-[8px] text-gray-400">
              {Object.values(stepData.slotMappings ?? {}).filter(Boolean).length}/{discoveredSlots.length} mapped
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {discoveredSlots.map((slot) => {
              const isMapped = Object.values(stepData.slotMappings ?? {}).includes(slot.slotId);
              const ownerFieldId = Object.entries(stepData.slotMappings ?? {}).find(([, s]) => s === slot.slotId)?.[0];
              const styleOpen = zoneCoverageStyleSlot === slot.slotId;
              return (
                <div key={slot.slotId} className="px-3 py-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-black ${
                        isMapped ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {isMapped ? '✓' : '!'}
                      </span>
                      <span className="text-[9px] font-medium text-gray-700 truncate">{slot.label}</span>
                      <span className="shrink-0 text-[7px] text-gray-400 font-mono">{slot.slotId}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {/* Cursor — assign/reassign slot to a field */}
                      <button
                        type="button"
                        title={isMapped ? 'Reassign this zone' : 'Assign to a field'}
                        onClick={() => {
                          if (isMapped && ownerFieldId) {
                            setActiveSlotField(ownerFieldId);
                          } else {
                            setAddFieldPendingSlot(slot.slotId);
                            setAddFieldOpen(true);
                          }
                        }}
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                      >
                        <CursorArrowRaysIcon className="h-3.5 w-3.5" />
                      </button>
                      {/* Paintbrush — style this zone directly */}
                      <button
                        type="button"
                        title="Edit zone styles"
                        onClick={() => setZoneCoverageStyleSlot(styleOpen ? null : slot.slotId)}
                        className={cn(
                          'p-0.5 rounded transition-colors',
                          styleOpen ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-500'
                        )}
                      >
                        <PaintBrushIcon className="h-3 w-3" />
                      </button>
                      {!isMapped && (
                        <button
                          type="button"
                          onClick={() => { setAddFieldPendingSlot(slot.slotId); setAddFieldOpen(true); }}
                          className="text-[8px] font-black text-indigo-600 hover:text-indigo-800"
                        >
                          Add →
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Inline zone style toolbar */}
                  {styleOpen && (
                    <ZoneStyleToolbar
                      slotId={slot.slotId}
                      current={stepData.zoneStyles?.[slot.slotId]}
                      onChange={onZoneStyleChange}
                    />
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
        <div className="border-2 border-blue-100 rounded-xl p-4 space-y-3 bg-blue-50/30 mt-2">
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">New Field</p>
            {addFieldPendingSlot && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[8px] font-black uppercase tracking-wide">
                → {addFieldPendingSlot}
              </span>
            )}
          </div>

          {/* Preset picker */}
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: 'headline_2', label: 'Headline 2', type: 'text' },
              { id: 'callout', label: 'Callout', type: 'text' },
              { id: 'price', label: 'Price', type: 'currency' },
              { id: 'background_image', label: 'BG Image', type: 'image' },
              { id: 'cta', label: 'CTA', type: 'text' },
              { id: '__custom__', label: 'Custom', type: 'text' },
            ] as Array<{ id: string; label: string; type: 'text' | 'image' | 'currency' }>).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setNewFieldPreset(preset.id);
                  setNewFieldType(preset.type);
                  if (preset.id !== '__custom__') setNewFieldCustomLabel('');
                  setAddFieldError(null);
                }}
                className={cn(
                  'px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wide border-2 transition-all',
                  newFieldPreset === preset.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-100 text-gray-400 hover:border-blue-200'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom label input */}
          {newFieldPreset === '__custom__' && (
            <input
              type="text"
              placeholder="Field label (e.g. Sub-headline)"
              value={newFieldCustomLabel}
              onChange={(e) => { setNewFieldCustomLabel(e.target.value); setAddFieldError(null); }}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none text-[10px] font-bold text-gray-900 bg-white"
            />
          )}

          {/* Source mode tabs */}
          <div className="flex gap-1">
            {(['static', 'feed', 'ai'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setNewFieldSourceMode(mode); setNewFieldStaticValue(''); }}
                className={cn(
                  'px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wide transition-colors',
                  newFieldSourceMode === mode
                    ? mode === 'ai' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                )}
              >
                {mode === 'ai' ? '✦ AI' : mode}
              </button>
            ))}
          </div>

          {/* Column picker / static input / AI */}
          {newFieldSourceMode === 'feed' ? (
            <select
              value={newFieldColumn}
              onChange={(e) => setNewFieldColumn(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 outline-none text-[10px] font-bold text-gray-900 bg-white"
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
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none text-[10px] font-bold text-gray-900 bg-white"
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
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 text-[8px] font-black text-gray-500 uppercase tracking-widest hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    Upload image
                  </label>
                  {newFieldStaticValue.startsWith('data:') && (
                    <span className="text-[8px] font-bold text-green-600">✓ uploaded</span>
                  )}
                </label>
              )}
            </div>
          ) : (
            <div
              className="w-full px-3 py-2 rounded-xl border-2 border-purple-200 bg-purple-50 text-[9px] font-medium text-purple-800 cursor-pointer hover:bg-purple-100 transition-colors"
              onClick={() => {
                // Field doesn't exist yet — commit it first, then open Ask Alli
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

          {/* Slot assignment (optional) */}
          {discoveredSlots.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest shrink-0">Zone</span>
                <select
                  value={addFieldPendingSlot ?? ''}
                  onChange={(e) => { setAddFieldPendingSlot(e.target.value || null); setAddFieldSelectingSlot(false); }}
                  className="flex-1 px-2 py-1 rounded-xl border-2 border-gray-100 focus:border-blue-400 outline-none text-[9px] font-medium text-gray-700 bg-white"
                >
                  <option value="">— Skip for now —</option>
                  {discoveredSlots.map((slot) => (
                    <option key={slot.slotId} value={slot.slotId}>
                      {slot.isKnown ? slot.label : slot.slotId} ({slot.slotId})
                    </option>
                  ))}
                </select>
                {/* Cursor — click a zone in the preview to assign */}
                <button
                  type="button"
                  title={addFieldSelectingSlot ? 'Cancel — click preview to assign zone' : 'Click a zone in the preview to assign'}
                  onClick={() => setAddFieldSelectingSlot(!addFieldSelectingSlot)}
                  className={cn(
                    'shrink-0 transition-colors',
                    addFieldSelectingSlot ? 'text-blue-600' : 'text-gray-400 hover:text-blue-500'
                  )}
                >
                  <CursorArrowRaysIcon className="h-3.5 w-3.5" />
                </button>
                {/* Paintbrush — style the pending zone */}
                <button
                  type="button"
                  title="Edit zone styles"
                  disabled={!addFieldPendingSlot}
                  onClick={() => setAddFieldStyleOpen((v) => !v)}
                  className={cn(
                    'shrink-0 transition-colors disabled:opacity-30',
                    addFieldStyleOpen ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-500'
                  )}
                >
                  <PaintBrushIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              {addFieldSelectingSlot && (
                <p className="text-[8px] font-bold text-blue-600 uppercase tracking-widest">
                  Click a zone in the preview →
                </p>
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

          {/* Actions */}
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
              className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white disabled:bg-gray-100 disabled:text-gray-300 transition-all"
            >
              Add
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
              className="py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
          {addFieldError && (
            <p className="text-[9px] font-bold text-red-500 mt-1">{addFieldError}</p>
          )}
        </div>
      )}
    </div>
  );
}
