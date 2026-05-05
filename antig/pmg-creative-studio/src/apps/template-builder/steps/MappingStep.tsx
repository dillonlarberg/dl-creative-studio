import { useEffect, useState } from 'react';
import {
  ArrowRightIcon,
  CircleStackIcon,
  CloudArrowUpIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { RequirementField, TemplateBuilderStepData } from '../types';
import { cn } from '../../../utils/cn';
import { FilledTemplatePreview } from '../_internal/FilledTemplatePreview';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import {
  clientAssetHouseService,
  type ClientAssetHouse,
} from '../../../services/clientAssetHouse';

/**
 * Mapping step — Map Fields.
 *
 * JSX lifted verbatim from UseCaseWizardPage.tsx lines 2953-3466.
 *
 * Two render paths on the right side:
 *   - Wireframe path: live FilledTemplatePreview re-rendered as the user
 *     picks feed columns / uploads / brand colors. Brand-house overrides
 *     (background_color / accent_color / text_color / font_family) are
 *     persisted as `__css_*` keys on stepData and forwarded to
 *     FilledTemplatePreview as `cssOverrides`.
 *   - No-wireframe path: a Generative Asset Constructor showing the first
 *     three feed rows resolved through current mappings.
 *
 * Per-field mode is persisted as `${field.id}__mode` ('feed' | 'upload' |
 * 'brand'); upload values as `${field.id}__upload`; logo variant as
 * `${field.id}__logoVariant`. The mappingStep.next() skip-to-`refine`
 * wireframe override is left untouched in the export below.
 */

function MappingStepBody({
  stepData,
  mergeStepData,
  client,
}: StepRenderProps<TemplateBuilderStepData>) {
  const [assetHouse, setAssetHouse] = useState<ClientAssetHouse | null>(null);

  const requirements: RequirementField[] = stepData.requirements ?? [];
  const feedSampleData = stepData.feedSampleData ?? [];
  const feedMappings = stepData.feedMappings ?? {};

  const activeWireframe = SOCIAL_WIREFRAMES.find(
    (w) => w.id === stepData.selectedWireframe
  );

  // Asset-house fetch mirrors GenerateStep / RefineStep — keeps the body
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

  const setMappings = (next: Record<string, string>) =>
    mergeStepData({ feedMappings: next });

  const sampleColumns = Object.keys(
    (feedSampleData[0] as Record<string, unknown> | undefined) || {}
  );

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
          Step 4 of 7
        </label>
        <h3 className="text-xl font-bold text-gray-900 italic">
          Field Mapping &amp; Validation
        </h3>
        {activeWireframe && (
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">
            Mapping fields for: {activeWireframe.name}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Mapping Controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl border-2 border-gray-100 p-8 space-y-8 shadow-sm">
            <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
              {activeWireframe
                ? `${activeWireframe.name} — Required Fields`
                : 'Requirements Mapping'}
            </h4>

            <div className="space-y-5">
              {requirements.map((field) => {
                const isLogo =
                  field.label?.toLowerCase() === 'logo' ||
                  field.id?.toLowerCase() === 'logo';

                if (isLogo) {
                  const variantKey = `${field.id}__logoVariant`;
                  const activeVariant =
                    (stepData[variantKey] as string) || 'primary';
                  return (
                    <div
                      key={field.id}
                      className="space-y-2 pb-4 border-b border-gray-50 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CircleStackIcon className="h-3 w-3 text-purple-500" />
                          <span className="text-[10px] font-black text-gray-700 uppercase tracking-tighter">
                            Logo
                          </span>
                        </div>
                        <span className="text-[8px] font-bold px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full border border-purple-100">
                          Brand House
                        </span>
                      </div>
                      {assetHouse?.logoPrimary ? (
                        <div className="flex gap-2">
                          {[
                            {
                              key: 'primary',
                              src: assetHouse.logoPrimary,
                              label: 'Primary',
                            },
                            ...(assetHouse.logoInverse
                              ? [
                                  {
                                    key: 'inverse',
                                    src: assetHouse.logoInverse,
                                    label: 'Inverse',
                                  },
                                ]
                              : []),
                            ...(assetHouse.logoFavicon
                              ? [
                                  {
                                    key: 'favicon',
                                    src: assetHouse.logoFavicon,
                                    label: 'Icon',
                                  },
                                ]
                              : []),
                          ].map((opt) => {
                            const active = activeVariant === opt.key;
                            return (
                              <button
                                key={opt.key}
                                onClick={() =>
                                  mergeStepData({ [variantKey]: opt.key })
                                }
                                className={cn(
                                  'flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all bg-white',
                                  active
                                    ? 'border-blue-600 bg-blue-50 shadow-md'
                                    : 'border-gray-100 hover:border-gray-200'
                                )}
                              >
                                <img
                                  src={opt.src}
                                  className="h-5 object-contain"
                                  alt={opt.label}
                                />
                                <span className="text-[7px] font-black uppercase tracking-widest text-gray-500">
                                  {opt.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[9px] text-gray-400 italic px-2">
                          No logo found in Asset House
                        </p>
                      )}
                    </div>
                  );
                }

                const modeKey = `${field.id}__mode`;
                const mode: string =
                  (stepData[modeKey] as string) ||
                  (field.category === 'Brand' ? 'brand' : 'feed');
                const uploadKey = `${field.id}__upload`;
                const isImage = field.type === 'image';
                const isBackground =
                  field.id?.toLowerCase().includes('background') ||
                  field.label?.toLowerCase().includes('background');

                const sourceTabs = [
                  { key: 'feed', label: 'Feed' },
                  {
                    key: 'upload',
                    label: isBackground ? 'URL / Upload' : 'Upload',
                  },
                ];

                return (
                  <div
                    key={field.id}
                    className="space-y-2 pb-4 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CircleStackIcon className="h-3 w-3 text-blue-600" />
                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-tighter">
                          {field.label}
                        </span>
                      </div>
                      <span className="text-[8px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                        {field.type}
                      </span>
                    </div>

                    <div className="flex p-0.5 bg-gray-100 rounded-lg w-full">
                      {sourceTabs.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => mergeStepData({ [modeKey]: key })}
                          className={cn(
                            'flex-1 py-1.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all',
                            mode === key
                              ? 'bg-white text-blue-600 shadow-sm'
                              : 'text-gray-400 hover:text-gray-600'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {mode === 'feed' && (
                      <select
                        className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white outline-none text-[11px] font-bold text-gray-900 transition-all appearance-none cursor-pointer"
                        value={feedMappings[field.id] || ''}
                        onChange={(e) =>
                          setMappings({
                            ...feedMappings,
                            [field.id]: e.target.value,
                          })
                        }
                      >
                        <option value="">(Select Data Column)</option>
                        {sampleColumns.map((col) => (
                          <option key={col} value={col}>
                            {col.replace(/^[a-zA-Z0-9]+__/g, '')}
                          </option>
                        ))}
                      </select>
                    )}

                    {mode === 'upload' && (
                      <div className="space-y-2">
                        {isImage ? (
                          <>
                            <input
                              type="text"
                              placeholder="Paste image URL…"
                              className="w-full px-3 py-2 rounded-xl bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white outline-none text-[10px] font-medium text-gray-900 transition-all"
                              value={
                                typeof stepData[uploadKey] === 'string' &&
                                (stepData[uploadKey] as string).startsWith(
                                  'http'
                                )
                                  ? (stepData[uploadKey] as string)
                                  : ''
                              }
                              onChange={(e) => {
                                const url = e.target.value;
                                mergeStepData({
                                  [uploadKey]: url,
                                  feedMappings: {
                                    ...feedMappings,
                                    [field.id]: `__upload__${field.id}`,
                                  },
                                });
                              }}
                            />
                            <label className="flex items-center justify-center gap-2 w-full py-2 px-3 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                              <CloudArrowUpIcon className="h-4 w-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-500">
                                {stepData[uploadKey] ? 'Replace file' : 'Upload file'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    const dataUrl = ev.target?.result as string;
                                    mergeStepData({
                                      [uploadKey]: dataUrl,
                                      feedMappings: {
                                        ...feedMappings,
                                        [field.id]: `__upload__${field.id}`,
                                      },
                                    });
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>
                            {stepData[uploadKey] ? (
                              <div className="relative">
                                <img
                                  src={stepData[uploadKey] as string}
                                  className="w-full h-16 object-cover rounded-lg border border-gray-100"
                                  alt="preview"
                                />
                                <button
                                  onClick={() => {
                                    const { [field.id]: _omit, ...rest } =
                                      feedMappings;
                                    void _omit;
                                    mergeStepData({
                                      [uploadKey]: undefined,
                                      feedMappings: rest,
                                    });
                                  }}
                                  className="absolute top-1 right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center"
                                >
                                  <span className="text-white text-[8px] font-black">
                                    ✕
                                  </span>
                                </button>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <input
                            type="text"
                            placeholder={`Enter ${field.label}…`}
                            className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white outline-none text-[11px] font-bold text-gray-900 transition-all"
                            value={(stepData[uploadKey] as string) || ''}
                            onChange={(e) =>
                              mergeStepData({
                                [uploadKey]: e.target.value,
                                feedMappings: {
                                  ...feedMappings,
                                  [field.id]: `__upload__${field.id}`,
                                },
                              })
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Live Template Preview (wireframe path) */}
        {stepData.selectedWireframe &&
          (() => {
            const liveWf = SOCIAL_WIREFRAMES.find(
              (w) => w.id === stepData.selectedWireframe
            );
            if (!liveWf) return null;

            const previewRow =
              (feedSampleData[0] as Record<string, unknown> | undefined) ||
              null;

            const liveModeFor = (fieldId: string, category?: string) =>
              (stepData[`${fieldId}__mode`] as string) ||
              (category === 'Brand' ? 'brand' : 'feed');

            const liveInjections: Record<
              string,
              { type: 'image' | 'text'; value: string }
            > = {};
            for (const field of requirements) {
              const mode = liveModeFor(field.id, field.category);
              let val = '';
              if (mode === 'upload') {
                val = (stepData[`${field.id}__upload`] as string) || '';
              } else if (mode === 'brand') {
                if (field.label === 'Logo') {
                  const lv =
                    (stepData[`${field.id}__logoVariant`] as string) ||
                    'primary';
                  val =
                    lv === 'inverse'
                      ? assetHouse?.logoInverse ||
                        assetHouse?.logoPrimary ||
                        ''
                      : assetHouse?.logoPrimary || '';
                }
              } else if (mode === 'feed' && previewRow) {
                const col = feedMappings[field.id];
                if (col && !col.startsWith('__upload__')) {
                  val = (previewRow[col] as string) || '';
                } else if (col?.startsWith('__upload__')) {
                  val = (stepData[`${field.id}__upload`] as string) || '';
                }
              }
              if (val) {
                liveInjections[field.id] = {
                  type: field.type === 'image' ? 'image' : 'text',
                  value: val,
                };
              }
            }

            const logoReq = requirements.find(
              (r) =>
                r.label?.toLowerCase() === 'logo' ||
                r.id?.toLowerCase() === 'logo'
            );
            const logoVariantKey = logoReq
              ? `${logoReq.id}__logoVariant`
              : '';
            const logoVariantVal = logoVariantKey
              ? (stepData[logoVariantKey] as string) || 'primary'
              : 'primary';
            const resolvedLogo =
              logoVariantVal === 'inverse'
                ? assetHouse?.logoInverse || assetHouse?.logoPrimary || ''
                : logoVariantVal === 'favicon'
                  ? assetHouse?.logoFavicon || assetHouse?.logoPrimary || ''
                  : assetHouse?.logoPrimary || '';
            if (resolvedLogo) {
              liveInjections['logo'] = {
                type: 'image',
                value: resolvedLogo,
              };
            }

            const liveCss: Record<string, string> = {
              ...(stepData['__css_background_color']
                ? {
                    background_color: stepData[
                      '__css_background_color'
                    ] as string,
                  }
                : {}),
              ...(stepData['__css_accent_color']
                ? { accent_color: stepData['__css_accent_color'] as string }
                : {}),
              ...(stepData['__css_text_color']
                ? { text_color: stepData['__css_text_color'] as string }
                : {}),
              ...(stepData['__css_font_family']
                ? { font_family: stepData['__css_font_family'] as string }
                : {}),
            };

            const adSize = liveWf.adSize || 1024;
            const targetWidth = 480;
            const liveScale = targetWidth / adSize;

            const colorOptions = [
              ...(assetHouse?.primaryColor
                ? [{ label: 'Primary', value: assetHouse.primaryColor }]
                : []),
              ...(assetHouse?.variables
                ?.filter((v) => v.type === 'color')
                .map((v) => ({ label: v.name, value: v.value })) || []),
              { label: 'White', value: '#ffffff' },
              { label: 'Black', value: '#000000' },
              { label: 'None', value: '' },
            ];

            const fontOptions = [
              ...(assetHouse?.fontPrimary
                ? [
                    {
                      label: 'Primary — ' + assetHouse.fontPrimary,
                      value: assetHouse.fontPrimary,
                    },
                  ]
                : []),
              ...(assetHouse?.variables
                ?.filter((v) => v.type === 'font')
                .map((v) => ({
                  label: v.name + ' — ' + v.value,
                  value: v.value,
                })) || []),
            ];

            const showFontPicker =
              !!assetHouse?.fontPrimary ||
              !!assetHouse?.variables?.some((v) => v.type === 'font');

            return (
              <div className="lg:col-span-2 space-y-4 sticky top-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Live Preview — {liveWf.name}
                    </p>
                  </div>
                  <div className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-widest">
                    {Object.keys(liveInjections).length} /{' '}
                    {requirements.length} fields active
                  </div>
                </div>

                <div
                  className="rounded-3xl overflow-hidden border-2 border-gray-100 shadow-2xl bg-white"
                  style={{
                    width: `${Math.round(adSize * liveScale)}px`,
                    height: `${Math.round(adSize * liveScale)}px`,
                  }}
                >
                  <FilledTemplatePreview
                    templateFile={liveWf.file}
                    name={liveWf.name}
                    scale={liveScale}
                    adSize={adSize}
                    injections={liveInjections}
                    cssOverrides={liveCss}
                  />
                </div>

                <div className="bg-white rounded-3xl border-2 border-gray-100 p-6 shadow-sm space-y-5">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                    Brand Overrides
                  </p>

                  {/* Background color */}
                  <div className="space-y-2">
                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                      Background Color
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((opt) => {
                        const active =
                          ((stepData['__css_background_color'] as string) ||
                            '') === opt.value;
                        return (
                          <button
                            key={opt.label}
                            title={opt.label}
                            onClick={() =>
                              mergeStepData({
                                __css_background_color: opt.value,
                              })
                            }
                            className={cn(
                              'h-7 w-7 rounded-full border-2 transition-all shadow-sm',
                              active
                                ? 'border-blue-600 scale-110 ring-2 ring-blue-200'
                                : 'border-gray-200 hover:scale-105'
                            )}
                            style={{
                              background:
                                opt.value ||
                                'linear-gradient(135deg,#e5e7eb 50%,#fff 50%)',
                            }}
                          />
                        );
                      })}
                      <input
                        type="color"
                        title="Custom"
                        className="h-7 w-7 rounded-full border-2 border-gray-200 cursor-pointer"
                        value={
                          (stepData['__css_background_color'] as string) ||
                          '#ffffff'
                        }
                        onChange={(e) =>
                          mergeStepData({
                            __css_background_color: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Accent color */}
                  <div className="space-y-2">
                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                      Accent Color (badges, banners)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((opt) => {
                        const active =
                          ((stepData['__css_accent_color'] as string) ||
                            '') === opt.value;
                        return (
                          <button
                            key={opt.label}
                            title={opt.label}
                            onClick={() =>
                              mergeStepData({
                                __css_accent_color: opt.value,
                              })
                            }
                            className={cn(
                              'h-7 w-7 rounded-full border-2 transition-all shadow-sm',
                              active
                                ? 'border-blue-600 scale-110 ring-2 ring-blue-200'
                                : 'border-gray-200 hover:scale-105'
                            )}
                            style={{
                              background:
                                opt.value ||
                                'linear-gradient(135deg,#e5e7eb 50%,#fff 50%)',
                            }}
                          />
                        );
                      })}
                      <input
                        type="color"
                        title="Custom"
                        className="h-7 w-7 rounded-full border-2 border-gray-200 cursor-pointer"
                        value={
                          (stepData['__css_accent_color'] as string) ||
                          '#ffffff'
                        }
                        onChange={(e) =>
                          mergeStepData({
                            __css_accent_color: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Text color */}
                  <div className="space-y-2">
                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                      Text Color
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((opt) => {
                        const active =
                          ((stepData['__css_text_color'] as string) ||
                            '') === opt.value;
                        return (
                          <button
                            key={opt.label}
                            title={opt.label}
                            onClick={() =>
                              mergeStepData({
                                __css_text_color: opt.value,
                              })
                            }
                            className={cn(
                              'h-7 w-7 rounded-full border-2 transition-all shadow-sm',
                              active
                                ? 'border-blue-600 scale-110 ring-2 ring-blue-200'
                                : 'border-gray-200 hover:scale-105'
                            )}
                            style={{
                              background:
                                opt.value ||
                                'linear-gradient(135deg,#e5e7eb 50%,#fff 50%)',
                            }}
                          />
                        );
                      })}
                      <input
                        type="color"
                        title="Custom"
                        className="h-7 w-7 rounded-full border-2 border-gray-200 cursor-pointer"
                        value={
                          (stepData['__css_text_color'] as string) ||
                          '#000000'
                        }
                        onChange={(e) =>
                          mergeStepData({
                            __css_text_color: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Font selector */}
                  {showFontPicker && (
                    <div className="space-y-2">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                        Font
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {fontOptions.map((opt) => {
                          const active =
                            ((stepData['__css_font_family'] as string) ||
                              '') === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() =>
                                mergeStepData({
                                  __css_font_family: opt.value,
                                })
                              }
                              className={cn(
                                'w-full px-3 py-2 rounded-xl border-2 text-left text-[9px] font-bold uppercase tracking-widest transition-all',
                                active
                                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                                  : 'border-gray-100 text-gray-500 hover:border-gray-200'
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Mapped fields badge bar */}
                  {Object.keys(feedMappings).length > 0 && (
                    <div className="pt-4 border-t border-gray-50 flex flex-wrap gap-1.5">
                      {Object.entries(feedMappings).map(([slot, col]) => (
                        <div
                          key={slot}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 border border-gray-800 rounded-lg"
                        >
                          <CircleStackIcon className="h-2.5 w-2.5 text-blue-400" />
                          <span className="text-[8px] font-black text-white uppercase tracking-widest">
                            {slot}
                          </span>
                          <ArrowRightIcon className="h-1.5 w-1.5 text-white/40" />
                          <span className="text-[8px] font-bold text-blue-300 truncate max-w-[80px]">
                            {col.replace(/^[a-zA-Z0-9]+__/g, '')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

        {/* Fallback: Generative Asset Constructor when no wireframe selected */}
        {!stepData.selectedWireframe && (
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-sm relative overflow-hidden flex flex-col min-h-[600px]">
              <div className="flex items-center justify-between mb-8 z-10">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 bg-blue-600 rounded-full animate-pulse" />
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Generative Asset Constructor
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="text-[9px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-md">
                    {Object.keys(feedMappings).length} Fields Mapped
                  </div>
                  <div className="text-[9px] font-bold text-purple-600 uppercase tracking-widest bg-purple-50 px-2 py-1 rounded-md">
                    {requirements.filter((r) => r.category === 'Brand').length}{' '}
                    Brand Anchors
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-6">
                {feedSampleData.slice(0, 3).map((row, idx) => {
                  const resolveValue = (fieldId: string): string => {
                    const mapping = feedMappings[fieldId];
                    if (!mapping) return '';
                    if (mapping.startsWith('__upload__'))
                      return (stepData[`${fieldId}__upload`] as string) || '';
                    return (
                      ((row as Record<string, unknown>)[mapping] as string) ||
                      ''
                    );
                  };
                  return (
                    <div
                      key={idx}
                      className="group relative bg-gray-50/50 rounded-2xl border-2 border-gray-100 p-6 hover:border-blue-200 transition-all"
                    >
                      <div className="absolute -top-3 -left-3 h-6 w-12 bg-gray-900 text-white text-[10px] font-black flex items-center justify-center rounded-lg shadow-lg">
                        #{idx + 1}
                      </div>
                      <div className="flex gap-6">
                        <div className="w-1/3 aspect-[4/5] bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm relative">
                          {(() => {
                            const imgField = requirements.find(
                              (r) => r.type === 'image'
                            );
                            const imgSrc = imgField
                              ? resolveValue(imgField.id)
                              : '';
                            return imgSrc ? (
                              <img
                                src={imgSrc}
                                className="h-full w-full object-cover"
                                alt="dynamic-product"
                              />
                            ) : (
                              <div className="h-full w-full flex flex-col items-center justify-center text-center p-4 bg-gray-100/50">
                                <PhotoIcon className="h-6 w-6 text-gray-300 mb-2" />
                                <p className="text-[8px] font-bold text-gray-400 uppercase leading-tight italic">
                                  {requirements.some((r) => r.type === 'image')
                                    ? 'Waiting for Image Mapping'
                                    : 'No Image Required'}
                                </p>
                              </div>
                            );
                          })()}
                          <div className="absolute top-3 left-3 h-8 w-8 bg-white/90 backdrop-blur rounded-lg shadow-sm p-1.5 border border-white/20">
                            {assetHouse?.logoPrimary ? (
                              <img
                                src={assetHouse.logoPrimary}
                                className="h-full w-full object-contain"
                                alt="brand"
                              />
                            ) : (
                              <div className="h-full w-full bg-gray-100 rounded-md" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1 space-y-3">
                          {requirements
                            .filter((r) => r.type !== 'image')
                            .map((field) => {
                              const val = resolveValue(field.id);
                              return (
                                <div
                                  key={field.id}
                                  className="min-h-[60px] p-4 bg-white rounded-xl border border-gray-100 shadow-sm border-l-4 border-l-blue-600 mb-4"
                                >
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mb-1">
                                    {field.label}
                                  </p>
                                  <p
                                    className={cn(
                                      'font-bold text-gray-900 leading-tight',
                                      field.label === 'Headline'
                                        ? 'text-[14px]'
                                        : 'text-[11px]'
                                    )}
                                  >
                                    {val || (
                                      <span className="text-gray-300 italic font-normal">
                                        Column Empty
                                      </span>
                                    )}
                                  </p>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 pt-8 border-t border-gray-100 flex flex-wrap gap-2">
                {Object.entries(feedMappings).map(([slot, col]) => (
                  <div
                    key={slot}
                    className="flex items-center gap-2.5 px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl shadow-lg ring-1 ring-white/10"
                  >
                    <div className="flex items-center gap-1.5">
                      <CircleStackIcon className="h-3 w-3 text-blue-400" />
                      <span className="text-[9px] font-black text-white uppercase tracking-widest">
                        {slot}
                      </span>
                    </div>
                    <ArrowRightIcon className="h-2 w-2 text-white/40" />
                    <span className="text-[9px] font-bold text-blue-300 truncate max-w-[120px]">
                      {col.replace(/^[a-zA-Z0-9]+__/g, '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const mappingStep: WizardStep<TemplateBuilderStepData> = {
  id: 'mapping',
  name: 'Map Fields',

  validate: (data) => {
    const reqs = data.requirements ?? [];
    const dynamic = reqs.filter((r) => r.category === 'Dynamic');
    const mappings = data.feedMappings ?? {};
    const unmapped = dynamic.find((r) => !mappings[r.id]);
    if (unmapped) {
      return { ok: false, reason: `Map a feed field to "${unmapped.label}"` };
    }
    return { ok: true };
  },

  next: ({ stepData }) => {
    if (stepData.selectedWireframe) {
      return 'refine';
    }
    return undefined;
  },

  render: (props) => <MappingStepBody {...props} />,
};
