import { useState } from 'react';
import { CircleStackIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData, Channel } from '../types';
import { cn } from '../../../utils/cn';
import { CHANNEL_RATIOS } from '../../../constants/channelWireframes';
import { useSharedData } from '../../../platform/wizard/SharedDataContext';
import { useTemplateBuilder } from '../TemplateBuilderContext';
import { synthesizeRequirements } from '../../../services/ai/templateAI';
import { fetchFeedSample } from '../../../platform/datasources';
import { useAssetHouse } from '../../../platform/assetHouse/AssetHouseContext';
import type { SelectedFeed } from '../../../platform/datasources';

/**
 * Setup step — Template configuration (Step 1 of 3: Setup → Design → Publish).
 * Collects: template name, target channel, sizes/ratios, data source, creative brief.
 * On submit: fetches feed sample + synthesizes requirements in parallel.
 */

/**
 * Module-level callback ref so the `submit` hook (which runs outside React's
 * component tree) can call into the mounted component's context hooks.
 * Set on every render of SetupStepBody; nulled when the body unmounts.
 */
let _submitCallback:
  | ((clientSlug: string, stepData: TemplateBuilderStepData) => Promise<void>)
  | null = null;

const CHANNELS: Channel[] = ['Social', 'Programmatic', 'Print', 'Digital Signage'];

/** Default template name uses today's date. */
function defaultTemplateName(): string {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `Untitled Template — ${today}`;
}

// ── Loading overlay ──────────────────────────────────────────────────────────

interface OverlayProps {
  feedDone: boolean;
  requirementsDone: boolean;
}

function LoadingOverlay({ feedDone, requirementsDone }: OverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-xl bg-white/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
          Preparing your template…
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <StatusLine done={feedDone} label="Fetching feed data..." />
        <StatusLine done={requirementsDone} label="Analyzing creative brief..." />
      </div>
    </div>
  );
}

