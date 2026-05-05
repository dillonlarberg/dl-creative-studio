import { useEffect, useState } from 'react';
import {
  CheckCircleIcon,
  CheckIcon,
  PhotoIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { RequirementField, TemplateBuilderStepData } from '../types';
import { cn } from '../../../utils/cn';
import { generateCandidates } from '../_internal/handlers';
import { FilledTemplatePreview } from '../_internal/FilledTemplatePreview';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import {
  clientAssetHouseService,
  type ClientAssetHouse,
} from '../../../services/clientAssetHouse';

/**
 * Generate step — Generate Candidates.
 *
 * JSX lifted verbatim from UseCaseWizardPage.tsx lines 3568-3804.
 *
 * Two render paths:
 *   - Wireframe path: per-row FilledTemplatePreview using requirements +
 *     feedMappings + assetHouse-driven injections.
 *   - AI candidates path: clickable candidate grid (selection persists
 *     into `selectedCandidateIndex`).
 *
 * Asset-house fetch lives in two places:
 *   - `onEnter` reads it once for `generateCandidates` so the generated
 *     candidates pick up brand defaults (primaryColor, fontPrimary,
 *     logoPrimary, cornerRadius).
 *   - The body component re-fetches via useEffect for the wireframe-path
 *     preview's logo injection. Local fetch keeps the body self-contained
 *     without extending StepRenderProps.
 *
 * Transient `isGeneratingCandidates` flag is local useState; persistent
 * candidates / selection flow through mergeStepData.
 */

type AnyCandidate = {
  id?: string;
  name?: string;
  variant?: string;
  description?: string;
  strategy?: string;
  styles?: Record<string, unknown> & {
    primaryColor?: string;
    fontFamily?: string;
    logo?: string | null;
    accentRotation?: string;
  };
  elements?: {
    headline?: boolean;
    price?: boolean;
    image?: boolean;
    cta?: boolean;
    logo?: boolean;
  };
};

function GenerateStepBody({
  stepData,
  mergeStepData,
  client,
}: StepRenderProps<TemplateBuilderStepData>) {
  const [assetHouse, setAssetHouse] = useState<ClientAssetHouse | null>(null);

  const candidates = (stepData.candidates ?? []) as AnyCandidate[];
  const selectedCandidateIndex = stepData.selectedCandidateIndex ?? null;
  const requirements: RequirementField[] = stepData.requirements ?? [];
  const feedSampleData = stepData.feedSampleData ?? [];
  const feedMappings = stepData.feedMappings ?? {};

  // Local asset-house fetch for wireframe-path injections (logo etc.).
  useEffect(() => {
    let cancelled = false;
    if (!client.slug) return;
    void clientAssetHouseService
      .getAssetHouse(client.slug)
      .then((house) => {
        if (!cancelled) setAssetHouse(house);
      })
      .catch(() => {
        if (!cancelled) setAssetHouse(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client.slug]);

  // onEnter awaits generateCandidates before rendering; if candidates is
  // still empty here and no wireframe was selected, we're mid-async or
  // `requirements` was empty — show the spinner state from the monolith.
  const showLoading =
    candidates.length === 0 && !stepData.selectedWireframe;

  const wireframeFile = stepData.wireframeFile;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-1">
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
          {stepData.selectedWireframe ? 'Wireframe Integration' : 'Candidate Selection'}
        </label>
        <h3 className="text-xl font-bold text-gray-900 italic">
          {stepData.selectedWireframe ? 'Confirm Your Integration' : 'Review AI-Generated Scaffolds'}
        </h3>
      </div>

      {showLoading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <div className="h-20 w-20 border-4 border-blue-50 rounded-full animate-spin border-t-blue-600" />
            <SparklesIcon className="h-8 w-8 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-black text-gray-900 uppercase tracking-widest">Synthesizing Brands Standards...</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mapping data feeds to visual hierarchy (1/3)</p>
          </div>
        </div>
      ) : (() => {
        // --- TEMPLATE-SELECTED PATH ---
        const activeWf = SOCIAL_WIREFRAMES.find((w) => w.id === stepData.selectedWireframe);

        if (activeWf && wireframeFile) {
          const resolveFieldValue = (
            fieldId: string,
            row: Record<string, unknown> | null
          ): string => {
            const mapping = feedMappings[fieldId];
            if (!mapping) return '';
            if (mapping.startsWith('__upload__')) {
              return (stepData[`${fieldId}__upload`] as string) || '';
            }
            if (!row) return '';
            return (row[mapping] as string) || '';
          };

          const rowsToShow: Array<Record<string, unknown> | null> =
            feedSampleData.length > 0 ? feedSampleData.slice(0, 3) : [null];

          // Build per-row injections for FilledTemplatePreview
          const buildInjections = (row: Record<string, unknown> | null) => {
            const inj: Record<string, { type: 'image' | 'text'; value: string }> = {};
            for (const field of requirements) {
              const mode =
                (stepData[`${field.id}__mode`] as string) ||
                (field.category === 'Brand' ? 'brand' : 'feed');
              let finalVal = resolveFieldValue(field.id, row);
              if (
                mode === 'brand' &&
                field.label === 'Logo' &&
                assetHouse?.logoPrimary
              ) {
                finalVal = assetHouse.logoPrimary;
              }
              if (finalVal) {
                inj[field.id] = {
                  type: (field.type === 'image' ? 'image' : 'text') as
                    | 'image'
                    | 'text',
                  value: finalVal,
                };
              }
            }
            if (!inj['logo'] && assetHouse?.logoPrimary) {
              inj['logo'] = { type: 'image', value: assetHouse.logoPrimary };
            }
            return inj;
          };

          return (
            <div className="space-y-8">
              {/* Wireframe header banner */}
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <div className="h-8 w-8 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                  <CheckCircleIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-blue-900 uppercase tracking-widest">{activeWf.name}</p>
                  <p className="text-[9px] font-bold text-blue-500 uppercase tracking-tighter">{rowsToShow.length} variation{rowsToShow.length !== 1 ? 's' : ''} · {Object.keys(feedMappings).length} fields mapped</p>
                </div>
              </div>

              {/* One filled preview per feed row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {rowsToShow.map((row, idx) => {
                  const injections = buildInjections(row);
                  const previewSize = Math.round((activeWf.adSize || 1024) * 0.30);
                  return (
                    <div key={idx} className="space-y-3">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Variation #{idx + 1}</div>

                      {/* FilledTemplatePreview — real mapped data injected into HTML */}
                      <div
                        className="rounded-2xl overflow-hidden border-2 border-gray-100 shadow-xl"
                        style={{ width: `${previewSize}px`, height: `${previewSize}px` }}
                      >
                        <FilledTemplatePreview
                          templateFile={wireframeFile}
                          name={activeWf.name}
                          scale={0.30}
                          adSize={activeWf.adSize || 1024}
                          injections={injections}
                        />
                      </div>

                      {/* Field value pills */}
                      <div className="space-y-1.5">
                        {requirements.filter((r) => r.type !== 'image').map((field) => {
                          const val = resolveFieldValue(field.id, row);
                          return val ? (
                            <div key={field.id} className="flex items-start gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter shrink-0 pt-0.5 w-16 truncate">{field.label}</span>
                              <span className="text-[10px] font-bold text-gray-900 leading-tight flex-1 truncate">{val}</span>
                            </div>
                          ) : null;
                        })}
                        {requirements.filter((r) => r.type === 'image').map((field) => {
                          const val = resolveFieldValue(field.id, row);
                          return val ? (
                            <div key={field.id} className="rounded-xl overflow-hidden border border-gray-100">
                              <img src={val} className="w-full h-16 object-cover" alt={field.label} />
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // --- AI CANDIDATES PATH (no wireframe selected) ---
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {candidates.map((candidate, idx) => {
              const isSelected = selectedCandidateIndex === idx;
              return (
                <div
                  key={idx}
                  onClick={() => mergeStepData({ selectedCandidateIndex: idx })}
                  className={cn(
                    'relative group cursor-pointer rounded-2xl border-4 transition-all overflow-hidden',
                    isSelected
                      ? 'border-blue-600 shadow-2xl scale-[1.02]'
                      : 'border-transparent hover:border-blue-200'
                  )}
                >
                  {/* Preview Card */}
                  <div className="group relative bg-white overflow-hidden" style={{ fontFamily: candidate.styles?.fontFamily || 'Inter' }}>
                    {/* Candidate Preview Card */}
                    <div className="aspect-[3/4] relative border-b border-gray-100">
                      {/* Logo Slot */}
                      {candidate.elements?.logo && (
                        <div className="absolute top-4 left-4 h-6 w-20">
                          {candidate.styles?.logo ? (
                            <img src={candidate.styles.logo} className="h-full w-full object-contain object-left" alt="brand" />
                          ) : (
                            <div className="h-full w-full bg-gray-100 rounded animate-pulse" />
                          )}
                        </div>
                      )}

                      {/* Main Image Slot */}
                      <div className={cn(
                        'absolute overflow-hidden flex items-center justify-center transition-all duration-500',
                        candidate.variant === 'wide' ? 'inset-0' : 'inset-x-4 top-14 bottom-24 rounded-xl bg-gray-50 shadow-inner'
                      )}>
                        {feedSampleData[0] && feedMappings.image_url && feedSampleData[0][feedMappings.image_url] ? (
                          <img
                            src={feedSampleData[0][feedMappings.image_url] as string}
                            className={cn('h-full w-full object-cover', candidate.variant === 'wide' && 'opacity-40')}
                          />
                        ) : (
                          <PhotoIcon className="h-12 w-12 text-gray-100" />
                        )}
                      </div>

                      {/* Text Overlays */}
                      <div className={cn(
                        'absolute transition-all duration-500 w-full',
                        candidate.variant === 'stacked' ? 'px-6 top-1/2 -translate-y-1/2 text-left' :
                          candidate.variant === 'wide' ? 'inset-0 flex flex-col items-center justify-center p-8 text-center' :
                            'bottom-6 px-6 space-y-2'
                      )}>
                        {candidate.elements?.headline && feedMappings.headline && (
                          <div
                            className={cn(
                              'px-3 py-1.5 backdrop-blur-sm rounded shadow-lg transition-all w-max max-w-[90%]',
                              candidate.variant === 'stacked' ? 'bg-white text-gray-900 mb-2 border-l-4 border-blue-600' :
                                candidate.variant === 'wide' ? 'bg-transparent text-white scale-125 mb-4' :
                                  'bg-black/90 text-white transform rotate-[-1deg]'
                            )}
                            style={{
                              transform: candidate.styles?.accentRotation ? `rotate(${candidate.styles.accentRotation})` : undefined,
                            }}
                          >
                            <p className={cn(
                              'font-black uppercase italic truncate',
                              candidate.variant === 'wide' ? 'text-lg' : 'text-[9px]'
                            )}>
                              {(feedSampleData[0]?.[feedMappings.headline] as string) || 'Preview Headline'}
                            </p>
                          </div>
                        )}
                        {candidate.elements?.price && feedMappings.price && (
                          <div
                            className={cn(
                              'rounded px-3 flex items-center justify-center shadow-md transition-all',
                              candidate.variant === 'stacked' ? 'h-7 w-max min-w-[80px]' :
                                candidate.variant === 'wide' ? 'h-10 w-max min-w-[100px] bg-white text-gray-900' :
                                  'h-6 w-20 transform rotate-[1deg]'
                            )}
                            style={{
                              backgroundColor: candidate.variant === 'wide' ? 'white' : (candidate.styles?.primaryColor || '#2563eb'),
                              color: candidate.variant === 'wide' ? '#111827' : 'white',
                            }}
                          >
                            <p className={cn(
                              'font-black uppercase italic',
                              candidate.variant === 'wide' ? 'text-sm' : 'text-[8px]'
                            )}>
                              {(feedSampleData[0]?.[feedMappings.price] as string) || 'Offer'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Descriptor */}
                    <div className="p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-gray-900 uppercase tracking-widest">{candidate.name}</p>
                        <span className="text-[8px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded uppercase">{candidate.variant}</span>
                      </div>
                      <p className="text-[9px] text-gray-400 font-medium leading-relaxed">{candidate.description}</p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute top-4 right-4 bg-blue-600 text-white p-1 rounded-full">
                      <CheckIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

    </div>
  );
}

export const generateStep: WizardStep<TemplateBuilderStepData> = {
  id: 'generate',
  name: 'Generate Candidates',

  validate: (data) => {
    if (!data.candidates || data.candidates.length === 0) {
      return { ok: false, reason: 'Wait for candidate generation to finish' };
    }
    if (
      data.selectedCandidateIndex === undefined ||
      data.selectedCandidateIndex === null
    ) {
      return { ok: false, reason: 'Select a candidate to continue' };
    }
    return { ok: true };
  },

  // Mirrors monolith line 1249 — only fire if NO wireframe was selected.
  // Fetches the client's asset house so generateCandidates picks up brand
  // defaults (primaryColor / fontPrimary / logoPrimary / cornerRadius).
  onEnter: async ({ stepData, mergeStepData, client }) => {
    if (stepData.selectedWireframe) return;
    if (stepData.candidates && stepData.candidates.length > 0) return;
    let assetHouse: ClientAssetHouse | null = null;
    try {
      assetHouse = await clientAssetHouseService.getAssetHouse(client.slug);
    } catch {
      assetHouse = null;
    }
    const { candidates, selectedIndex } = await generateCandidates({
      selectedWireframe: stepData.selectedWireframe,
      requirements: stepData.requirements ?? [],
      assetHouse,
    });
    mergeStepData({ candidates, selectedCandidateIndex: selectedIndex });
  },

  render: (props) => <GenerateStepBody {...props} />,
};
