import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ExclamationTriangleIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { nanoid } from 'nanoid';
import type { TemplateBuilderStep, StepContext } from '../types';
import type { TemplateBuilderStepData, RequirementField, ZoneStyle, ZoneBound, CustomZone } from '../types';
import { cn } from '../../../utils/cn';
import { useAssetHouse } from '../../../platform/assetHouse/AssetHouseContext';
import { useTemplateBuilder } from '../TemplateBuilderContext';
import { generateLayouts, suggestMappings, bestSampleRow } from '../../../services/ai/templateAI';
import { FIELD_ID_MAP } from '../_internal/injectIntoHtml';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import { discoverSlots } from '../_internal/discoverSlots';
import type { TemplateSlot } from '../_internal/discoverSlots';
import { applyClientTransforms } from '../_internal/transformExecutor';
import { BrandKitDrawer } from '../../../components/brand/BrandKitDrawer';
import { SKIP_ZONE_IDS } from '../_internal/columnUtils';
import { CandidateSelector } from '../_internal/CandidateSelector';
import { FieldMappingPanel } from '../_internal/FieldMappingPanel';
import { PreviewPanel } from '../_internal/PreviewPanel';

/**
 * Design step — "Design & Map" (Step 2 of 3: Setup → Design → Publish).
 *
 * Split-screen layout:
 *   Left  40% — Candidate selector, field mapping
 *   Right 60% — Live preview (CanvasLayer replaces CanvasOverlay)
 *
 * Uses the module-level ref pattern (same as SetupStep's _submitCallback)
 * so onEnter can call into context hooks that are only available inside
 * the mounted component tree.
 */

// ── Step body ─────────────────────────────────────────────────────────────────

