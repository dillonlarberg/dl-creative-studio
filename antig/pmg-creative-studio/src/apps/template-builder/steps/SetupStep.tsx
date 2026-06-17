import { useState, useEffect, useMemo, useRef } from 'react';
import { CircleStackIcon, CheckCircleIcon, MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { TemplateBuilderStep, StepContext } from '../types';
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white/95 backdrop-blur-sm">
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

// ── Feed list ────────────────────────────────────────────────────────────────

const DATASOURCE_TYPE_LABELS: Record<string, string> = {
  alliclientfile: 'Alli Upload',
  googledrive: 'Google Drive',
  bigquery: 'BigQuery',
  redshift: 'Redshift',
  snowflake: 'Snowflake',
  s3: 'S3',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
};

function formatLastModified(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function FeedList({
  feeds,
  selectedFeedId,
  onSelect,
}: {
  feeds: SelectedFeed[];
  selectedFeedId?: string;
  onSelect: (feed: SelectedFeed) => void;
}) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'recent'>('default');
  const [typeFilter, setTypeFilter] = useState('');

  // Unique source types present in this client's feed list — drives the filter dropdown.
  const availableTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const f of feeds) {
      if (f.datasourceType) seen.add(f.datasourceType);
    }
    return Array.from(seen).sort();
  }, [feeds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = feeds;
    if (q) result = result.filter((f) => f.name.toLowerCase().includes(q));
    if (typeFilter) result = result.filter((f) => f.datasourceType === typeFilter);
    if (sortBy === 'recent') {
      result = [...result].sort((a, b) => {
        const ta = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const tb = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return tb - ta;
      });
    }
    return result;
  }, [feeds, query, typeFilter, sortBy]);

  return (
    <div className="space-y-3">
      {/* Controls — contained in a subtle card */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 space-y-2.5">
        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search feeds…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all text-[11px] font-bold text-gray-700 placeholder-gray-300 bg-white shadow-sm"
          />
        </div>

        {/* Sort toggle + type filter */}
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest shrink-0">
            Sort
          </span>

          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm shrink-0">
            {(['default', 'recent'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSortBy(opt)}
                className={cn(
                  'px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all',
                  sortBy === opt
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                )}
              >
                {opt === 'default' ? 'Default' : 'Recent'}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gray-200 shrink-0" />

          <div className="relative flex-1 min-w-0">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full appearance-none pl-3 pr-7 py-1.5 rounded-lg border border-gray-200 focus:border-blue-500 outline-none text-[8px] font-black uppercase tracking-widest bg-white shadow-sm transition-all cursor-pointer"
              style={{ color: typeFilter ? '#1e40af' : '#9ca3af' }}
            >
              <option value="">All Types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {DATASOURCE_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="py-4 text-center text-[9px] font-black text-gray-300 uppercase tracking-widest">
          No feeds match "{query}"
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {filtered.map((feed) => {
            const isSelected = selectedFeedId === feed.name;
            const typeLabel =
              DATASOURCE_TYPE_LABELS[feed.datasourceType ?? ''] ?? feed.datasourceType ?? '';
            const updatedDate = formatLastModified(feed.lastModified);

            return (
              <button
                key={feed.name}
                type="button"
                onClick={() => onSelect(feed)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
                  isSelected
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-100 hover:border-blue-200 bg-white'
                )}
              >
                <CircleStackIcon
                  className={cn('h-5 w-5 shrink-0', isSelected ? 'text-blue-600' : 'text-gray-300')}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-[11px] font-black uppercase tracking-tight truncate',
                      isSelected ? 'text-blue-900' : 'text-gray-700'
                    )}
                  >
                    {feed.title || feed.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {typeLabel && (
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                        {typeLabel}
                      </span>
                    )}
                    {updatedDate && (
                      <span className="text-[9px] font-medium text-gray-300">
                        · Updated {updatedDate}
                      </span>
                    )}
                  </div>
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
  );
}

// ── Step body ────────────────────────────────────────────────────────────────

function SetupStepBody({
  stepData,
  mergeStepData,
}: StepContext<TemplateBuilderStepData>) {
  const { dataSources, isLoading: feedsLoading } = useSharedData();
  const tbCtx = useTemplateBuilder();
  const { assetHouse } = useAssetHouse();

  // Granular done-flags for the overlay status lines.
  const [feedDone, setFeedDone] = useState(false);
  const [requirementsDone, setRequirementsDone] = useState(false);

  const isSubmitting = Boolean(stepData._submitting);
  const selectedRatios = stepData.ratios ?? [];

  // Keep the latest callback in a ref so the closure always captures fresh
  // hook values (assetHouse, tbCtx, setFeedDone, setRequirementsDone) without
  // violating React's rule against side-effects during render.
  const latestSubmitCallback = useRef<
    (clientSlug: string, data: TemplateBuilderStepData) => Promise<void>
  >(null!);

  latestSubmitCallback.current = async (clientSlug: string, data: TemplateBuilderStepData) => {
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

  // Wire the module-level _submitCallback via useEffect so it is set after
  // commit (not during render). The forwarder reads latestSubmitCallback.current
  // at call time, so it always uses the freshest closure even if the effect
  // hasn't re-run yet. Cleanup nulls the module-level var on unmount, which
  // also fixes the Strict Mode double-invoke window.
  useEffect(() => {
    _submitCallback = (...args) => latestSubmitCallback.current(...args);
    return () => { _submitCallback = null; };
  }, []);

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
          <FeedList
            feeds={dataSources}
            selectedFeedId={stepData.selectedFeedId}
            onSelect={(feed) =>
              mergeStepData({ selectedFeedId: feed.name, selectedFeedName: feed.name })
            }
          />
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

const validate: TemplateBuilderStep<TemplateBuilderStepData>['validate'] = (data) => {
  const reqs = [
    { label: 'Template name', met: Boolean(data.templateName?.trim()) },
    { label: 'Channel selected', met: Boolean(data.channel) },
    { label: 'Size selected', met: (data.ratios?.length ?? 0) > 0 },
    { label: 'Data source connected', met: Boolean(data.selectedFeedId) },
  ];
  const ok = reqs.every((r) => r.met);
  return ok ? { ok: true } : { ok: false, requirements: reqs };
};

const submit: TemplateBuilderStep<TemplateBuilderStepData>['submit'] = async ({
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

export const setupStep: TemplateBuilderStep<TemplateBuilderStepData> = {
  id: 'setup',
  name: 'Setup',
  description: 'Name your template, pick a channel and sizes, connect a data feed, and optionally describe the creative.',
  validate,
  submit,
  render: (props) => <SetupStepBody {...props} />,
};
