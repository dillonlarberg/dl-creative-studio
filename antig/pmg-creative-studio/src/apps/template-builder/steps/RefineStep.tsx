import { useEffect, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type {
  LogoVariant,
  RequirementField,
  StressTest,
  TemplateBuilderStepData,
} from '../types';
import { cn } from '../../../utils/cn';
import { FilledTemplatePreview } from '../_internal/FilledTemplatePreview';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import {
  clientAssetHouseService,
  type ClientAssetHouse,
} from '../../../services/clientAssetHouse';
import { templateService } from '../../../services/templates';

/**
 * Refine step — Refine Design.
 *
 * JSX lifted verbatim from UseCaseWizardPage.tsx lines 3805-4140.
 *
 * Two render paths inside the preview canvas:
 *   - Wireframe path: re-renders FilledTemplatePreview against
 *     requirements + feedMappings + assetHouse, with cssOverrides keyed
 *     off the mapping-step `__css_*` knobs.
 *   - Candidate path: hand-composed multi-ratio preview using the
 *     selected candidate's `styles` / `elements` plus the live refine
 *     controls (logoScale, headlineSize, priceSize, accentColor, etc.).
 *
 * Persistent refine knobs flow through mergeStepData; transient UI
 * (currentFeedIndex, assetHouse fetch, save spinner) stays local.
 */

const FALLBACK_LOGO =
  'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png';

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
    borderRadius?: string;
    shadow?: string;
    gradient?: string;
  };
  elements?: {
    headline?: boolean;
    price?: boolean;
    image?: boolean;
    cta?: boolean;
    logo?: boolean;
  };
};