function DesignStepBody({
  stepData,
  mergeStepData,
}: StepContext<TemplateBuilderStepData>) {
  const tbCtx = useTemplateBuilder();
  const { assetHouse } = useAssetHouse();
  const { clientSlug } = useParams<{ clientSlug: string }>();

  const { candidates, requirements, feedColumns, setCandidates } = tbCtx;

  const brandKitReady = !!(
    assetHouse?.primaryColor && assetHouse?.fontPrimary &&
    assetHouse?.logoPrimary && assetHouse?.logoInverse
  );

  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandKitOpen, setBrandKitOpen] = useState(false);
  const [activeSlotField, setActiveSlotField] = useState<string | null>(null);
  // hoveredField for preview highlight — FieldMappingPanel owns hover state internally;
  // PreviewPanel receives null here (no cross-panel hover propagation needed post-refactor).
  const hoveredField: string | null = null;
  const [discoveredSlots, setDiscoveredSlots] = useState<TemplateSlot[]>([]);
  const [previewRatioIndex, setPreviewRatioIndex] = useState(0);
  const [askAlliOpen, setAskAlliOpen] = useState(false);
  const [askAlliTargetField, setAskAlliTargetField] = useState<string | null>(null);
  const [addFieldSelectingSlot, setAddFieldSelectingSlot] = useState(false);
  const [addFieldPendingSlot, setAddFieldPendingSlot] = useState<string | null>(null);
  const [styleOpenFieldId, setStyleOpenFieldId] = useState<string | null>(null);
  const [zoneBounds, setZoneBounds] = useState<Record<string, ZoneBound>>({});
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneCoverageStyleSlot, setZoneCoverageStyleSlot] = useState<string | null>(null);
  const [feedRowIndex, setFeedRowIndex] = useState(0);
  const [userHasEditedStyles, setUserHasEditedStyles] = useState(
    () => Object.keys(stepData.zoneStyles ?? {}).length > 0
  );

  // Debounce ref for zoneStyles: color picker fires at ~60fps; without debounce
  // each drag event causes an iframe reload. 150ms means ~6 reloads/second max.
  const zoneStyleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleZoneStyleChange(slotId: string, partial: Partial<ZoneStyle>) {
    setUserHasEditedStyles(true);
    const next = {
      ...(stepData.zoneStyles ?? {}),
      [slotId]: { ...(stepData.zoneStyles?.[slotId] ?? {}), ...partial },
    };
    if (zoneStyleDebounceRef.current) clearTimeout(zoneStyleDebounceRef.current);
    zoneStyleDebounceRef.current = setTimeout(() => {
      mergeStepData({ zoneStyles: next });
    }, 150);
  }

  // Effective target slot for a field: explicit override wins, otherwise use FIELD_ID_MAP's first target.
  const getEffectiveSlotId = (fieldId: string): string =>
    stepData.slotMappings?.[fieldId] ?? FIELD_ID_MAP[fieldId]?.targets[0] ?? fieldId;

  // ── Task 13: Canvas layer mutation handlers ───────────────────────────────

  const handleZoneMove = useCallback((id: string, bounds: ZoneBound) => {
    mergeStepData({ zoneOverrides: { ...(stepData.zoneOverrides ?? {}), [id]: bounds } });
  }, [mergeStepData, stepData.zoneOverrides]);

  const handleZoneResize = useCallback((id: string, bounds: ZoneBound) => {
    mergeStepData({ zoneOverrides: { ...(stepData.zoneOverrides ?? {}), [id]: bounds } });
  }, [mergeStepData, stepData.zoneOverrides]);

  const handleZoneCreate = useCallback((zone: Omit<CustomZone, 'id'>) => {
    const newZone = { ...zone, id: `custom_zone_${nanoid(6)}` } as CustomZone;
    mergeStepData({ customZones: [...(stepData.customZones ?? []), newZone] });
  }, [mergeStepData, stepData.customZones]);

  const handleZoneReset = useCallback((id: string) => {
    const next = { ...(stepData.zoneOverrides ?? {}) };
    delete next[id]; // NEVER assign undefined — use delete
    mergeStepData({ zoneOverrides: next });
  }, [mergeStepData, stepData.zoneOverrides]);

  const handleZoneDelete = useCallback((id: string) => {
    mergeStepData({ customZones: (stepData.customZones ?? []).filter((z) => z.id !== id) });
  }, [mergeStepData, stepData.customZones]);

  const handleZoneContentUpdate = useCallback((id: string, patch: { fieldId?: string; textContent?: string }) => {
    mergeStepData({
      customZones: (stepData.customZones ?? []).map((z) =>
        z.id === id ? ({ ...z, ...patch } as CustomZone) : z,
      ),
    });
  }, [mergeStepData, stepData.customZones]);

  const handleZoneAsset = useCallback((zoneId: string, assetUrl: string, isWireframe: boolean) => {
    if (isWireframe) {
      mergeStepData({ zoneAssets: { ...(stepData.zoneAssets ?? {}), [zoneId]: assetUrl } });
    } else {
      mergeStepData({
        customZones: (stepData.customZones ?? []).map((z) =>
          z.id === zoneId ? ({ ...z, assetUrl } as CustomZone) : z,
        ),
      });
    }
  }, [mergeStepData, stepData.zoneAssets, stepData.customZones]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Run layout generation + mapping suggestions on mount.
  useEffect(() => {
    const run = async () => {
      if (candidates.length === 0) {
        setIsLoadingCandidates(true);
        try {
          const generated = await generateLayouts({
            requirements,
            channel: stepData.channel ?? 'Social',
            brand: assetHouse,
            feedColumns,
            brief: stepData.brief,
            feedSampleRow: bestSampleRow(
              (feedSampleData ?? []).map(row =>
                Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]))
              )
            ),
          });
          setCandidates(generated);

          const top = generated[0];
          if (top?.wireframeId && !stepData.selectedWireframeId) {
            const wf = SOCIAL_WIREFRAMES.find((w) => w.id === top.wireframeId);
            if (wf) {
              mergeStepData({ selectedWireframeId: wf.id, wireframeFile: wf.file });
            }
          }
        } catch (err) {
          console.error('[DesignStep] generateLayouts failed:', err);
          setLayoutError('Failed to generate layouts. Please go back and try again.');
        } finally {
          setIsLoadingCandidates(false);
        }
      }

      try {
        const suggested = await suggestMappings({ requirements, feedColumns });
        const hasExisting = Object.keys(stepData.feedMappings ?? {}).length > 0;
        if (!hasExisting && Object.keys(suggested).length > 0) {
          const aiSuggestedMappings: Record<string, true> = {};
          for (const fieldId of Object.keys(suggested)) {
            aiSuggestedMappings[fieldId] = true;
          }
          mergeStepData({ feedMappings: suggested, aiSuggestedMappings });
        }
      } catch (err) {
        console.error('[DesignStep] suggestMappings failed:', err);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run only on mount — context values are stable at this point

  useEffect(() => {
    if (!stepData.wireframeFile) { setDiscoveredSlots([]); return; }
    let cancelled = false;
    fetch(`/template_examples/social/${stepData.wireframeFile}`)
      .then((r) => r.text())
      .then((html) => { if (!cancelled) setDiscoveredSlots(discoverSlots(html)); })
      .catch(() => { if (!cancelled) setDiscoveredSlots([]); });
    return () => { cancelled = true; };
  }, [stepData.wireframeFile]);

  // Listen for zone-bounds postMessages from the iframe.
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.type === 'zone-bounds' && e.data.zones) {
        const filtered = Object.fromEntries(
          Object.entries(e.data.zones as Record<string, ZoneBound>)
            .filter(([id]) => !SKIP_ZONE_IDS.has(id))
        );
        setZoneBounds(filtered);
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Clear zone bounds on wireframe change.
  useEffect(() => {
    setZoneBounds({});
  }, [stepData.wireframeFile]);

  // Empty-state guard: must come after ALL hooks.
  if (requirements.length === 0 && feedColumns.length === 0 && !isLoadingCandidates) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4 p-8">
        <ExclamationTriangleIcon className="h-10 w-10 text-amber-300 mx-auto" />
        <div className="space-y-2">
          <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest">
            Setup data didn't carry over
          </p>
          <p className="text-[11px] font-medium text-gray-400 max-w-xs mx-auto leading-relaxed">
            Your feed and brief weren't saved between sessions.
            Click <strong className="text-gray-600">Back</strong> to return to Setup and continue from there.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedCandidateIndex = stepData.selectedCandidateIndex ?? 0;
  const activeCandidate = candidates[selectedCandidateIndex ?? 0];
  const feedMappings = stepData.feedMappings ?? {};
  const feedSampleData = tbCtx.feedSampleData;

  const customFields = stepData.customFields ?? [];
  const fieldTransforms = stepData.fieldTransforms ?? {};
  const allFields: Array<RequirementField> = [
    ...requirements.filter((r) => r.category === 'Dynamic'),
    ...customFields.map((f) => ({
      id: f.id,
      label: f.label,
      category: 'Dynamic' as const,
      source: 'Feed',
      type: f.type,
    })),
  ];

  const slotUseCounts: Record<string, string[]> = {};
  for (const [fieldId, slotId] of Object.entries(stepData.slotMappings ?? {})) {
    if (slotId) {
      slotUseCounts[slotId] = [...(slotUseCounts[slotId] ?? []), fieldId];
    }
  }

  const isSocial = stepData.channel === 'Social';
  const hasWireframe = Boolean(stepData.selectedWireframeId && stepData.wireframeFile);
  const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === stepData.selectedWireframeId);

  // Multi-ratio preview
  const previewBaseSize = askAlliOpen ? 280 : 360;
  const previewAdSize = wireframe?.adSize || 1024;
  const selectedRatioStr = (stepData.ratios ?? ['1:1'])[previewRatioIndex] ?? '1:1';
  const [_rw, _rh] = selectedRatioStr.split(':').map(Number);
  const previewAspect = (_rw && _rh) ? _rw / _rh : 1;
  const previewContainerH = Math.round(previewBaseSize / previewAspect);

  const firstVal = (col: string): string => {
    const currentRow = feedSampleData[feedRowIndex] as Record<string, unknown> | undefined;
    if (currentRow) {
      const v = String(currentRow[col] ?? '').trim();
      if (v) return v;
    }
    for (const row of feedSampleData) {
      const v = String((row as Record<string, unknown>)[col] ?? '').trim();
      if (v) return v;
    }
    return '';
  };

  const injections: Record<string, { type: 'image' | 'text'; value: string }> = {};
  if (wireframe) {
    for (const field of allFields) {
      const sourceMode = stepData.fieldSourceMode?.[field.id] ?? 'feed';
      let raw = '';
      if (sourceMode === 'static') {
        raw = stepData.staticValues?.[field.id] ?? '';
      } else if (sourceMode === 'feed') {
        const col = feedMappings[field.id];
        if (col) raw = firstVal(col);
      }
      if (raw) {
        const transforms = fieldTransforms[field.id] ?? [];
        const val = applyClientTransforms(raw, transforms, field.type);
        injections[field.id] = {
          type: field.type === 'image' ? 'image' : 'text',
          value: val,
        };
      }
    }
    const logoVal =
      stepData.logoVariant === 'inverse'
        ? assetHouse?.logoInverse || assetHouse?.logoPrimary || ''
        : assetHouse?.logoPrimary || '';
    if (logoVal) injections['logo'] = { type: 'image', value: logoVal };
  }

  const cssOverrides: Record<string, string> = {
    ...(stepData.backgroundColor ? { background_color: stepData.backgroundColor } : {}),
    ...(stepData.accentColor ? { accent_color: stepData.accentColor } : {}),
    ...(stepData.fontFamily ? { font_family: stepData.fontFamily } : {}),
  };

  return (
    <>
    <div className="flex gap-0 min-h-[600px] -mx-6">
      {/* ── Left panel (40%) ─────────────────────────────────────────── */}
      <div className="w-2/5 border-r border-gray-100 px-6 py-6 space-y-8 overflow-y-auto max-h-[calc(100vh-200px)]">

        {/* Task 10: Candidate selector */}
        <CandidateSelector
          stepData={stepData}
          mergeStepData={mergeStepData}
          isLoadingCandidates={isLoadingCandidates}
          setIsLoadingCandidates={setIsLoadingCandidates}
          layoutError={layoutError}
          setLayoutError={setLayoutError}
          selectedCandidateIndex={selectedCandidateIndex}
          userHasEditedStyles={userHasEditedStyles}
        />

        {/* Task 11: Field mapping panel */}
        {allFields.length > 0 && (
          <FieldMappingPanel
            stepData={stepData}
            mergeStepData={mergeStepData}
            allFields={allFields}
            feedColumns={feedColumns}
            feedSampleData={feedSampleData}
            discoveredSlots={discoveredSlots}
            activeSlotField={activeSlotField}
            setActiveSlotField={setActiveSlotField}
            styleOpenFieldId={styleOpenFieldId}
            setStyleOpenFieldId={setStyleOpenFieldId}
            zoneCoverageStyleSlot={zoneCoverageStyleSlot}
            setZoneCoverageStyleSlot={setZoneCoverageStyleSlot}
            onZoneStyleChange={handleZoneStyleChange}
            getEffectiveSlotId={getEffectiveSlotId}
            slotUseCounts={slotUseCounts}
            onOpenAskAlli={(fieldId) => { setAskAlliTargetField(fieldId); setAskAlliOpen(true); }}
            addFieldSelectingSlot={addFieldSelectingSlot}
            setAddFieldSelectingSlot={setAddFieldSelectingSlot}
            addFieldPendingSlot={addFieldPendingSlot}
            setAddFieldPendingSlot={setAddFieldPendingSlot}
          />
        )}

        {/* Brand overrides (collapsible) — full-form stays in left panel */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setBrandOpen((v) => !v)}
            className="flex items-start justify-between w-full group text-left"
          >
            <div>
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] group-hover:text-gray-600 transition-colors">
                Brand Overrides
              </h4>
              <p className="text-[9px] font-medium text-gray-300 mt-0.5">
                Adjust colors, font, and logo variant for this template
              </p>
            </div>
            {brandOpen ? (
              <ChevronUpIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            ) : (
              <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            )}
          </button>

          {brandOpen && (
            <div className="space-y-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
              {/* Background color */}
              <div className="flex items-center justify-between gap-3">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest shrink-0">
                  Background
                </label>
                <input
                  type="color"
                  value={stepData.backgroundColor || '#ffffff'}
                  onChange={(e) => mergeStepData({ backgroundColor: e.target.value })}
                  className="h-7 w-10 rounded-lg border border-gray-200 cursor-pointer p-0 overflow-hidden"
                />
              </div>

              {/* Accent color */}
              <div className="flex items-center justify-between gap-3">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest shrink-0">
                  Accent
                </label>
                <input
                  type="color"
                  value={stepData.accentColor || '#2563eb'}
                  onChange={(e) => mergeStepData({ accentColor: e.target.value })}
                  className="h-7 w-10 rounded-lg border border-gray-200 cursor-pointer p-0 overflow-hidden"
                />
              </div>

              {/* Font family */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Font Family
                </label>
                <input
                  type="text"
                  value={stepData.fontFamily ?? assetHouse?.fontPrimary ?? 'Inter'}
                  onChange={(e) => mergeStepData({ fontFamily: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-[10px] font-bold text-gray-900"
                  placeholder="Inter"
                />
              </div>

              {/* Logo variant */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Logo Variant
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['primary', 'inverse'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => mergeStepData({ logoVariant: v })}
                      className={cn(
                        'flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all text-[8px] font-black uppercase',
                        (stepData.logoVariant ?? 'primary') === v
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-100 text-gray-400'
                      )}
                    >
                      <div
                        className={cn(
                          'h-4 w-10 rounded mb-1.5',
                          v === 'primary' ? 'bg-gray-900' : 'bg-gray-200 border border-gray-100'
                        )}
                      />
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel (60%) — Task 12: PreviewPanel ─────────────────── */}
      <PreviewPanel
        stepData={stepData}
        mergeStepData={mergeStepData}
        allFields={allFields}
        feedSampleData={feedSampleData}
        feedMappings={feedMappings}
        feedColumns={feedColumns}
        injections={injections}
        cssOverrides={cssOverrides}
        wireframe={wireframe}
        activeCandidate={activeCandidate}
        isSocial={isSocial}
        hasWireframe={hasWireframe}
        previewBaseSize={previewBaseSize}
        previewAdSize={previewAdSize}
        previewContainerH={previewContainerH}
        previewRatioIndex={previewRatioIndex}
        setPreviewRatioIndex={setPreviewRatioIndex}
        selectedRatioStr={selectedRatioStr}
        feedRowIndex={feedRowIndex}
        setFeedRowIndex={setFeedRowIndex}
        zoneBounds={zoneBounds}
        selectedZoneId={selectedZoneId}
        setSelectedZoneId={setSelectedZoneId}
        activeSlotField={activeSlotField}
        setActiveSlotField={setActiveSlotField}
        addFieldSelectingSlot={addFieldSelectingSlot}
        setAddFieldSelectingSlot={setAddFieldSelectingSlot}
        addFieldPendingSlot={addFieldPendingSlot}
        setAddFieldPendingSlot={setAddFieldPendingSlot}
        setAddFieldOpen={() => {}}
        hoveredField={hoveredField}
        getEffectiveSlotId={getEffectiveSlotId}
        setStyleOpenFieldId={setStyleOpenFieldId}
        askAlliOpen={askAlliOpen}
        onAskAlliToggle={() => { setAskAlliTargetField(null); setAskAlliOpen((v) => !v); }}
        askAlliTargetField={askAlliTargetField}
        setAskAlliOpen={setAskAlliOpen}
        onBrandKitOpen={() => setBrandKitOpen((v) => !v)}
        brandKitReady={brandKitReady}
        assetHouse={assetHouse}
        onResizeDetected={() => setZoneBounds({})}
        onZoneMove={handleZoneMove}
        onZoneResize={handleZoneResize}
        onZoneCreate={handleZoneCreate}
        onZoneReset={handleZoneReset}
        onZoneDelete={handleZoneDelete}
        onZoneAsset={handleZoneAsset}
        onZoneContentUpdate={handleZoneContentUpdate}
        onZoneStyleUpdate={handleZoneStyleChange}
      />
    </div>

    <BrandKitDrawer
      open={brandKitOpen}
      onClose={() => setBrandKitOpen(false)}
      clientSlug={clientSlug ?? ''}
      assetHouse={assetHouse}
    />
    </>
  );
}

// ── Lifecycle hooks ───────────────────────────────────────────────────────────

const validate: TemplateBuilderStep<TemplateBuilderStepData>['validate'] = (data) => {
  const hasMappings = Object.keys(data.feedMappings ?? {}).length > 0;
  return hasMappings
    ? { ok: true }
    : { ok: false, reason: 'Map at least one field to continue' };
};

// ── Export ────────────────────────────────────────────────────────────────────

export const designStep: TemplateBuilderStep<TemplateBuilderStepData> = {
  id: 'design',
  name: 'Design & Map',
  description: 'Pick a layout, then map your feed columns to the template fields. The live preview updates as you go.',
  validate,
  render: (props) => <DesignStepBody {...props} />,
};
