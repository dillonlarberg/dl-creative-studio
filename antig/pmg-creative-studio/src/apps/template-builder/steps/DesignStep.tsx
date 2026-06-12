import { useEffect, useRef, useState } from 'react';
import { SparklesIcon, ExclamationTriangleIcon, XMarkIcon, PlusIcon, CursorArrowRaysIcon, ChevronUpIcon, ChevronDownIcon, PaintBrushIcon } from '@heroicons/react/24/outline';
import { SparklesIcon as SparklesIconSolid } from '@heroicons/react/24/solid';
import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData, RequirementField, ZoneStyle } from '../types';
import { cn } from '../../../utils/cn';
import { useAssetHouse } from '../../../platform/assetHouse/AssetHouseContext';
import { useTemplateBuilder } from '../TemplateBuilderContext';
import type { Candidate } from '../TemplateBuilderContext';
import { generateLayouts, suggestMappings } from '../../../services/ai/templateAI';
import { FilledTemplatePreview } from '../_internal/FilledTemplatePreview';
import { FIELD_ID_MAP } from '../_internal/injectIntoHtml';
import CanvasOverlay from '../_internal/CanvasOverlay';
import type { ZoneBound } from '../_internal/CanvasOverlay';
import { TemplatePreview } from '../_internal/TemplatePreview';
import { CandidatePreview } from '../_internal/CandidatePreview';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import { discoverSlots } from '../_internal/discoverSlots';
import type { TemplateSlot } from '../_internal/discoverSlots';
import { AskAlliPanel } from '../_internal/AskAlliPanel';
import { applyClientTransforms } from '../_internal/transformExecutor';

/**
 * Design step — "Design & Map" (Step 2 of 3: Setup → Design → Publish).
 *
 * Split-screen layout:
 *   Left  40% — Candidate selector, field mapping, brand overrides
 *   Right 60% — Live preview
 *
 * Uses the module-level ref pattern (same as SetupStep's _submitCallback)
 * so onEnter can call into context hooks that are only available inside
 * the mounted component tree.
 */

const IMAGE_COLUMN_KEYWORDS = ['image', 'img', 'url', 'link', 'photo', 'pic', 'src', 'thumb', 'media'] as const;
const CURRENCY_COLUMN_KEYWORDS = ['price', 'cost', 'amount', 'sale', 'msrp', 'value', 'fee', 'regular', 'final'] as const;
// Structural container IDs reported by zone-reporter that should not render as selectable overlay handles
const SKIP_ZONE_IDS = new Set(['ad', 'base', 'background', 'bg', 'body', 'ad-container', 'wrapper']);

type ColType = 'image_url' | 'url' | 'numeric' | 'text';

const COL_TYPE_LABELS: Record<ColType, string> = {
  image_url: 'Image URL',
  url: 'URL',
  numeric: 'Number',
  text: 'Text',
};

function inferColumnTypes(
  sampleData: Array<Record<string, unknown>>,
  cols: string[]
): Record<string, ColType> {
  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)/i;
  const IMAGE_DOMAIN = /(cdn\.|img\.|image\.|photo\.|static\.|media\.)/i;
  const URL_RE = /^https?:\/\//i;
  const NUM_RE = /^[\$€£¥]?[\d,]+\.?\d*[\$€£¥%]?$/;

  const result: Record<string, ColType> = {};
  for (const col of cols) {
    const samples = sampleData
      .map((row) => String(row[col] ?? '').trim())
      .filter((v) => v.length > 0)
      .slice(0, 5);

    // Column-name keyword fallback when sample data is sparse or empty
    const colLower = col.toLowerCase();
    if (samples.length === 0) {
      if (IMAGE_COLUMN_KEYWORDS.some((k) => colLower.includes(k))) result[col] = 'image_url';
      else if (CURRENCY_COLUMN_KEYWORDS.some((k) => colLower.includes(k))) result[col] = 'numeric';
      else result[col] = 'text';
      continue;
    }

    const allUrl = samples.every((v) => URL_RE.test(v));
    const anyImageClue = samples.some((v) => IMAGE_EXT.test(v) || IMAGE_DOMAIN.test(v))
      || IMAGE_COLUMN_KEYWORDS.some((k) => colLower.includes(k));
    const allNumeric = samples.every((v) => NUM_RE.test(v))
      || (samples.length === 0 && CURRENCY_COLUMN_KEYWORDS.some((k) => colLower.includes(k)));

    if (allUrl && anyImageClue) result[col] = 'image_url';
    else if (allUrl) result[col] = 'url';
    else if (allNumeric) result[col] = 'numeric';
    else result[col] = 'text';
  }
  return result;
}