function StatusLine({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
      )}
      <span
        className={cn(
          'text-[11px] font-bold uppercase tracking-widest transition-colors',
          done ? 'text-green-600' : 'text-gray-500'
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ── Step body ────────────────────────────────────────────────────────────────

function SetupStepBody({
  stepData,
  mergeStepData,
}: StepRenderProps<TemplateBuilderStepData>) {
  const { dataSources, isLoading: feedsLoading } = useSharedData();
  const tbCtx = useTemplateBuilder();
  const { assetHouse } = useAssetHouse();

  // Granular done-flags for the overlay status lines.
  const [feedDone, setFeedDone] = useState(false);
  const [requirementsDone, setRequirementsDone] = useState(false);

  const isSubmitting = Boolean(stepData._submitting);
  const selectedRatios = stepData.ratios ?? [];

  // Wire the module-level callback every render so `submit` can reach context.
  _submitCallback = async (clientSlug: string, data: TemplateBuilderStepData) => {
    setFeedDone(false);
    setRequirementsDone(false);

    const feedObj: SelectedFeed = {
      name: data.selectedFeedName ?? data.selectedFeedId ?? '',
    };

    const [feedResult, requirements] = await Promise.all([
      fetchFeedSample({ clientSlug, feed: feedObj }).then((r) => {
        setFeedDone(true);
        return r;
      }),
      synthesizeRequirements({
        brief: data.brief ?? '',
        channel: data.channel ?? 'Social',
        brand: assetHouse,
      }).then((r) => {
        setRequirementsDone(true);
        return r;
      }),
    ]);

    // Derive column names from the first row's keys.
    const columns =
      feedResult.sampleData.length > 0
        ? Object.keys(feedResult.sampleData[0])
        : [];

    tbCtx.setFeedSample(feedResult.sampleData, columns);
    tbCtx.setRequirements(requirements);
  };

  return (
    <div className="relative space-y-8 text-left">
      {/* Loading overlay */}
      {isSubmitting && (
        <LoadingOverlay feedDone={feedDone} requirementsDone={requirementsDone} />
      )}

      {/* ── Section 1 — Template Name ─────────────────────────────────── */}
      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
          Template Name
        </label>
        <input
          type="text"
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-gray-900"
          value={stepData.templateName ?? defaultTemplateName()}
          onChange={(e) => mergeStepData({ templateName: e.target.value })}
          placeholder={defaultTemplateName()}
        />
      </div>

      {/* ── Section 2 — Target Channel ───────────────────────────────── */}
      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          Target Channel
        </label>
        <div className="grid grid-cols-2 gap-3">
          {CHANNELS.map((channel) => (
            <button
              key={channel}
              type="button"
              onClick={() => mergeStepData({ channel, ratios: [] })}
              className={cn(
                'px-4 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all',
                stepData.channel === channel
                  ? 'border-blue-600 bg-blue-50 text-blue-600'
                  : 'border-gray-100 text-gray-400 hover:border-blue-200'
              )}
            >
              {channel}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 3 — Size / Ratio ─────────────────────────────────── */}
      {stepData.channel && (
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
            Size / Ratio
          </label>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_RATIOS[stepData.channel].map((ratio) => {
              const isSelected = selectedRatios.includes(ratio);
              return (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => {
                    const newRatios = isSelected
                      ? selectedRatios.filter((r) => r !== ratio)
                      : [...selectedRatios, ratio];
                    mergeStepData({ ratios: newRatios });
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  )}
                >
                  {ratio}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 4 — Data Source ──────────────────────────────────── */}
      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          Data Source
        </label>

        {feedsLoading ? (
          <div className="flex items-center gap-3 py-6 px-4 rounded-xl border-2 border-dashed border-gray-100 bg-gray-50/50">
            <div className="h-5 w-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Loading data sources…
            </span>
          </div>
        ) : dataSources.length === 0 ? (
          <div className="py-8 px-4 rounded-xl border-2 border-dashed border-gray-100 bg-gray-50/50 text-center">
            <CircleStackIcon className="h-6 w-6 text-gray-200 mx-auto mb-2" />
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
              No data sources found for this client
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {dataSources.map((feed) => {
              const feedId = String((feed as Record<string, unknown>).id ?? feed.name);
              const feedType = String((feed as Record<string, unknown>).type ?? '');
              const isSelected = stepData.selectedFeedId === feedId;

              return (
                <button
                  key={feedId}
                  type="button"
                  onClick={() =>
                    mergeStepData({
                      selectedFeedId: feedId,
                      selectedFeedName: feed.name,
                    })
                  }
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
                    isSelected
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-100 hover:border-blue-200 bg-white'
                  )}
                >
                  <CircleStackIcon
                    className={cn(
                      'h-5 w-5 shrink-0',
                      isSelected ? 'text-blue-600' : 'text-gray-300'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-[11px] font-black uppercase tracking-tight truncate',
                        isSelected ? 'text-blue-900' : 'text-gray-700'
                      )}
                    >
                      {feed.name}
                    </p>
                    {feedType && (
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                        {feedType}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <CheckCircleIcon className="h-4 w-4 text-blue-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 5 — Creative Brief (optional) ───────────────────── */}
      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
          Creative Brief (Optional)
        </label>
        <textarea
          rows={3}
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium text-gray-900 resize-none"
          placeholder="Describe the aesthetic and purpose of this ad..."
          value={stepData.brief ?? ''}
          onChange={(e) => mergeStepData({ brief: e.target.value })}
        />
      </div>
    </div>
  );
}

// ── Lifecycle hooks ──────────────────────────────────────────────────────────

const validate: WizardStep<TemplateBuilderStepData>['validate'] = (data) => {
  const reqs = [
    { label: 'Template name', met: Boolean(data.templateName?.trim()) },
    { label: 'Channel selected', met: Boolean(data.channel) },
    { label: 'Size selected', met: (data.ratios?.length ?? 0) > 0 },
    { label: 'Data source connected', met: Boolean(data.selectedFeedId) },
  ];
  const ok = reqs.every((r) => r.met);
  return ok ? { ok: true } : { ok: false, requirements: reqs };
};

const submit: WizardStep<TemplateBuilderStepData>['submit'] = async ({
  stepData,
  mergeStepData,
  client,
}) => {
  mergeStepData({ _submitting: true } as Partial<TemplateBuilderStepData>);
  try {
    if (_submitCallback) {
      await _submitCallback(client.slug, stepData);
    }
  } finally {
    mergeStepData({ _submitting: false } as Partial<TemplateBuilderStepData>);
  }
  return { nextStepId: 'design' };
};

// ── Export ───────────────────────────────────────────────────────────────────

export const setupStep: WizardStep<TemplateBuilderStepData> = {
  id: 'setup',
  name: 'Setup',
  validate,
  submit,
  render: (props) => <SetupStepBody {...props} />,
};
