import { SparklesIcon } from '@heroicons/react/24/outline';
import { SparklesIcon as SparklesIconSolid } from '@heroicons/react/24/solid';
import { SwatchIcon } from '@heroicons/react/24/outline';
import type { TemplateBuilderStepData, ZoneBound, RequirementField } from '../types';
import { cn } from '../../../utils/cn';
import { FilledTemplatePreview } from './FilledTemplatePreview';
import { AskAlliPanel } from './AskAlliPanel';
import { CanvasLayer } from './CanvasLayer';
import type { CanvasLayerProps } from './CanvasLayer';
import { TemplatePreview } from './TemplatePreview';
import { CandidatePreview } from './CandidatePreview';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import type { Candidate } from '../TemplateBuilderContext';
import type { ClientAssetHouse } from '../../../services/clientAssetHouse';

export interface PreviewPanelProps {
  stepData: TemplateBuilderStepData;
  mergeStepData: (partial: Partial<TemplateBuilderStepData>) => void;
  allFields: RequirementField[];
  feedSampleData: Array<Record<string, unknown>>;
  feedMappings: Record<string, string>;
  feedColumns: string[];
  injections: Record<string, { type: 'image' | 'text'; value: string }>;
  cssOverrides: Record<string, string>;
  wireframe: (typeof SOCIAL_WIREFRAMES)[number] | undefined;
  activeCandidate: Candidate | undefined;
  isSocial: boolean;
  hasWireframe: boolean;
  previewBaseSize: number;
  previewAdSize: number;
  previewContainerH: number;
  previewRatioIndex: number;
  setPreviewRatioIndex: (i: number) => void;
  selectedRatioStr: string;
  feedRowIndex: number;
  setFeedRowIndex: (fn: (i: number) => number) => void;
  // zone state
  zoneBounds: Record<string, ZoneBound>;
  selectedZoneId: string | null;
  setSelectedZoneId: (id: string | null) => void;
  // slot selection
  activeSlotField: string | null;
  setActiveSlotField: (id: string | null) => void;
  addFieldSelectingSlot: boolean;
  setAddFieldSelectingSlot: (v: boolean) => void;
  addFieldPendingSlot: string | null;
  setAddFieldPendingSlot: (v: string | null) => void;
  setAddFieldOpen: (v: boolean) => void;
  hoveredField: string | null;
  getEffectiveSlotId: (fieldId: string) => string;
  setStyleOpenFieldId: (id: string | null) => void;
  // Ask Alli
  askAlliOpen: boolean;
  onAskAlliToggle: () => void;
  askAlliTargetField: string | null;
  setAskAlliOpen: (v: boolean) => void;
  // brand kit
  onBrandKitOpen: () => void;
  brandKitReady: boolean;
  assetHouse: ClientAssetHouse | null | undefined;
  // resize
  onResizeDetected: () => void;
  // mutation handlers (passed through to CanvasLayer)
  onZoneMove: CanvasLayerProps['onZoneMove'];
  onZoneResize: CanvasLayerProps['onZoneResize'];
  onZoneCreate: CanvasLayerProps['onZoneCreate'];
  onZoneReset: CanvasLayerProps['onZoneReset'];
  onZoneDelete: CanvasLayerProps['onZoneDelete'];
  onZoneAsset: CanvasLayerProps['onZoneAsset'];
}