function groupColumnsByInferredType(
  cols: string[],
  inferredTypes: Record<string, ColType>,
  fieldType: string
): Array<{ groupLabel: string; cols: string[] }> {
  const preferredType: ColType =
    fieldType === 'image' ? 'image_url' :
    fieldType === 'currency' ? 'numeric' :
    'text';

  const groups: Record<ColType, string[]> = { image_url: [], url: [], numeric: [], text: [] };
  for (const col of cols) {
    groups[inferredTypes[col] ?? 'text'].push(col);
  }

  const ordered: ColType[] = preferredType === 'image_url'
    ? ['image_url', 'url', 'text', 'numeric']
    : preferredType === 'numeric'
    ? ['numeric', 'text', 'image_url', 'url']
    : ['text', 'numeric', 'url', 'image_url'];

  return ordered
    .filter((t) => groups[t].length > 0)
    .map((t) => ({ groupLabel: COL_TYPE_LABELS[t], cols: groups[t] }));
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border-2 border-gray-100 p-4 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-5 w-12 bg-gray-100 rounded-full" />
      </div>
      <div className="h-2.5 w-full bg-gray-100 rounded" />
      <div className="h-2.5 w-3/4 bg-gray-100 rounded" />
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  selected,
  onClick,
}: {
  candidate: Candidate;
  selected: boolean;
  onClick: () => void;
}) {
  const variantColors: Record<string, string> = {
    grid: 'bg-blue-50 text-blue-700',
    stacked: 'bg-purple-50 text-purple-700',
    wide: 'bg-amber-50 text-amber-700',
    minimal: 'bg-gray-100 text-gray-600',
  };

  const wireframe = candidate.wireframeId
    ? SOCIAL_WIREFRAMES.find((w) => w.id === candidate.wireframeId)
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border-2 p-4 transition-all space-y-3',
        selected
          ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-100'
          : 'border-gray-100 hover:border-blue-200 bg-white'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-[11px] font-black uppercase tracking-tight',
            selected ? 'text-blue-900' : 'text-gray-900'
          )}
        >
          {candidate.name}
        </span>
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest',
            variantColors[candidate.variant] ?? 'bg-gray-100 text-gray-600'
          )}
        >
          {wireframe ? wireframe.name : candidate.variant}
        </span>
      </div>

      {/* Thumbnail — only render iframe when selected to avoid multiple simultaneous iframes */}
      {selected && wireframe && (
        <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center" style={{ height: `${Math.round((wireframe.adSize || 1024) * 0.2) + 10}px` }}>
          <TemplatePreview
            templateFile={wireframe.file}
            name={wireframe.name}
            scale={0.2}
            adSize={wireframe.adSize || 1024}
          />
        </div>
      )}
      {!selected && wireframe && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-2 py-1">
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest truncate">
            {wireframe.name}
          </p>
        </div>
      )}

      {/* Description */}
      <p className="text-[9px] text-gray-500 font-medium leading-relaxed line-clamp-2">
        {candidate.description}
      </p>
    </button>
  );
}

// ── Zone style toolbar ────────────────────────────────────────────────────────

