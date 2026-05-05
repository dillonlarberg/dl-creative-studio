import { useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CircleStackIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { SelectedFeed, TemplateBuilderStepData } from '../types';
import { cn } from '../../../utils/cn';
import {
  fetchDataSources,
  fetchFeedSample,
  type FeedSampleErrorInfo,
} from '../_internal/handlers';

/**
 * Source step — Connect Data. JSX lifted verbatim from
 * UseCaseWizardPage.tsx lines 2695-2952. Datasource discovery and the
 * `fetchFeedSample` progressive-fallback ladder live in
 * `_internal/handlers.ts`. The mount-effect data fetch lives in this
 * step's body (mirrors monolith lines 712-721, which is itself a
 * per-step effect rather than the global mount-effect at line 478) —
 * keeps the SourceStep self-contained without extending the
 * AppManifest/StepRenderProps contract.
 */

type FeedListMember = SelectedFeed & {
  id?: string;
  type?: string;
  description?: string;
  label?: string;
};

interface FeedMetadataView {
  dimensions?: Array<{ name?: string } | string>;
  measures?: Array<{ name?: string } | string>;
  error?: FeedSampleErrorInfo | string;
}

function readMetadata(value: unknown): FeedMetadataView | null {
  if (!value || typeof value !== 'object') return null;
  return value as FeedMetadataView;
}

function SourceStepBody({
  stepData,
  mergeStepData,
  client,
}: StepRenderProps<TemplateBuilderStepData>) {
  const [dataSources, setDataSources] = useState<FeedListMember[]>([]);
  const [isFetchingFeeds, setIsFetchingFeeds] = useState<boolean>(false);
  const [feedListError, setFeedListError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const selectedFeed = (stepData.selectedFeed ?? null) as FeedListMember | null;
  const feedSampleData = stepData.feedSampleData ?? [];
  const feedMetadata = readMetadata(stepData.feedMetadata);
  const totalFields =
    (feedMetadata?.dimensions?.length || 0) +
    (feedMetadata?.measures?.length || 0);

  const refreshDataSources = async () => {
    setIsFetchingFeeds(true);
    setFeedListError(null);
    try {
      const { feeds, error } = await fetchDataSources({ clientSlug: client.slug });
      setDataSources(feeds as FeedListMember[]);
      if (error) setFeedListError(error);
    } finally {
      setIsFetchingFeeds(false);
    }
  };

  // Mirrors monolith lines 712-721: fetch when arriving at the source
  // step without a populated list and not already fetching/errored.
  useEffect(() => {
    if (
      dataSources.length === 0 &&
      !isFetchingFeeds &&
      !feedListError &&
      client.slug
    ) {
      void refreshDataSources();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.slug]);

  const runFetchFeedSample = async (feed: FeedListMember | string) => {
    setIsLoading(true);
    mergeStepData({ feedSampleData: [], feedMetadata: null });
    try {
      const result = await fetchFeedSample({ clientSlug: client.slug, feed });
      mergeStepData({
        feedSampleData: result.sampleData,
        feedMetadata: result.metadata,
        ...(result.stressMap ? { stressMap: result.stressMap } : {}),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectFeed = (feed: FeedListMember) => {
    mergeStepData({ selectedFeed: feed });
    setIsLoading(true);
    void runFetchFeedSample(feed);
  };

  const errorView = feedMetadata?.error;
  const errorObj =
    errorView && typeof errorView === 'object' ? errorView : null;
  const errorString =
    errorView && typeof errorView === 'string' ? errorView : null;

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
          Step 3 of 7
        </label>
        <h3 className="text-xl font-bold text-gray-900 italic">Connect Dynamic Feed</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Feed List or Selected Feed */}
        <div className="lg:col-span-1 space-y-6">
          {!selectedFeed ? (
            <div className="grid grid-cols-1 gap-4">
              {isFetchingFeeds ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 bg-gray-50 rounded-2xl animate-pulse" />
                ))
              ) : dataSources.length > 0 ? (
                dataSources.map((feed) => (
                  <button
                    key={feed.id || feed.name}
                    onClick={() => selectFeed(feed)}
                    className="group p-5 bg-white border-2 border-gray-100 rounded-2xl hover:border-blue-600 transition-all text-left shadow-sm hover:shadow-xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-600 transition-all">
                        <CircleStackIcon className="h-5 w-5 text-blue-600 group-hover:text-white" />
                      </div>
                      <div className="flex-1 truncate">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                          {feed.type || 'Data Source'}
                        </p>
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {feed.name.replace(/^[a-zA-Z0-9]+__/g, '')}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center gap-4">
                  <div className="h-12 w-12 bg-gray-50 rounded-2xl flex items-center justify-center">
                    <ExclamationTriangleIcon className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                      {feedListError || 'No feeds found for this client'}
                    </p>
                    <p className="text-[9px] text-gray-500 font-medium">
                      Verify you have access to Alli Data Explorer for this client.
                    </p>
                  </div>
                  <button
                    onClick={() => void refreshDataSources()}
                    className="mt-4 px-6 py-2 bg-white border border-gray-200 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2"
                  >
                    <ArrowPathIcon className="h-3 w-3" /> Refresh Feeds
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 border-2 border-blue-100 space-y-8 shadow-sm relative overflow-hidden">
              <div className="relative z-10 flex items-center gap-6">
                <div className="h-16 w-16 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                  <CircleStackIcon className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    Active Connection
                  </p>
                  <h4 className="text-2xl font-black italic text-gray-900">
                    {selectedFeed.name.replace(/^[a-zA-Z0-9]+__/g, '')}
                  </h4>
                  <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mt-1">
                    Ready for mapping
                  </p>
                </div>
              </div>
              <button
                onClick={() => mergeStepData({ selectedFeed: null })}
                className="relative z-10 w-full py-3 bg-gray-50 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-gray-100 hover:border-blue-200"
              >
                Change Feed Source
              </button>
            </div>
          )}
        </div>

        {/* Field Overview */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="bg-white rounded-3xl border-2 border-gray-100 p-8 space-y-8 h-[550px] flex flex-col items-center justify-center">
              <div className="relative">
                <div className="h-16 w-16 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
                <CircleStackIcon className="h-6 w-6 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
                  Analyzing Source Schema...
                </p>
                <p className="text-[9px] font-medium text-gray-400">
                  Discovering metrics, dimensions, and data types
                </p>
              </div>
            </div>
          ) : selectedFeed ? (
            <div className="bg-white rounded-3xl border-2 border-gray-100 flex flex-col h-[550px] shadow-sm overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
                    <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                      Feed Schema Discovery
                    </h4>
                  </div>
                  <p className="text-[9px] font-medium text-gray-400 ml-3.5">
                    Active validation of available data fields
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                      Total Fields
                    </p>
                    <p className="text-sm font-black text-blue-600">{totalFields}</p>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-auto p-6 scrollbar-hide">
                {errorView ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 bg-red-50/30">
                    <div className="h-16 w-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 border border-red-100 italic shadow-sm">
                      <ExclamationTriangleIcon className="h-8 w-8" />
                    </div>

                    <div className="text-center max-w-md space-y-4">
                      <div>
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em] mb-1">
                          Critical Connection Failure
                        </p>
                        <h4 className="text-lg font-black text-gray-900 leading-tight">
                          Source Query Failed
                        </h4>
                      </div>

                      <div className="bg-white/80 backdrop-blur-sm border border-red-100 rounded-2xl p-5 text-left shadow-sm space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-red-50">
                          <div className="h-2 w-2 rounded-full bg-red-500" />
                          <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                            Debug Diagnostic
                          </p>
                        </div>

                        <div className="space-y-2 overflow-hidden">
                          <p className="text-[11px] font-bold text-red-700 bg-red-50/50 p-2 rounded-lg break-words leading-relaxed">
                            {errorObj ? errorObj.error : errorString}
                          </p>

                          {errorObj && (
                            <div className="grid grid-cols-1 gap-1.5 pt-2 text-[9px] font-medium text-gray-500">
                              <div className="flex justify-between py-1 border-b border-gray-100">
                                <span className="uppercase font-bold tracking-widest text-gray-400">
                                  Target Model
                                </span>
                                <span className="font-mono text-gray-900">
                                  {errorObj.modelName}
                                </span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-gray-100">
                                <span className="uppercase font-bold tracking-widest text-gray-400">
                                  Client Slug
                                </span>
                                <span className="font-mono text-gray-900">
                                  {errorObj.clientSlug}
                                </span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-gray-100">
                                <span className="uppercase font-bold tracking-widest text-gray-400">
                                  Error Category
                                </span>
                                <span className="font-bold text-red-600">
                                  {errorObj.category}
                                </span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-gray-100">
                                <span className="uppercase font-bold tracking-widest text-gray-400">
                                  Proxy Status
                                </span>
                                <span
                                  className={cn(
                                    'font-bold',
                                    errorObj.proxyStatus === 'Reachable'
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  )}
                                >
                                  {errorObj.proxyStatus}
                                </span>
                              </div>
                              <div className="pt-3">
                                <p className="uppercase font-bold tracking-widest text-gray-400 mb-1.5">
                                  Recommended Fix
                                </p>
                                <p className="text-gray-700 leading-relaxed bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                                  {errorObj.recommendation}
                                </p>
                              </div>

                              <div className="mt-4 opacity-50">
                                <p className="uppercase font-bold tracking-widest text-[8px] text-gray-400 mb-1">
                                  Technical Stack
                                </p>
                                <div className="bg-gray-50 p-2 rounded max-h-24 overflow-y-auto font-mono text-[8px] break-all">
                                  {errorObj.stack}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => void runFetchFeedSample(selectedFeed)}
                        className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
                      >
                        Force Retry Sync
                      </button>
                    </div>
                  </div>
                ) : feedSampleData.length > 0 ? (
                  <div className="space-y-6">
                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                      <table className="w-full border-separate border-spacing-y-2 min-w-[800px]">
                        <thead className="sticky top-0 bg-white z-10">
                          <tr className="text-left">
                            {Object.keys(feedSampleData[0] || {}).map((col) => (
                              <th
                                key={col}
                                className="pb-4 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 whitespace-nowrap"
                              >
                                {col.replace(/^[a-zA-Z0-9]+__/g, '')}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {feedSampleData.slice(0, 10).map((row, idx) => (
                            <tr
                              key={idx}
                              className="group hover:bg-blue-50/30 transition-all"
                            >
                              {Object.keys(row).map((col) => {
                                const val = String(row[col]);
                                const isUrl =
                                  val.startsWith('http') &&
                                  (val.includes('.jpg') ||
                                    val.includes('.png') ||
                                    val.includes('.webp') ||
                                    val.includes('picsum'));

                                return (
                                  <td
                                    key={col}
                                    className="p-3 bg-gray-50/50 group-hover:bg-blue-50/50 first:rounded-l-xl last:rounded-r-xl border-y border-gray-100 whitespace-nowrap"
                                  >
                                    {isUrl ? (
                                      <div className="relative h-10 w-16 rounded-lg overflow-hidden border-2 border-white shadow-sm group-hover:border-blue-400 transition-all">
                                        <img
                                          src={val}
                                          className="h-full w-full object-cover"
                                          alt="preview"
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-[10px] font-medium text-gray-900 truncate max-w-[120px] block">
                                        {val}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-4 flex items-center gap-3">
                      <div className="h-8 w-8 bg-green-50 rounded-lg flex items-center justify-center">
                        <CheckCircleIcon className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest leading-none mb-1">
                          Data Health & Structure Validated
                        </p>
                        <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest leading-none">
                          Ready for schema mapping and generation
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center px-12">
                    <div className="h-16 w-16 bg-amber-50 text-amber-400 rounded-2xl flex items-center justify-center mb-4">
                      <CircleStackIcon className="h-8 w-8" />
                    </div>
                    <p className="text-xs font-bold text-gray-900 mb-1">
                      No Sample Data Returned
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-tight leading-relaxed">
                      The source connected, but returned no rows for the selected
                      dimensions. Please verify the feed source contents.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 h-[500px] flex flex-col items-center justify-center text-center px-20">
              <CloudArrowUpIcon className="h-12 w-12 text-gray-200 mb-6" />
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
                No Feed Selected
              </h4>
              <p className="text-xs font-medium text-gray-300">
                Select a validated data source from the left to explore its
                available fields for mapping.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const sourceStep: WizardStep<TemplateBuilderStepData> = {
  id: 'source',
  name: 'Connect Data',

  validate: (data) => {
    if (!data.selectedFeed) return { ok: false, reason: 'Select a data source' };
    return { ok: true };
  },

  render: (props) => <SourceStepBody {...props} />,
};