export function PreviewPanel({
  stepData,
  mergeStepData,
  allFields,
  feedSampleData,
  feedMappings,
  injections,
  cssOverrides,
  wireframe,
  activeCandidate,
  isSocial,
  hasWireframe,
  previewBaseSize,
  previewAdSize,
  previewContainerH,
  previewRatioIndex,
  setPreviewRatioIndex,
  selectedRatioStr,
  feedColumns,
  feedRowIndex,
  setFeedRowIndex,
  zoneBounds,
  selectedZoneId,
  setSelectedZoneId,
  activeSlotField,
  setActiveSlotField,
  addFieldSelectingSlot,
  setAddFieldSelectingSlot,
  addFieldPendingSlot,
  setAddFieldPendingSlot,
  setAddFieldOpen,
  hoveredField,
  getEffectiveSlotId,
  setStyleOpenFieldId,
  askAlliOpen,
  onAskAlliToggle,
  askAlliTargetField,
  setAskAlliOpen,
  onBrandKitOpen,
  brandKitReady,
  assetHouse,
  onResizeDetected,
  onZoneMove,
  onZoneResize,
  onZoneCreate,
  onZoneReset,
  onZoneDelete,
  onZoneAsset,
}: PreviewPanelProps) {
  return (
    <div className="flex-1 px-6 py-6 overflow-y-auto max-h-[calc(100vh-200px)]">

      {/* Social + wireframe selected → FilledTemplatePreview + optional Ask Alli panel */}
      {isSocial && hasWireframe && wireframe && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {wireframe.name} — Live Mapped Preview
              </span>
              <button
                type="button"
                onClick={() => mergeStepData({ selectedWireframeId: undefined, wireframeFile: undefined })}
                className="text-[9px] font-bold text-gray-300 hover:text-blue-500 transition-colors underline underline-offset-2"
              >
                Change
              </button>
            </div>
            {Object.keys(stepData.aiSuggestedMappings ?? {}).length > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-100 rounded-full">
                <SparklesIconSolid className="h-3 w-3 text-purple-600" />
                <span className="text-[8px] font-black text-purple-700 uppercase tracking-widest">
                  Claude auto-mapped {Object.keys(stepData.aiSuggestedMappings ?? {}).length} of {allFields.length} fields
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={onBrandKitOpen}
              className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-blue-400 transition-colors"
            >
              <SwatchIcon className="h-3.5 w-3.5 shrink-0" />
              Brand Kit
              <span
                className={cn(
                  'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full',
                  brandKitReady ? 'bg-green-500' : 'bg-amber-400'
                )}
              />
            </button>
            <button
              type="button"
              onClick={onAskAlliToggle}
              className="inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 pl-2 pr-3 py-1 text-white shadow-lg shadow-indigo-500/30 text-[10px] font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all"
            >
              <SparklesIconSolid className="h-3.5 w-3.5 shrink-0" />
              Ask Alli
            </button>
          </div>

          {/* Ratio toggle */}
          {(stepData.ratios?.length ?? 0) > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest shrink-0">Preview ratio</span>
              {(stepData.ratios ?? []).map((ratio, i) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setPreviewRatioIndex(i)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all',
                    previewRatioIndex === i
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>
          )}

          <div className={cn('flex gap-4', askAlliOpen ? 'items-stretch' : '')}>
            <div
              className={cn(
                'relative bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden transition-all',
                askAlliOpen ? 'flex-1' : 'w-full'
              )}
              style={{
                maxHeight: previewContainerH < previewBaseSize
                  ? `${previewContainerH + 48}px`
                  : undefined,
              }}
            >
              {/* Inner wrapper sized exactly to the preview so CanvasLayer inset:0 aligns with iframe coordinates */}
              <div style={{ position: 'relative', width: `${previewBaseSize}px`, height: `${previewBaseSize}px`, flexShrink: 0 }}>
                <FilledTemplatePreview
                  templateFile={wireframe.file}
                  name={wireframe.name}
                  scale={previewBaseSize / previewAdSize}
                  adSize={previewAdSize}
                  injections={injections}
                  cssOverrides={cssOverrides}
                  slotOverrides={stepData.slotMappings}
                  zoneStyles={stepData.zoneStyles}
                  slotSelectionMode={activeSlotField !== null || addFieldSelectingSlot}
                  highlightSlot={
                    activeSlotField !== null
                      ? getEffectiveSlotId(activeSlotField)
                      : addFieldSelectingSlot && addFieldPendingSlot
                      ? addFieldPendingSlot
                      : hoveredField !== null
                      ? getEffectiveSlotId(hoveredField)
                      : null
                  }
                  onSlotClick={(slotId) => {
                    if (activeSlotField) {
                      mergeStepData({ slotMappings: { ...(stepData.slotMappings ?? {}), [activeSlotField]: slotId } });
                      setActiveSlotField(null);
                    } else if (addFieldSelectingSlot) {
                      setAddFieldPendingSlot(slotId);
                      setAddFieldSelectingSlot(false);
                    } else {
                      setAddFieldPendingSlot(slotId);
                      setAddFieldOpen(true);
                    }
                  }}
                />
                <CanvasLayer
                  zoneBounds={zoneBounds}
                  adSize={previewAdSize}
                  displaySize={previewBaseSize}
                  zoneOverrides={stepData.zoneOverrides ?? {}}
                  customZones={stepData.customZones ?? []}
                  selectedZoneId={selectedZoneId}
                  onZoneSelect={(slotId) => {
                    setSelectedZoneId(slotId);
                    if (slotId) {
                      const fieldId = Object.entries(stepData.slotMappings ?? {}).find(([, s]) => s === slotId)?.[0];
                      if (fieldId) setStyleOpenFieldId(fieldId);
                    }
                  }}
                  onZoneMove={onZoneMove}
                  onZoneResize={onZoneResize}
                  onZoneCreate={onZoneCreate}
                  onZoneReset={onZoneReset}
                  onZoneDelete={onZoneDelete}
                  onZoneAsset={onZoneAsset}
                  activeSlotField={activeSlotField}
                  onResizeDetected={onResizeDetected}
                />
              </div>{/* end inner preview wrapper */}
              {activeSlotField !== null && (
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2.5 bg-blue-600/90 backdrop-blur-sm" style={{ borderRadius: '0 0 1.5rem 1.5rem' }}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">
                    Click a zone → "{allFields.find((r) => r.id === activeSlotField)?.label ?? activeSlotField}"
                  </span>
                  <button type="button" onClick={() => setActiveSlotField(null)} className="text-blue-200 hover:text-white text-[9px] font-bold uppercase tracking-widest ml-4 shrink-0">
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {askAlliOpen && (
              <div className="w-72 rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '360px' }}>
                <AskAlliPanel
                  stepData={stepData}
                  mergeStepData={mergeStepData}
                  onClose={() => setAskAlliOpen(false)}
                  targetFieldId={askAlliTargetField}
                  requirements={allFields}
                  feedColumns={feedColumns}
                  brand={assetHouse ?? null}
                />
              </div>
            )}
          </div>

          {/* Feed row navigator */}
          {feedSampleData.length > 0 && (
            <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
              <button
                type="button"
                onClick={() => setFeedRowIndex((i) => Math.max(0, i - 1))}
                disabled={feedRowIndex === 0}
                className="text-[8px] font-black text-gray-400 uppercase tracking-widest disabled:opacity-30 hover:text-blue-600 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-[8px] font-medium text-gray-400">
                Row {feedRowIndex + 1} of {feedSampleData.length}
              </span>
              <button
                type="button"
                onClick={() => setFeedRowIndex((i) => Math.min(feedSampleData.length - 1, i + 1))}
                disabled={feedRowIndex >= feedSampleData.length - 1}
                className="text-[8px] font-black text-blue-600 uppercase tracking-widest disabled:opacity-30 hover:text-blue-800 transition-colors"
              >
                Next →
              </button>
            </div>
          )}

          {/* Compact brand overrides */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2.5">
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Brand Overrides</label>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-gray-500">Colors</span>
              <div className="flex gap-1.5">
                <input
                  type="color"
                  value={stepData.backgroundColor || '#2563eb'}
                  onChange={(e) => mergeStepData({ backgroundColor: e.target.value })}
                  title="Background color"
                  className="h-6 w-6 rounded-full cursor-pointer border-0 p-0"
                  style={{ borderRadius: '50%' }}
                />
                <input
                  type="color"
                  value={stepData.accentColor || '#1f2937'}
                  onChange={(e) => mergeStepData({ accentColor: e.target.value })}
                  title="Accent color"
                  className="h-6 w-6 rounded-full cursor-pointer border-0 p-0"
                  style={{ borderRadius: '50%' }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-gray-500">Font</span>
              <span className="text-[9px] font-black text-gray-900 truncate max-w-[120px]">
                {stepData.fontFamily ?? assetHouse?.fontPrimary ?? 'Inter'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-gray-500">Logo</span>
              <div className="flex gap-1">
                {(['primary', 'inverse'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => mergeStepData({ logoVariant: v })}
                    className={cn(
                      'px-2 py-0.5 rounded text-[7px] font-black uppercase transition-colors',
                      (stepData.logoVariant ?? 'primary') === v
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {v === 'primary' ? 'Color' : 'White'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Portrait ratio note */}
          {previewContainerH > previewBaseSize && (stepData.ratios?.length ?? 0) > 1 && (
            <p className="text-[8px] font-medium text-gray-300 text-center">
              Preview shows 1:1 wireframe — {selectedRatioStr} ads will use a portrait-optimized layout
            </p>
          )}
        </div>
      )}

      {/* Social + no wireframe → Wireframe picker */}
      {isSocial && !hasWireframe && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div>
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                Choose a Social Template
              </h4>
              <p className="text-[9px] font-medium text-gray-300 mt-0.5">
                Select one to load it into the live preview and start mapping your feed columns
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SOCIAL_WIREFRAMES.map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() =>
                    mergeStepData({
                      selectedWireframeId: wf.id,
                      wireframeFile: wf.file,
                    })
                  }
                  className={cn(
                    'rounded-xl border-2 p-2 transition-all text-left',
                    stepData.selectedWireframeId === wf.id
                      ? 'border-blue-600'
                      : 'border-gray-200 hover:border-blue-300'
                  )}
                >
                  <TemplatePreview
                    templateFile={wf.file}
                    name={wf.name}
                    scale={0.15}
                    adSize={wf.adSize || 1024}
                  />
                  <p className="mt-1 text-[9px] font-bold text-center text-gray-600 truncate">
                    {wf.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Non-Social → CandidatePreview only */}
      {!isSocial && activeCandidate && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-blue-500 rounded-full" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {activeCandidate.name} — Live Preview
            </span>
          </div>
          <CandidatePreview
            candidate={activeCandidate}
            feedSampleData={feedSampleData}
            feedMappings={feedMappings}
            assetHouse={assetHouse ?? null}
            logoVariant={stepData.logoVariant}
            accentColor={stepData.accentColor}
            backgroundColor={stepData.backgroundColor}
            ratios={stepData.ratios}
          />
        </div>
      )}

      {/* Empty state when no candidate yet */}
      {!activeCandidate && !isSocial && (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center border-2 border-dashed border-gray-100 rounded-3xl">
          <SparklesIcon className="h-8 w-8 text-gray-200 mb-3" />
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
            Select a layout candidate to preview
          </p>
        </div>
      )}
    </div>
  );
}