function ZoneStyleToolbar({
  slotId,
  current,
  onChange,
}: {
  slotId: string;
  current: ZoneStyle | undefined;
  onChange: (slotId: string, partial: Partial<ZoneStyle>) => void;
}) {
  const toggleBtn = (
    label: string,
    active: boolean,
    onToggle: () => void,
    style?: React.CSSProperties
  ) => (
    <button
      type="button"
      onClick={onToggle}
      style={style}
      className={cn(
        'w-6 h-6 rounded-md border text-[10px] leading-none transition-all flex items-center justify-center',
        active
          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
          : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 mt-1">
      <label className="flex items-center gap-1.5">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Size</span>
        <input
          type="number"
          min={8}
          max={120}
          placeholder="—"
          value={current?.fontSize ?? ''}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(slotId, { fontSize: isNaN(v) ? undefined : v });
          }}
          className="w-14 px-1.5 py-1 rounded-lg border border-gray-200 text-[9px] font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Color</span>
        <input
          type="color"
          value={current?.color ?? '#000000'}
          onChange={(e) => onChange(slotId, { color: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">BG</span>
        <input
          type="color"
          value={current?.backgroundColor ?? '#ffffff'}
          onChange={(e) => onChange(slotId, { backgroundColor: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
        />
      </label>
      <div className="flex items-center gap-1">
        {toggleBtn(
          'B',
          current?.fontWeight === 'bold',
          () => onChange(slotId, { fontWeight: current?.fontWeight === 'bold' ? 'normal' : 'bold' }),
          { fontWeight: 700 }
        )}
        {toggleBtn(
          'I',
          current?.fontStyle === 'italic',
          () => onChange(slotId, { fontStyle: current?.fontStyle === 'italic' ? 'normal' : 'italic' }),
          { fontStyle: 'italic' }
        )}
        {toggleBtn(
          'U',
          current?.textDecoration === 'underline',
          () => onChange(slotId, { textDecoration: current?.textDecoration === 'underline' ? 'none' : 'underline' }),
          { textDecoration: 'underline' }
        )}
      </div>
    </div>
  );
}

// ── Step body ─────────────────────────────────────────────────────────────────

function DesignStepBody({
  stepData,
  mergeStepData,
}: StepRenderProps<TemplateBuilderStepData>) {
  const tbCtx = useTemplateBuilder();
  const { assetHouse } = useAssetHouse();

  const { candidates, requirements, feedColumns, setCandidates } = tbCtx;

  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [activeSlotField, setActiveSlotField] = useState<string | null>(null);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [discoveredSlots, setDiscoveredSlots] = useState<TemplateSlot[]>([]);
  const [previewRatioIndex, setPreviewRatioIndex] = useState(0);
  const [askAlliOpen, setAskAlliOpen] = useState(false);
  const [askAlliTargetField, setAskAlliTargetField] = useState<string | null>(null);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [addFieldPendingSlot, setAddFieldPendingSlot] = useState<string | null>(null);
  const [newFieldPreset, setNewFieldPreset] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'image' | 'currency'>('text');
  const [newFieldCustomLabel, setNewFieldCustomLabel] = useState('');
  const [addFieldError, setAddFieldError] = useState<string | null>(null);
  const [newFieldColumn, setNewFieldColumn] = useState('');
  const [styleOpenFieldId, setStyleOpenFieldId] = useState<string | null>(null);
  const [zoneBounds, setZoneBounds] = useState<Record<string, ZoneBound>>({});
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneCoverageStyleSlot, setZoneCoverageStyleSlot] = useState<string | null>(null);
  const [feedRowIndex, setFeedRowIndex] = useState(0);

  // Debounce ref for zoneStyles: color picker fires at ~60fps; without debounce
  // each drag event causes an iframe reload. 150ms means ~6 reloads/second max.
  const zoneStyleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleZoneStyleChange(slotId: string, partial: Partial<ZoneStyle>) {
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
  // Lets users style any field without having to manually assign a slot override first.
  const getEffectiveSlotId = (fieldId: string): string =>
    stepData.slotMappings?.[fieldId] ?? FIELD_ID_MAP[fieldId]?.targets[0] ?? fieldId;

  // Run layout generation + mapping suggestions on mount.
  // Cannot use onEnter for this because the wizard fires onEnter BEFORE navigating
  // to the step, so DesignStepBody is not yet mounted and _designCtx is null.
  // useEffect fires after mount, by which time requirements + feedColumns are
  // already set in context from SetupStep's submit.
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
          });
          setCandidates(generated);

          // Auto-apply the top candidate's wireframeId if the user hasn't manually
          // selected a wireframe yet. stepData is a snapshot from mount time — if the
          // user clicks the wireframe grid during the Gemini call, this check uses the
          // stale snapshot and may overwrite their selection. Acceptable trade-off:
          // re-clicking the desired wireframe recovers immediately.
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

      // Only apply column suggestions to feedMappings if none exist yet.
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
    fetch(`/template_examples/social/${stepData.wireframeFile}`)
      .then((r) => r.text())
      .then((html) => setDiscoveredSlots(discoverSlots(html)))
      .catch(() => setDiscoveredSlots([]));
  }, [stepData.wireframeFile]);

  // Listen for zone-bounds postMessages from the iframe (sent by buildInteractiveScript).
  // Clears when the wireframe changes so stale bounds don't linger during reload.
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

  // Clear zone bounds on wireframe change so the overlay hides until the next natural load.
  useEffect(() => {
    setZoneBounds({});
  }, [stepData.wireframeFile]);

  // Derived values
  const selectedCandidateIndex = stepData.selectedCandidateIndex ?? 0;
  const activeCandidate = candidates[selectedCandidateIndex ?? 0];
  const feedMappings = stepData.feedMappings ?? {};
  const feedSampleData = tbCtx.feedSampleData;

  const customFields = stepData.customFields ?? [];
  const fieldTransforms = stepData.fieldTransforms ?? {};
  const inferredColTypes = inferColumnTypes(
    feedSampleData as Array<Record<string, unknown>>,
    feedColumns
  );
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

  // Map slotId → fieldIds that use it (for duplicate-slot warning)
  const slotUseCounts: Record<string, string[]> = {};
  for (const [fieldId, slotId] of Object.entries(stepData.slotMappings ?? {})) {
    if (slotId) {
      slotUseCounts[slotId] = [...(slotUseCounts[slotId] ?? []), fieldId];
    }
  }

  const isSocial = stepData.channel === 'Social';
  const hasWireframe = Boolean(stepData.selectedWireframeId && stepData.wireframeFile);

  // Build injections for FilledTemplatePreview (when wireframe is selected)
  const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === stepData.selectedWireframeId);

  // Multi-ratio preview: compute container height from the selected ratio pill
  const previewBaseSize = askAlliOpen ? 280 : 360;
  const previewAdSize = wireframe?.adSize || 1024;
  const selectedRatioStr = (stepData.ratios ?? ['1:1'])[previewRatioIndex] ?? '1:1';
  const [_rw, _rh] = selectedRatioStr.split(':').map(Number);
  const previewAspect = (_rw && _rh) ? _rw / _rh : 1;
  const previewContainerH = Math.round(previewBaseSize / previewAspect);

  // Helper: find the first non-empty value for a column across all sample rows.
  // Row 0 may have empty cells; scanning forward finds the first real value.
  const firstVal = (col: string): string => {
    // Try the currently-previewed row first
    const currentRow = feedSampleData[feedRowIndex] as Record<string, unknown> | undefined;
    if (currentRow) {
      const v = String(currentRow[col] ?? '').trim();
      if (v) return v;
    }
    // Fallback: scan all rows for any non-empty value
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
      // 'ai' mode: Ask Alli writes back into feedMappings; handled naturally on next render
      if (raw) {
        const transforms = fieldTransforms[field.id] ?? [];
        const val = applyClientTransforms(raw, transforms, field.type);
        injections[field.id] = {
          type: field.type === 'image' ? 'image' : 'text',
          value: val,
        };
      }
    }
    // Inject logo from asset house
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
    <div className="flex gap-0 min-h-[600px] -mx-6">
      {/* ── Left panel (40%) ─────────────────────────────────────────── */}
      <div className="w-2/5 border-r border-gray-100 px-6 py-6 space-y-8 overflow-y-auto max-h-[calc(100vh-200px)]">

        {/* Candidate selector */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-3.5 w-3.5 text-blue-600" />
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              Layout Candidate
            </h4>
          </div>

          {layoutError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              {layoutError}
            </div>
          )}

          {isLoadingCandidates ? (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : candidates.length === 0 && !isSocial ? (
            <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
                Generating layout options…
              </p>
            </div>
          ) : candidates.length === 0 && isSocial ? null : (
            <div className="space-y-3">
              {candidates.map((c, idx) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  selected={idx === selectedCandidateIndex}
                  onClick={() => {
                    const wf = c.wireframeId
                      ? SOCIAL_WIREFRAMES.find((w) => w.id === c.wireframeId)
                      : null;
                    mergeStepData({
                      selectedCandidateIndex: idx,
                      ...(wf ? { selectedWireframeId: wf.id, wireframeFile: wf.file } : {}),
                    });
                  }}
                />
              ))}
              {/* Regenerate button */}
              <button
                type="button"
                disabled={isLoadingCandidates}
                onClick={async () => {
                  setIsLoadingCandidates(true);
                  setLayoutError(null);
                  try {
                    const generated = await generateLayouts({
                      requirements,
                      channel: stepData.channel ?? 'Social',
                      brand: assetHouse,
                      feedColumns,
                      brief: stepData.brief,
                    });
                    setCandidates(generated);
                  } catch (err) {
                    console.error('[DesignStep] regenerate failed:', err);
                    setLayoutError('Failed to regenerate layouts. Please try again.');
                  } finally {
                    setIsLoadingCandidates(false);
                  }
                }}
                className="w-full py-2 border border-gray-200 rounded-xl text-[9px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Regenerate
              </button>
            </div>
          )}
        </div>

        {/* Field mapping */}
        {allFields.length > 0 && (
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
                      <button
                        type="button"
                        title="Ask Alli about this field"
                        onClick={() => { setAskAlliTargetField(field.id); setAskAlliOpen(true); }}
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
                    {/* Source mode: Feed | Static | AI */}
                    <div className="flex gap-1 mb-1">
                      {(['feed', 'static', 'ai'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            const next = { ...(stepData.fieldSourceMode ?? {}), [field.id]: mode };
                            mergeStepData({ fieldSourceMode: next });
                            if (mode === 'ai') {
                              setAskAlliTargetField(field.id);
                              setAskAlliOpen(true);
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
                      <input
                        type="text"
                        placeholder={`Enter ${field.label.toLowerCase()}…`}
                        value={stepData.staticValues?.[field.id] ?? ''}
                        onChange={(e) =>
                          mergeStepData({
                            staticValues: { ...(stepData.staticValues ?? {}), [field.id]: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none text-[10px] font-bold text-gray-900"
                      />
                    ) : (stepData.fieldSourceMode?.[field.id] ?? 'feed') === 'ai' ? (
                      <div className="w-full px-3 py-2 rounded-xl border-2 border-purple-200 bg-purple-50 text-[9px] font-medium text-purple-800 cursor-pointer hover:bg-purple-100 transition-colors"
                        onClick={() => { setAskAlliTargetField(field.id); setAskAlliOpen(true); }}>
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
                        onChange={handleZoneStyleChange}
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
                            onChange={handleZoneStyleChange}
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

                {/* Column picker */}
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

                {/* Slot assignment (optional) */}
                {discoveredSlots.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest shrink-0">Zone</span>
                    <select
                      value={addFieldPendingSlot ?? ''}
                      onChange={(e) => setAddFieldPendingSlot(e.target.value || null)}
                      className="flex-1 px-2 py-1 rounded-xl border-2 border-gray-100 focus:border-blue-400 outline-none text-[9px] font-medium text-gray-700 bg-white"
                    >
                      <option value="">— Skip for now —</option>
                      {discoveredSlots.map((slot) => (
                        <option key={slot.slotId} value={slot.slotId}>
                          {slot.isKnown ? slot.label : slot.slotId} ({slot.slotId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!newFieldPreset || !newFieldColumn || (newFieldPreset === '__custom__' && !newFieldCustomLabel.trim())}
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
                      if (existingCustom.some((f) => f.id === id) || requirements.some((r) => r.id === id)) {
                        setAddFieldError(`"${label}" already exists — use a different name.`);
                        return;
                      }
                      setAddFieldError(null);
                      mergeStepData({
                        customFields: [...existingCustom, { id, label, type: newFieldType }],
                        feedMappings: { ...feedMappings, [id]: newFieldColumn },
                        ...(addFieldPendingSlot ? { slotMappings: { ...(stepData.slotMappings ?? {}), [id]: addFieldPendingSlot } } : {}),
                      });
                      setAddFieldOpen(false);
                      setAddFieldPendingSlot(null);
                      setNewFieldPreset('');
                      setNewFieldCustomLabel('');
                      setNewFieldColumn('');
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
        )}

        {/* Brand overrides (collapsible) */}
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

      {/* ── Right panel (60%) ─────────────────────────────────────────── */}
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
                onClick={() => { setAskAlliTargetField(null); setAskAlliOpen((v) => !v); }}
                className="inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 pl-2 pr-3 py-1 text-white shadow-lg shadow-indigo-500/30 text-[10px] font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all"
              >
                <SparklesIconSolid className="h-3.5 w-3.5 shrink-0" />
                Ask Alli
              </button>
            </div>

            {/* Ratio toggle — only shown when multiple ratios are selected in setup */}
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
                  // Landscape ratios: clip the card to show the correct proportion
                  // Portrait/square: show full wireframe, no artificial clipping
                  maxHeight: previewContainerH < previewBaseSize
                    ? `${previewContainerH + 48}px`
                    : undefined,
                }}
              >
                {/* Inner wrapper sized exactly to the preview so CanvasOverlay inset:0 aligns with iframe coordinates */}
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
                  slotSelectionMode={activeSlotField !== null}
                  highlightSlot={
                    activeSlotField !== null
                      ? ((stepData.slotMappings ?? {})[activeSlotField] ?? null)
                      : hoveredField !== null
                      ? ((stepData.slotMappings ?? {})[hoveredField] ?? null)
                      : null
                  }
                  onSlotClick={(slotId) => {
                    if (activeSlotField) {
                      mergeStepData({ slotMappings: { ...(stepData.slotMappings ?? {}), [activeSlotField]: slotId } });
                      setActiveSlotField(null);
                    } else {
                      setAddFieldPendingSlot(slotId);
                      setAddFieldOpen(true);
                    }
                  }}
                />
                <CanvasOverlay
                  zoneBounds={zoneBounds}
                  adSize={previewAdSize}
                  displaySize={previewBaseSize}
                  selectedZoneId={selectedZoneId}
                  onZoneSelect={(slotId) => {
                    setSelectedZoneId(slotId);
                    const fieldId = Object.entries(stepData.slotMappings ?? {}).find(([, s]) => s === slotId)?.[0];
                    if (fieldId) setStyleOpenFieldId(fieldId);
                  }}
                  onResizeDetected={() => setZoneBounds({})}
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
                    requirements={requirements}
                    feedColumns={feedColumns}
                    brand={assetHouse}
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

            {/* Portrait ratio note — wireframes are 1:1; production ads will use ratio-specific layouts */}
            {previewContainerH > previewBaseSize && (stepData.ratios?.length ?? 0) > 1 && (
              <p className="text-[8px] font-medium text-gray-300 text-center">
                Preview shows 1:1 wireframe — {selectedRatioStr} ads will use a portrait-optimized layout
              </p>
            )}
          </div>
        )}

        {/* Social + no wireframe → Wireframe picker + CandidatePreview */}
        {isSocial && !hasWireframe && (
          <div className="space-y-6">
            {/* Wireframe library picker */}
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

            {/* AI-recommended wireframes are shown as thumbnails in the left-panel
                candidate cards — the abstract CandidatePreview here is removed. */}
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
              assetHouse={assetHouse}
              logoVariant={stepData.logoVariant}
              accentColor={stepData.accentColor}
              backgroundColor={stepData.backgroundColor}
              ratios={stepData.ratios}
            />
          </div>
        )}

        {/* Empty state when no candidate yet */}
        {!activeCandidate && !isLoadingCandidates && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center border-2 border-dashed border-gray-100 rounded-3xl">
            <SparklesIcon className="h-8 w-8 text-gray-200 mb-3" />
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
              Select a layout candidate to preview
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lifecycle hooks ───────────────────────────────────────────────────────────

const validate: WizardStep<TemplateBuilderStepData>['validate'] = (data) => {
  const hasMappings = Object.keys(data.feedMappings ?? {}).length > 0;
  return hasMappings
    ? { ok: true }
    : { ok: false, reason: 'Map at least one field to continue' };
};

// Layout generation and mapping suggestions now live in a useEffect inside
// DesignStepBody (above). onEnter fired before the component mounted so
// _designCtx was always null — moved to mount-time effect instead.

// ── Export ────────────────────────────────────────────────────────────────────

export const designStep: WizardStep<TemplateBuilderStepData> = {
  id: 'design',
  name: 'Design & Map',
  description: 'Pick a layout, then map your feed columns to the template fields. The live preview updates as you go.',
  validate,
  render: (props) => <DesignStepBody {...props} />,
};