function RefineStepBody({
  stepData,
  mergeStepData,
  client,
}: StepRenderProps<TemplateBuilderStepData>) {
  const [assetHouse, setAssetHouse] = useState<ClientAssetHouse | null>(null);
  const [currentFeedIndex, setCurrentFeedIndex] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const requirements: RequirementField[] = stepData.requirements ?? [];
  const feedSampleData = stepData.feedSampleData ?? [];
  const feedMappings = stepData.feedMappings ?? {};
  const candidates = (stepData.candidates ?? []) as AnyCandidate[];
  const selectedCandidateIndex = stepData.selectedCandidateIndex ?? 0;
  const selectedRatios = stepData.selectedRatios ?? stepData.ratios ?? [];

  const textStressTest: StressTest = stepData.textStressTest ?? 'normal';
  const logoScale = stepData.logoScale ?? 1;
  const logoVariant: LogoVariant = stepData.logoVariant ?? 'primary';
  const headlineSize = stepData.headlineSize ?? 1;
  const priceSize = stepData.priceSize ?? 1;

  // Asset-house fetch mirrors GenerateStep — keeps the body
  // self-contained without extending StepRenderProps.
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

  // Mirrors monolith lines 458-462 — pulls a feed value, swapping in the
  // stressMap row when the user toggles min/max-char modes.
  const stressMap = stepData.stressMap;
  const getDeepValue = (key: string): string => {
    if (!key || !feedSampleData[currentFeedIndex]) return '';
    if (textStressTest === 'normal') {
      return ((feedSampleData[currentFeedIndex] as Record<string, unknown>)[
        key
      ] as string) || '';
    }
    return (
      ((stressMap?.[textStressTest] as Record<string, unknown> | undefined)?.[
        key
      ] as string) ||
      ((feedSampleData[currentFeedIndex] as Record<string, unknown>)[
        key
      ] as string) ||
      ''
    );
  };

  const activeCandidate = candidates[selectedCandidateIndex || 0];

  const handleSaveTemplate = async () => {
    if (!client.slug) return;
    const name = window.prompt(
      'Enter a name for this template preset:',
      `Template - ${activeCandidate?.name || 'Custom'}`
    );
    if (!name) return;
    setIsSaving(true);
    try {
      const config = {
        backgroundColor: stepData.backgroundColor || '#ffffff',
        accentColor: stepData.accentColor || '#2563eb',
        showLogo: stepData.showLogo !== false,
        showPrice: stepData.showPrice !== false,
        showCTA: stepData.showCTA !== false,
        overrideHeadline: stepData.overrideHeadline,
      };
      await templateService.saveTemplate(
        client.slug,
        name,
        config,
        activeCandidate?.name || 'custom-scaffold'
      );
      window.alert(
        'Template preset saved successfully! It will now appear in your Historical Templates.'
      );
    } catch {
      window.alert('Failed to save template preset.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Refinement & Styling</label>
          <h3 className="text-xl font-bold text-gray-900 italic">Premium Studio Refinement</h3>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => mergeStepData({ textStressTest: 'normal' })}
              className={cn("px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all", textStressTest === 'normal' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400")}
            >Standard</button>
            <button
              onClick={() => mergeStepData({ textStressTest: 'shortest' })}
              className={cn("px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all", textStressTest === 'shortest' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400")}
            >Min-Char</button>
            <button
              onClick={() => mergeStepData({ textStressTest: 'longest' })}
              className={cn("px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all", textStressTest === 'longest' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400")}
            >Max-Char</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left: Multi-Size Preview Carousel (8 cols) */}
        <div className="lg:col-span-8 space-y-8">
          <div className="flex items-center justify-center p-12 bg-gray-50/50 rounded-[40px] border-2 border-dashed border-gray-100 min-h-[700px] gap-12 overflow-x-auto scrollbar-hide">
            {stepData.selectedWireframe ? (
              (() => {
                const refineWf = SOCIAL_WIREFRAMES.find(w => w.id === stepData.selectedWireframe);
                if (!refineWf) return null;
                const previewRow = (feedSampleData[0] as Record<string, unknown> | undefined) || null;
                const refineInjections: Record<string, { type: 'image' | 'text'; value: string }> = {};
                for (const field of requirements) {
                  const mode: string = (stepData[`${field.id}__mode`] as string) || (field.category === 'Brand' ? 'brand' : 'feed');
                  let val = '';
                  if (mode === 'upload') {
                    val = (stepData[`${field.id}__upload`] as string) || '';
                  } else if (mode === 'feed' && previewRow) {
                    const col = feedMappings[field.id];
                    if (col && !col.startsWith('__upload__')) val = (previewRow[col] as string) || '';
                    else if (col?.startsWith('__upload__')) val = (stepData[`${field.id}__upload`] as string) || '';
                  }
                  if (val) refineInjections[field.id] = { type: field.type === 'image' ? 'image' : 'text', value: val };
                }
                const refineLogoReq = requirements.find(r => r.label?.toLowerCase() === 'logo' || r.id?.toLowerCase() === 'logo');
                const refineLogoVariant = refineLogoReq ? ((stepData[`${refineLogoReq.id}__logoVariant`] as string) || 'primary') : 'primary';
                const refineLogo = refineLogoVariant === 'inverse'
                  ? (assetHouse?.logoInverse || assetHouse?.logoPrimary || '')
                  : refineLogoVariant === 'favicon'
                    ? (assetHouse?.logoFavicon || assetHouse?.logoPrimary || '')
                    : (assetHouse?.logoPrimary || '');
                if (refineLogo) refineInjections['logo'] = { type: 'image', value: refineLogo };
                const refineCss: Record<string, string> = {
                  ...(stepData['__css_background_color'] ? { background_color: stepData['__css_background_color'] as string } : {}),
                  ...(stepData['__css_accent_color'] ? { accent_color: stepData['__css_accent_color'] as string } : {}),
                  ...(stepData['__css_text_color'] ? { text_color: stepData['__css_text_color'] as string } : {}),
                  ...(stepData['__css_font_family'] ? { font_family: stepData['__css_font_family'] as string } : {}),
                };
                const refineAdSize = refineWf.adSize || 1024;
                const refineScale = 420 / refineAdSize;
                return (
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 flex items-center justify-center overflow-hidden" style={{ width: '450px', height: '450px' }}>
                      <FilledTemplatePreview
                        templateFile={refineWf.file}
                        name={refineWf.name}
                        scale={refineScale}
                        adSize={refineAdSize}
                        injections={refineInjections}
                        cssOverrides={refineCss}
                      />
                    </div>
                    <div className="flex items-center gap-3 bg-white px-5 py-2 rounded-full border border-gray-200 shadow-lg">
                      <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest italic">{refineWf.name} — Live Mapped Preview</span>
                    </div>
                  </div>
                );
              })()
            ) : (
              (selectedRatios.length > 0 ? selectedRatios : ['1:1']).map((ratio) => {
                const [width, height] = ratio.includes(':') ? ratio.split(':').map(Number) : [1, 1];
                const baseWidth = 320;
                const scale = width > height ? 1.2 : 0.8;
                return (
                  <div key={ratio} className="flex flex-col items-center gap-6 shrink-0 transform hover:scale-[1.02] transition-all duration-500">
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
                      <span className="text-[10px] font-black text-gray-900 tracking-tighter italic">{ratio}</span>
                      <div className="h-1 w-1 bg-gray-200 rounded-full" />
                      <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{width > height ? 'Landscape' : 'Vertical'}</span>
                    </div>

                    <div
                      className="relative shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] overflow-hidden transition-all duration-700"
                      style={{
                        width: `${baseWidth * scale}px`,
                        aspectRatio: `${width}/${height}`,
                        backgroundColor: stepData.backgroundColor || '#ffffff',
                        fontFamily: stepData.activeFont || activeCandidate?.styles?.fontFamily || 'Inter',
                        borderRadius: activeCandidate?.styles?.borderRadius || '0px',
                        boxShadow: activeCandidate?.styles?.shadow,
                      }}
                    >
                      {/* Gradient Overlay from Candidate Style */}
                      {activeCandidate?.styles?.gradient && (
                        <div className="absolute inset-0 pointer-events-none opacity-40 mix-blend-multiply" style={{ background: activeCandidate.styles.gradient }} />
                      )}

                      {/* Logo Layer */}
                      {activeCandidate?.elements?.logo && stepData.showLogo !== false && (
                        <div className="absolute top-6 left-6 z-20" style={{ transform: `scale(${logoScale})`, transformOrigin: 'top left' }}>
                          <img
                            src={logoVariant === 'primary' ? (assetHouse?.logoPrimary || FALLBACK_LOGO) : (assetHouse?.logoInverse || FALLBACK_LOGO)}
                            className="h-10 w-auto object-contain"
                          />
                        </div>
                      )}

                      {/* Core Image Layer */}
                      <div className={cn(
                        "absolute overflow-hidden transition-all duration-700",
                        activeCandidate?.variant === 'wide' ? "inset-0" : "inset-x-6 top-20 bottom-36 rounded-2xl"
                      )}>
                        <img
                          src={getDeepValue(feedMappings.image_url)}
                          className={cn("h-full w-full object-cover", activeCandidate?.variant === 'wide' && "opacity-50 blur-[2px] scale-110")}
                        />
                      </div>

                      {/* Text/CTA Composite Layer */}
                      <div className={cn(
                        "absolute inset-x-6 bottom-6 flex flex-col gap-4 z-10 transition-all duration-500",
                        activeCandidate?.variant === 'stacked' ? "justify-center h-full top-0" : "justify-end"
                      )}>
                        {activeCandidate?.elements?.headline && (
                          <div
                            className={cn(
                              "bg-white/95 backdrop-blur-xl p-4 shadow-2xl transition-all border-l-[6px]",
                              activeCandidate?.variant === 'stacked' ? "bg-gray-900 border-white" : ""
                            )}
                            style={{
                              borderColor: stepData.accentColor || activeCandidate?.styles?.primaryColor,
                              transform: `rotate(${activeCandidate?.styles?.accentRotation || '0deg'}) scale(${headlineSize})`,
                              transformOrigin: 'left center',
                            }}
                          >
                            <h2 className={cn("text-xs font-black uppercase italic leading-none tracking-tight", activeCandidate?.variant === 'stacked' ? "text-white" : "text-gray-900")}>
                              {stepData.overrideHeadline || getDeepValue(feedMappings.headline) || 'No Headline Value'}
                            </h2>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-4">
                          {activeCandidate?.elements?.price && stepData.showPrice !== false && (
                            <div
                              className="h-10 px-5 flex items-center justify-center shadow-lg"
                              style={{
                                backgroundColor: stepData.accentColor || activeCandidate?.styles?.primaryColor || '#000',
                                transform: `scale(${priceSize})`,
                                transformOrigin: 'left center',
                              }}
                            >
                              <span className="text-[11px] font-black text-white uppercase italic">{getDeepValue(feedMappings.price) || 'N/A'}</span>
                            </div>
                          )}
                          {activeCandidate?.elements?.cta && stepData.showCTA !== false && (
                            <div className="h-10 px-6 bg-white border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all cursor-pointer">
                              <span className="text-[9px] font-black uppercase tracking-widest">SHOP NOW →</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Feed Quick-Nav */}
          <div className="bg-white rounded-[32px] border-2 border-gray-100 p-6 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentFeedIndex(Math.max(0, currentFeedIndex - 1))}
                  className="h-10 w-10 flex items-center justify-center rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all"
                ><ChevronLeftIcon className="h-5 w-5 text-gray-900" /></button>
                <button
                  onClick={() => setCurrentFeedIndex(Math.min((feedSampleData.length || 1) - 1, currentFeedIndex + 1))}
                  className="h-10 w-10 flex items-center justify-center rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all"
                ><ChevronRightIcon className="h-5 w-5 text-gray-900" /></button>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Testing Record {currentFeedIndex + 1} of {feedSampleData.length}</p>
                <p className="text-xs font-bold text-gray-900 truncate max-w-[240px] italic">“{(feedSampleData[currentFeedIndex] as Record<string, unknown> | undefined)?.[feedMappings.headline] as string || 'Previewing dynamic content'}”</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest py-1 px-3 bg-blue-50 rounded-full border border-blue-100 italic">Live Feed Connected</span>
            </div>
          </div>
        </div>

        {/* Right: Premium Controls (4 cols) */}
        <div className="lg:col-span-4 space-y-8">
          {/* Branding Surface */}
          <div className="bg-white rounded-[32px] border-2 border-gray-100 p-8 space-y-8 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.2em]">Brand Identity</h4>
              <SparklesIcon className="h-4 w-4 text-blue-600" />
            </div>

            {/* Color Palettes from House */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Global Accent Color</label>
                <span className="text-[8px] font-bold text-blue-600 uppercase">From House</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[assetHouse?.primaryColor, '#000000', '#FFFFFF', '#DC2626', '#16A34A', '#2563EB'].filter(Boolean).map((c) => (
                  <button
                    key={c as string}
                    onClick={() => mergeStepData({ accentColor: c as string })}
                    className={cn("h-8 w-8 rounded-full border-2 transition-all", stepData.accentColor === c ? "border-blue-600 scale-125 shadow-xl" : "border-gray-100")}
                    style={{ backgroundColor: c as string }}
                  />
                ))}
                <input type="color" className="h-8 w-8 rounded-full border-2 border-gray-100 cursor-pointer overflow-hidden p-0" onChange={(e) => mergeStepData({ accentColor: e.target.value })} />
              </div>
            </div>

            {/* Logo Management */}
            <div className="space-y-4">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Logo Configuration</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => mergeStepData({ logoVariant: 'primary' })}
                  className={cn("flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all", logoVariant === 'primary' ? "border-blue-600 bg-blue-50" : "border-gray-50")}
                >
                  <div className="h-4 w-12 bg-gray-900 rounded mb-2" />
                  <span className="text-[8px] font-black uppercase">Primary</span>
                </button>
                <button
                  onClick={() => mergeStepData({ logoVariant: 'inverse' })}
                  className={cn("flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all", logoVariant === 'inverse' ? "border-blue-600 bg-blue-50" : "border-gray-50")}
                >
                  <div className="h-4 w-12 bg-gray-200 border border-gray-100 rounded mb-2" />
                  <span className="text-[8px] font-black uppercase">Inverse</span>
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Logo Scale</label>
                  <span className="text-[9px] font-bold text-gray-900">{Math.round(logoScale * 100)}%</span>
                </div>
                <input
                  type="range" min="0.5" max="2" step="0.1" value={logoScale}
                  onChange={(e) => mergeStepData({ logoScale: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Typography Refinement */}
          <div className="bg-white rounded-[32px] border-2 border-gray-100 p-8 space-y-8 shadow-sm">
            <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.2em]">Typography Refinement</h4>

            {/* Font Selection from House */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Brand Typeface</label>
                <span className="text-[8px] font-bold text-blue-600 uppercase">From House</span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { name: assetHouse?.fontPrimary || 'Inter' },
                  ...(assetHouse?.assets?.filter((a) => a.type === 'font') || []),
                ].map((font) => (
                  <button
                    key={font.name}
                    onClick={() => mergeStepData({ activeFont: font.name })}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border-2 text-left transition-all",
                      (stepData.activeFont || assetHouse?.fontPrimary || 'Inter') === font.name ? "border-blue-600 bg-blue-50" : "border-gray-50"
                    )}
                  >
                    <span className="text-[11px] font-black uppercase italic" style={{ fontFamily: font.name }}>{font.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Sizing Controls */}
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Headline Size</label>
                  <span className="text-[9px] font-bold text-gray-900">{Math.round(headlineSize * 100)}%</span>
                </div>
                <input
                  type="range" min="0.5" max="2" step="0.05" value={headlineSize}
                  onChange={(e) => mergeStepData({ headlineSize: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Price Slot Size</label>
                  <span className="text-[9px] font-bold text-gray-900">{Math.round(priceSize * 100)}%</span>
                </div>
                <input
                  type="range" min="0.2" max="1.5" step="0.05" value={priceSize}
                  onChange={(e) => mergeStepData({ priceSize: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={() => void handleSaveTemplate()}
              disabled={isSaving}
              className="w-full py-5 bg-gray-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Finalize Template Preset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const refineStep: WizardStep<TemplateBuilderStepData> = {
  id: 'refine',
  name: 'Refine Design',

  validate: () => ({ ok: true }),

  render: (props) => <RefineStepBody {...props} />,
};
