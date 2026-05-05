import { useState } from 'react';
import {
  ChevronLeftIcon,
  CircleStackIcon,
  PhotoIcon,
  RectangleGroupIcon,
  CheckCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData } from '../types';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import { cn } from '../../../utils/cn';
import { templateService } from '../../../services/templates';
import type { TemplateRecord } from '../../../services/templates';
import { useEffect } from 'react';
import { TemplatePreview } from '../_internal/TemplatePreview';
import { BASELINE_ASSETS } from '../_internal/baseline';

/**
 * Context step — Define Context. JSX lifted from
 * UseCaseWizardPage.tsx lines 2221-2538.
 */

const CHANNELS: Array<TemplateBuilderStepData['channel']> = [
  'Social',
  'Programmatic',
  'Print',
  'Digital Signage',
];

function ratiosForChannel(
  channel: TemplateBuilderStepData['channel']
): string[] {
  if (channel === 'Social') return ['1:1', '9:16', '2:3'];
  if (channel === 'Programmatic') return ['300x250', '160x600', '728x90', '300x600'];
  return ['8.5x11', '4x6', 'Custom'];
}

function ContextStepBody({
  stepData,
  mergeStepData,
  client,
}: StepRenderProps<TemplateBuilderStepData>) {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<TemplateRecord[]>([]);
  const selectedRatios = stepData.ratios ?? [];

  useEffect(() => {
    let cancelled = false;
    templateService
      .getTemplates(client.slug)
      .then((list) => {
        if (!cancelled) setSavedTemplates(list);
      })
      .catch((err) => console.error('Failed to fetch templates:', err));
    return () => {
      cancelled = true;
    };
  }, [client.slug]);

  const selectWireframe = (template: (typeof SOCIAL_WIREFRAMES)[number]) => {
    mergeStepData({
      selectedWireframe: template.id,
      wireframeFile: template.file,
      jobTitle: stepData.jobTitle || `${template.name} - ${client.slug}`,
      ...BASELINE_ASSETS,
      headline: BASELINE_ASSETS.headline1,
      image_url: BASELINE_ASSETS.image1,
      logo: BASELINE_ASSETS.logo,
    });
  };

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
          Strategy Parameters
        </label>
        <h3 className="text-xl font-bold text-gray-900 italic">
          Define Your Template Context
        </h3>
      </div>

      {isLibraryOpen ? (
        <div className="bg-white rounded-3xl border-2 border-blue-100 p-8 shadow-xl shadow-blue-50/50 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex items-center justify-between mb-8 border-b border-gray-100 pb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsLibraryOpen(false)}
                className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors border border-gray-200 shadow-sm"
              >
                <ChevronLeftIcon className="h-6 w-6 text-gray-900" />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 bg-blue-600 rounded-full animate-pulse" />
                  <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none">
                    Scaffold Marketplace
                  </label>
                </div>
                <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tight italic">
                  Standard Wireframe Library
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                  Preview Mode
                </p>
                <p className="text-xs font-bold text-gray-900">PMG Baseline Branding</p>
              </div>
              <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <SparklesIcon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-h-[600px] overflow-y-auto pr-4 scrollbar-hide pb-8">
            {SOCIAL_WIREFRAMES.map((template) => (
              <div
                key={template.id}
                className={cn(
                  'group relative bg-gray-50 border-2 rounded-2xl overflow-hidden transition-all hover:shadow-2xl hover:shadow-blue-100/50 flex flex-col',
                  stepData.selectedWireframe === template.id
                    ? 'border-blue-600 bg-blue-50/30 ring-4 ring-blue-50'
                    : 'border-gray-200/60'
                )}
              >
                <div className="aspect-square bg-white relative overflow-hidden m-2 rounded-xl shadow-inner border border-gray-100 flex items-center justify-center">
                  <TemplatePreview
                    templateFile={template.file}
                    name={template.name}
                    scale={0.2}
                    adSize={template.adSize || 1024}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-gray-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 scale-105 group-hover:scale-100">
                    <button
                      onClick={() => {
                        selectWireframe(template);
                        setIsLibraryOpen(false);
                      }}
                      className="w-full py-4 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-400/20 transition-all transform translate-y-2 group-hover:translate-y-0"
                    >
                      Use this Scaffold
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-tighter leading-tight pr-2">
                      {template.name}
                    </h4>
                    {stepData.selectedWireframe === template.id && (
                      <CheckCircleIcon className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                  </div>
                  <div className="mt-auto pt-3 border-t border-gray-200/50">
                    <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-2">
                      Requirements
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {template.minRequirements?.map((req: string) => (
                        <span
                          key={req}
                          className="px-1.5 py-0.5 bg-white border border-gray-100 rounded text-[6px] font-bold text-gray-600 uppercase tracking-tighter"
                        >
                          {req}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            {/* Job Title */}
            <div>
              <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">
                Job Title / Project Name
              </label>
              <input
                type="text"
                placeholder="e.g. Q4 Global Branding - Feed Opt"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-gray-900"
                value={stepData.jobTitle || ''}
                onChange={(e) => mergeStepData({ jobTitle: e.target.value })}
              />
            </div>

            {/* Channel Selection */}
            <div>
              <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3">
                Target Channel
              </label>
              <div className="grid grid-cols-2 gap-3">
                {CHANNELS.map((channel) => (
                  <button
                    key={channel}
                    onClick={() => mergeStepData({ channel })}
                    className={cn(
                      'px-4 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all',
                      stepData.channel === channel
                        ? 'border-blue-600 bg-blue-50 text-blue-600 font-black'
                        : 'border-gray-100 text-gray-400 hover:border-blue-200'
                    )}
                  >
                    {channel}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratios */}
            <div>
              <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3">
                Aspect Ratio / Size
              </label>
              <div className="grid grid-cols-3 gap-3">
                {stepData.channel ? (
                  ratiosForChannel(stepData.channel).map((ratio) => {
                    const isSelected = selectedRatios.includes(ratio);
                    return (
                      <button
                        key={ratio}
                        onClick={() => {
                          const newRatios = isSelected
                            ? selectedRatios.filter((r) => r !== ratio)
                            : [...selectedRatios, ratio];
                          mergeStepData({ ratios: newRatios });
                        }}
                        className={cn(
                          'px-4 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all',
                          isSelected
                            ? 'border-blue-600 bg-blue-50 text-blue-600 font-black shadow-md shadow-blue-50'
                            : 'border-gray-100 text-gray-400 hover:border-blue-200'
                        )}
                      >
                        {ratio}
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-3 py-10 border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center bg-gray-50/50">
                    <PhotoIcon className="h-6 w-6 text-gray-200 mb-2" />
                    <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest italic">
                      Select a channel first
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Wireframes & Historical */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-blue-600 rounded-full" />
                  <label className="block text-[10px] font-black text-gray-900 uppercase tracking-widest leading-none">
                    Official Standard Wireframes
                  </label>
                </div>
                {stepData.channel === 'Social' && (
                  <div className="flex items-center gap-3">
                    {stepData.selectedWireframe && (
                      <span
                        onClick={() =>
                          mergeStepData({
                            selectedWireframe: undefined,
                            wireframeFile: undefined,
                          })
                        }
                        className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter cursor-pointer hover:text-red-500 transition-colors"
                      >
                        ✕ Change
                      </span>
                    )}
                    <span
                      onClick={() => setIsLibraryOpen(true)}
                      className="text-[9px] font-bold text-blue-600 uppercase tracking-tighter cursor-pointer hover:underline"
                    >
                      View Library
                    </span>
                  </div>
                )}
              </div>

              {stepData.channel === 'Social' ? (
                stepData.selectedWireframe ? (
                  (() => {
                    const sel = SOCIAL_WIREFRAMES.find(
                      (w) => w.id === stepData.selectedWireframe
                    );
                    if (!sel) return null;
                    return (
                      <div className="flex flex-col items-center gap-3 p-4 bg-blue-50 rounded-2xl border-2 border-blue-200">
                        <div
                          className="relative overflow-hidden rounded-xl"
                          style={{ width: 160, height: 160 }}
                        >
                          <TemplatePreview
                            templateFile={sel.file}
                            name={sel.name}
                            scale={0.156}
                            adSize={sel.adSize || 1024}
                          />
                          <div className="absolute top-2 right-2">
                            <CheckCircleIcon className="h-5 w-5 text-blue-600 drop-shadow" />
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">
                            {sel.name}
                          </p>
                          <p className="text-[8px] font-bold text-blue-500 uppercase tracking-tighter mt-0.5">
                            Scaffold Selected
                          </p>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {SOCIAL_WIREFRAMES.slice(0, 4).map((template) => (
                      <button
                        key={template.id}
                        onClick={() => selectWireframe(template)}
                        className="aspect-square bg-white border-2 border-gray-100 rounded-xl transition-all hover:border-blue-400 group relative overflow-hidden"
                      >
                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl">
                          <TemplatePreview
                            templateFile={template.file}
                            name={template.name}
                            scale={0.165}
                            adSize={template.adSize || 1024}
                          />
                        </div>
                        <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/70 transition-all flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 rounded-xl">
                          <CheckCircleIcon className="h-6 w-6 text-white mb-1" />
                          <span className="text-[8px] font-black text-white uppercase tracking-widest leading-tight text-center px-2">
                            Use This Scaffold
                          </span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-2 py-1.5">
                          <span className="text-[7px] font-black uppercase tracking-widest text-gray-500 line-clamp-1 block">
                            {template.name}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="py-10 border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center bg-gray-50/30 text-center px-6">
                  <RectangleGroupIcon className="h-7 w-7 text-gray-200 mb-3" />
                  <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest leading-relaxed">
                    {stepData.channel
                      ? `No templates available for ${stepData.channel}`
                      : 'Select a channel to browse templates'}
                  </p>
                </div>
              )}
            </div>

            {/* Historical Templates */}
            <div className="bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-gray-300 rounded-full" />
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">
                    Historical Saved Templates
                  </label>
                </div>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                  Newest First
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 opacity-60">
                {savedTemplates.length > 0 ? (
                  savedTemplates.slice(0, 2).map((t) => (
                    <button
                      key={t.id}
                      className="aspect-square bg-white border-2 border-gray-100 rounded-xl hover:border-blue-400 transition-all p-2 flex flex-col items-center justify-center gap-2"
                    >
                      <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
                        <CircleStackIcon className="h-5 w-5 text-blue-300" />
                      </div>
                      <span className="text-[7px] font-black uppercase tracking-widest truncate w-full px-1">
                        {t.name}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="col-span-2 py-8 text-center flex flex-col items-center justify-center">
                    <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest italic">
                      No saved history yet
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const contextStep: WizardStep<TemplateBuilderStepData> = {
  id: 'context',
  name: 'Define Context',

  validate: (data) => {
    const hasTitle = !!data.jobTitle?.trim();
    const hasChannel = !!data.channel;
    const hasSizes = (data.ratios?.length ?? 0) > 0;
    const requirements = [
      { label: 'Project Title', met: hasTitle },
      { label: 'Channel', met: hasChannel },
      { label: 'Size Selected', met: hasSizes },
    ];
    if (hasTitle && hasChannel && hasSizes) return { ok: true };
    return {
      ok: false,
      requirements,
      reason: !hasTitle
        ? 'Project title required'
        : !hasChannel
        ? 'Channel required'
        : 'At least one size required',
    };
  },

  next: ({ stepData, mergeStepData }) => {
    if (!stepData.selectedWireframe) return undefined;

    const wireframeDef = SOCIAL_WIREFRAMES.find(
      (w) => w.id === stepData.selectedWireframe
    );
    if (wireframeDef?.minRequirements) {
      const autoReqs = wireframeDef.minRequirements.map((req: string) => {
        const lower = req.toLowerCase();
        const isImage = lower.includes('image') || lower.includes('background');
        const isCurrency = lower.includes('price') || lower.includes('cost');
        const isBrand = lower.includes('logo');
        return {
          id: req.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
          label: req,
          category: (isBrand ? 'Brand' : 'Dynamic') as 'Brand' | 'Dynamic',
          source: isBrand ? 'Creative House' : 'Feed',
          type: (isImage ? 'image' : isCurrency ? 'currency' : 'text') as
            | 'image'
            | 'currency'
            | 'text',
        };
      });
      mergeStepData({
        requirements: autoReqs,
        areRequirementsApproved: true,
      });
    }
    return 'source';
  },

  render: (props) => <ContextStepBody {...props} />,
};
