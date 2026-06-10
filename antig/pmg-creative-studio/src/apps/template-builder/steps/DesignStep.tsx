import { useEffect, useState } from 'react';
import { CheckIcon, SparklesIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData, RequirementField } from '../types';
import { cn } from '../../../utils/cn';
import { useAssetHouse } from '../../../platform/assetHouse/AssetHouseContext';
import { useTemplateBuilder } from '../TemplateBuilderContext';
import type { Candidate } from '../TemplateBuilderContext';
import { generateLayouts, suggestMappings } from '../../../services/ai/templateAI';
import { FilledTemplatePreview } from '../_internal/FilledTemplatePreview';
import { TemplatePreview } from '../_internal/TemplatePreview';
import { CandidatePreview } from '../_internal/CandidatePreview';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';

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

// ── Module-level context ref ─────────────────────────────────────────────────

interface DesignCtx {
  candidates: Candidate[];
  requirements: RequirementField[];
  feedColumns: string[];
  assetHouse: ReturnType<typeof useAssetHouse>['assetHouse'];
  setCandidates: (c: Candidate[]) => void;
  setIsLoadingCandidates: (v: boolean) => void;
  setSuggestedFields: (fields: Set<string>) => void;
  setLayoutError: (msg: string | null) => void;
  mergeStepData: (patch: Partial<TemplateBuilderStepData>) => void;
}

let _designCtx: DesignCtx | null = null;

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
  const variantColors: Record<Candidate['variant'], string> = {
    grid: 'bg-blue-50 text-blue-700',
    stacked: 'bg-purple-50 text-purple-700',
    wide: 'bg-amber-50 text-amber-700',
    minimal: 'bg-gray-100 text-gray-600',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border-2 p-4 transition-all',
        selected
          ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-100'
          : 'border-gray-100 hover:border-blue-200 bg-white'
      )}
    >
      <div className="flex items-center justify-between mb-2">
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
            variantColors[candidate.variant]
          )}
        >
          {candidate.variant}
        </span>
      </div>
      <p className="text-[9px] text-gray-500 font-medium leading-relaxed truncate">
        {candidate.description}
      </p>
    </button>
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
  const [suggestedFields, setSuggestedFields] = useState<Set<string>>(new Set());
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);

  // Wire the module-level ref every render so onEnter can reach context.
  _designCtx = {
    candidates,
    requirements,
    feedColumns,
    assetHouse,
    setCandidates,
    setIsLoadingCandidates,
    setSuggestedFields,
    setLayoutError,
    mergeStepData,
  };

  useEffect(() => {
    return () => {
      _designCtx = null;
    };
  }, []);

  // Derived values
  const selectedCandidateIndex = stepData.selectedCandidateIndex ?? 0;
  const activeCandidate = candidates[selectedCandidateIndex ?? 0];
  const feedMappings = stepData.feedMappings ?? {};
  const feedSampleData = tbCtx.feedSampleData;

  const dynamicRequirements = requirements.filter((r) => r.category === 'Dynamic');

  const isSocial = stepData.channel === 'Social';
  const hasWireframe = Boolean(stepData.selectedWireframeId && stepData.wireframeFile);

  // Build injections for FilledTemplatePreview (when wireframe is selected)
  const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === stepData.selectedWireframeId);
  const previewRow = (feedSampleData[0] as Record<string, unknown> | undefined) ?? {};

  const injections: Record<string, { type: 'image' | 'text'; value: string }> = {};
  if (wireframe) {
    for (const field of requirements) {
      const col = feedMappings[field.id];
      if (col) {
        const val = (previewRow[col] as string) || '';
        if (val) {
          injections[field.id] = {
            type: field.type === 'image' ? 'image' : 'text',
            value: val,
          };
        }
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
                  onClick={() => mergeStepData({ selectedCandidateIndex: idx })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Field mapping */}
        {dynamicRequirements.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              Field Mapping
            </h4>

            <div className="space-y-4">
              {dynamicRequirements.map((field) => {
                const isSuggested = suggestedFields.has(field.id);
                const currentVal = feedMappings[field.id] ?? '';

                return (
                  <div key={field.id} className="space-y-1.5">
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
                      {isSuggested && (
                        <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-gray-50 text-gray-400 flex items-center gap-1">
                          <CheckIcon className="h-2.5 w-2.5" />
                          AI suggested
                        </span>
                      )}
                    </div>
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
                      {feedColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
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
                  </div>
                );
              })}
            </div>
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
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest shrink-0 mt-0.5">
              {brandOpen ? 'Hide ▲' : 'Show ▼'}
            </span>
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

        {/* Social + wireframe selected → FilledTemplatePreview */}
        {isSocial && hasWireframe && wireframe && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {wireframe.name} — Live Mapped Preview
              </span>
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 flex items-center justify-center overflow-hidden" style={{ minHeight: '360px' }}>
              <FilledTemplatePreview
                templateFile={wireframe.file}
                name={wireframe.name}
                scale={360 / (wireframe.adSize || 1024)}
                adSize={wireframe.adSize || 1024}
                injections={injections}
                cssOverrides={cssOverrides}
              />
            </div>
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

            {/* Candidate preview below the picker (if a candidate is available) */}
            {activeCandidate && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                  Candidate Preview
                </h4>
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

const onEnter: WizardStep<TemplateBuilderStepData>['onEnter'] = async ({
  stepData,
  mergeStepData,
}) => {
  const ctx = _designCtx;
  if (!ctx) return;

  const { candidates, requirements, feedColumns, assetHouse, setCandidates, setIsLoadingCandidates, setSuggestedFields, setLayoutError } = ctx;

  // Generate layouts if not already done
  if (candidates.length === 0) {
    setIsLoadingCandidates(true);
    try {
      const generated = await generateLayouts({
        requirements,
        channel: stepData.channel ?? 'Social',
        brand: assetHouse,
      });
      setCandidates(generated);
    } catch (err) {
      console.error('[DesignStep] generateLayouts failed:', err);
      setLayoutError('Failed to generate layouts. Please go back and try again.');
    } finally {
      setIsLoadingCandidates(false);
    }
  }

  // Auto-suggest mappings if not already done
  if (!stepData.feedMappings || Object.keys(stepData.feedMappings).length === 0) {
    try {
      const suggested = await suggestMappings({ requirements, feedColumns });
      if (Object.keys(suggested).length > 0) {
        mergeStepData({ feedMappings: suggested });
        setSuggestedFields(new Set(Object.keys(suggested)));
      }
    } catch (err) {
      console.error('[DesignStep] suggestMappings failed:', err);
    }
  }
};

// ── Export ────────────────────────────────────────────────────────────────────

export const designStep: WizardStep<TemplateBuilderStepData> = {
  id: 'design',
  name: 'Design & Map',
  description: 'Pick a layout, then map your feed columns to the template fields. The live preview updates as you go.',
  validate,
  onEnter,
  render: (props) => <DesignStepBody {...props} />,
};
