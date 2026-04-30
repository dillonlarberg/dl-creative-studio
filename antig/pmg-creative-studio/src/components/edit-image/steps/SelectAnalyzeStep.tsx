import { useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudArrowUpIcon,
  MagnifyingGlassIcon,
  PaintBrushIcon,
  PhotoIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../../firebase';
import { alliService } from '../../../services/alli';
import type { CreativeAsset } from '../../../types';
import { cn } from '../../../utils/cn';
import type { CreativeRecommendation, EditImageStepProps, EditType } from '../types';
import { buildRecommendations } from '../utils/buildRecommendations';
import { extractBrandColors } from '../utils/extractBrandColors';
import { parseImageAnalysis, parseScorecard } from '../utils/parseAlliAnalysis';

const ASSETS_PER_PAGE = 12;

const EDIT_TYPES: { id: EditType; title: string; description: string; enabled: boolean }[] = [
  {
    id: 'background',
    title: 'Background',
    description: 'Replace the background with a stronger visual direction.',
    enabled: true,
  },
  {
    id: 'text',
    title: 'Text',
    description: 'Text-aware edits are planned next.',
    enabled: false,
  },
  {
    id: 'colors',
    title: 'Colors',
    description: 'Palette swaps are planned next.',
    enabled: false,
  },
];

function RecommendationIcon({ category }: { category: CreativeRecommendation['category'] }) {
  if (category === 'hero-text') {
    return <ChatBubbleLeftRightIcon className="mt-0.5 h-4 w-4 text-gray-400" />;
  }

  if (category === 'brand-alignment') {
    return <SparklesIcon className="mt-0.5 h-4 w-4 text-gray-400" />;
  }

  return <PaintBrushIcon className="mt-0.5 h-4 w-4 text-gray-400" />;
}

export function SelectAnalyzeStep({
  stepData,
  onStepDataChange,
  clientSlug,
  assetHouse,
  isLoading,
  setIsLoading,
  onAdvance,
}: EditImageStepProps) {
  const [imageSource, setImageSource] = useState<'alli' | 'upload'>(stepData.imageSource || 'alli');
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assetPage, setAssetPage] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const analysisRequestIdRef = useRef(0);

  useEffect(() => {
    setImageSource(stepData.imageSource || 'alli');
  }, [stepData.imageSource]);

  useEffect(() => {
    if (clientSlug && imageSource === 'alli') {
      setIsFetchingAssets(true);
      alliService
        .getCreativeAssets(clientSlug)
        .then((all) =>
          setAssets(
            all.filter((asset) => asset.type === 'image' && !asset.url.includes('/thumbnail/')),
          ),
        )
        .catch(() => setAssets([]))
        .finally(() => setIsFetchingAssets(false));
    }
  }, [clientSlug, imageSource]);

  const platforms = [...new Set(assets.map((asset) => asset.platform).filter(Boolean))] as string[];

  const filteredAssets = assets.filter((asset) => {
    const matchesPlatform = platformFilter === 'all' || asset.platform === platformFilter;
    const matchesSearch =
      !searchQuery || (asset.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPlatform && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ASSETS_PER_PAGE));
  const paginatedAssets = filteredAssets.slice(
    (assetPage - 1) * ASSETS_PER_PAGE,
    assetPage * ASSETS_PER_PAGE,
  );

  const resetDownstreamData = {
    editType: undefined,
    imageAnalysis: undefined,
    recommendations: undefined,
    scorecardData: undefined,
    extractedImageUrl: undefined,
    extractionMethod: undefined,
    maskDataUrl: undefined,
    selectedBackground: undefined,
    customColor: undefined,
    previewReady: undefined,
    compositeDataUrl: undefined,
    finalUrl: undefined,
    savedToAssetHouse: undefined,
  };

  const fetchAnalysisForAsset = async (asset: CreativeAsset) => {
    const requestId = Date.now();
    analysisRequestIdRef.current = requestId;
    setIsAnalyzing(true);

    try {
      const result = await alliService.executeQuery(clientSlug, 'creative_insights_data_export', {
        dimensions: [
          'ci_ad_id',
          'image_vision_analysis',
          'brand_visuals',
          'call_to_action_text',
          'fatigue_status',
        ],
        measures: ['ctr', 'cpm'],
        limit: 1,
      });

      if (analysisRequestIdRef.current !== requestId) {
        return;
      }

      const match = result.results?.find((row: Record<string, unknown>) => row.ci_ad_id === asset.id);
      if (!match) {
        onStepDataChange({
          imageAnalysis: undefined,
          recommendations: undefined,
          scorecardData: undefined,
        });
        return;
      }

      const imageAnalysis = parseImageAnalysis(String(match.image_vision_analysis ?? ''));
      if (!imageAnalysis) {
        onStepDataChange({
          imageAnalysis: undefined,
          recommendations: undefined,
          scorecardData: undefined,
        });
        return;
      }

      const scorecardData = parseScorecard({
        brand_visuals: String(match.brand_visuals ?? 'false'),
        call_to_action_text: String(match.call_to_action_text ?? 'false'),
        fatigue_status: String(match.fatigue_status ?? 'null'),
        ctr: String(match.ctr ?? 'null'),
        cpm: String(match.cpm ?? 'null'),
      });

      onStepDataChange({
        imageAnalysis,
        scorecardData,
        recommendations: buildRecommendations(
          imageAnalysis,
          scorecardData,
          extractBrandColors(assetHouse),
        ),
      });
    } catch (error) {
      if (analysisRequestIdRef.current !== requestId) {
        return;
      }

      console.error('Failed to fetch Alli image analysis', error);
      onStepDataChange({
        imageAnalysis: undefined,
        recommendations: undefined,
        scorecardData: undefined,
      });
    } finally {
      if (analysisRequestIdRef.current === requestId) {
        setIsAnalyzing(false);
      }
    }
  };

  const selectAlliAsset = (asset: CreativeAsset) => {
    onStepDataChange({
      ...resetDownstreamData,
      imageUrl: asset.url,
      imageName: asset.name || 'alli-asset',
      imageSource: 'alli',
      assetId: asset.id,
      platform: asset.platform,
    });
    void fetchAnalysisForAsset(asset);
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file.');
      return;
    }

    setUploadError(null);
    setIsLoading(true);
    analysisRequestIdRef.current = Date.now();
    setIsAnalyzing(false);

    try {
      const storageRef = ref(storage, `edit-image/${clientSlug}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      onStepDataChange({
        ...resetDownstreamData,
        imageUrl: url,
        imageName: file.name,
        imageSource: 'upload',
        assetId: undefined,
        platform: undefined,
      });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = (editType: EditType) => {
    if (isAdvancing) {
      return;
    }

    onStepDataChange({ editType });

    if (onAdvance) {
      setIsAdvancing(true);
      void Promise.resolve(onAdvance()).finally(() => setIsAdvancing(false));
    }
  };

  const recommendations = stepData.recommendations || [];
  const featuredRecommendation = recommendations.find((recommendation) => recommendation.isTopRecommendation);
  const secondaryRecommendations = recommendations.filter((recommendation) => !recommendation.isTopRecommendation);
  const showRecommendationSection = imageSource === 'alli' && (isAnalyzing || recommendations.length > 0);
  const hasAiRecommendation = Boolean(featuredRecommendation?.actionType === 'background');

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div className="flex w-fit rounded-2xl bg-gray-100 p-1">
              {(['alli', 'upload'] as const).map((source) => (
                <button
                  key={source}
                  onClick={() => setImageSource(source)}
                  className={cn(
                    'rounded-xl px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all',
                    imageSource === source
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {source === 'alli' ? 'Alli Library' : 'Upload'}
                </button>
              ))}
            </div>
          </div>

          {imageSource === 'alli' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">
                  Select Image
                </h3>
                {platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {['all', ...platforms].map((platform) => (
                      <button
                        key={platform}
                        onClick={() => {
                          setPlatformFilter(platform);
                          setAssetPage(1);
                        }}
                        className={cn(
                          'rounded border px-2 py-1 text-[8px] font-black uppercase tracking-tighter transition-all',
                          platformFilter === platform
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-gray-100 bg-white text-gray-500',
                        )}
                      >
                        {platform === 'all' ? 'All' : platform}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setAssetPage(1);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-xs focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              {isFetchingAssets ? (
                <div className="space-y-4 rounded-2xl border border-dashed border-gray-100 bg-gray-50 py-20 text-center">
                  <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-blue-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                    Querying API...
                  </p>
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/30 py-20 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">
                    No images found
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                    {filteredAssets.length} images · Page {assetPage} of {totalPages}
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {paginatedAssets.map((asset) => (
                      <button
                        key={asset.id}
                        onClick={() => selectAlliAsset(asset)}
                        className={cn(
                          'group relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                          stepData.assetId === asset.id
                            ? 'border-blue-600 ring-2 ring-blue-200'
                            : 'border-gray-100 hover:border-blue-300',
                        )}
                      >
                        <img
                          src={asset.url}
                          alt={asset.name || 'Asset'}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="truncate text-[8px] font-bold text-white">
                            {asset.name || 'Untitled'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => setAssetPage((page) => Math.max(1, page - 1))}
                        disabled={assetPage === 1}
                        className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30"
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        {assetPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setAssetPage((page) => Math.min(totalPages, page + 1))}
                        disabled={assetPage === totalPages}
                        className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16 transition-colors hover:border-blue-300"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) {
                  void handleFileUpload(file);
                }
              }}
            >
              <CloudArrowUpIcon className="h-10 w-10 text-gray-400" />
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                Drag & drop an image
              </p>
              <label className="cursor-pointer rounded-xl bg-blue-600 px-6 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-blue-700">
                Browse Files
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleFileUpload(file);
                    }
                  }}
                />
              </label>
              {uploadError && <p className="text-[10px] font-bold text-red-500">{uploadError}</p>}
              {isLoading && (
                <p className="animate-pulse text-[10px] font-black uppercase tracking-widest text-blue-600">
                  Uploading...
                </p>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          {stepData.imageUrl ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">
                  Selected Image
                </p>
                <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                  <img
                    src={stepData.imageUrl}
                    alt={stepData.imageName || 'Selected'}
                    className="w-full object-contain"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {stepData.imageName || 'Untitled'}
                  </p>
                  {stepData.platform && (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-gray-500">
                      {stepData.platform}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {stepData.imageSource === 'alli'
                    ? 'Creative analysis uses Alli platform metadata for this asset.'
                    : 'Uploaded images skip Alli analysis and go straight to manual editing.'}
                </p>
              </div>

              {assetHouse?.logoPrimary && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4">
                  <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-gray-400">
                    Brand Reference
                  </p>
                  <img
                    src={assetHouse.logoPrimary}
                    alt="Brand logo"
                    className="h-10 w-auto object-contain"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/30 px-8 text-center">
              <PhotoIcon className="mb-4 h-12 w-12 text-gray-300" />
              <p className="text-sm font-medium text-gray-400">Select an image to analyze</p>
            </div>
          )}
        </div>
      </div>

      {showRecommendationSection && (
        <div
          className={cn(
            'transition-all duration-200 ease-out',
            isAnalyzing || recommendations.length > 0
              ? 'translate-y-0 opacity-100'
              : 'translate-y-2 opacity-0',
          )}
        >
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">
              AI Recommendations
            </p>

            {isAnalyzing ? (
              <div className="animate-pulse space-y-3">
                <div className="h-[140px] rounded-xl bg-gray-100" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-[100px] rounded-xl bg-gray-100" />
                  <div className="h-[100px] rounded-xl bg-gray-100" />
                </div>
              </div>
            ) : featuredRecommendation ? (
              <div className="space-y-3">
                <RecommendationCard
                  recommendation={featuredRecommendation}
                  featured
                  onApply={() => handleApply('background')}
                  isApplying={isAdvancing}
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {secondaryRecommendations.map((recommendation) => (
                    <RecommendationCard
                      key={recommendation.category}
                      recommendation={recommendation}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {stepData.imageUrl && (
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">
            Edit Type
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {EDIT_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => type.enabled && handleApply(type.id)}
                disabled={!type.enabled || isAdvancing}
                className={cn(
                  'flex h-16 items-center justify-between rounded-lg border px-4 text-left transition-all',
                  type.enabled
                    ? 'border-gray-100 bg-white hover:border-blue-300'
                    : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400',
                  type.id === 'background' && hasAiRecommendation && 'ring-1 ring-purple-200',
                  stepData.editType === type.id && 'border-blue-600 ring-2 ring-blue-200',
                )}
              >
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-gray-900">{type.title}</p>
                  <p className="text-[10px] text-gray-500">
                    {type.enabled ? type.description : 'Coming Soon'}
                  </p>
                </div>
                {type.enabled ? (
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                    Apply
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Coming Soon
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  featured = false,
  onApply,
  isApplying = false,
}: {
  recommendation: CreativeRecommendation;
  featured?: boolean;
  onApply?: () => void;
  isApplying?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-white p-4',
        featured ? 'border-2 border-purple-400' : 'border border-gray-100 opacity-80',
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <RecommendationIcon category={recommendation.category} />
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-gray-900">
                {recommendation.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                {recommendation.description}
              </p>
            </div>
          </div>
          {featured ? (
            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-purple-600">
              AI Recommends
            </span>
          ) : (
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Coming Soon
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {recommendation.dataChips.map((chip) => {
            const isColorChip = chip.startsWith('#');

            return (
              <span
                key={chip}
                className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
              >
                {isColorChip && (
                  <span
                    className="h-3 w-3 rounded-full border border-gray-200"
                    style={{ backgroundColor: chip }}
                  />
                )}
                {chip}
              </span>
            );
          })}
        </div>

        {featured && onApply && (
          <button
            onClick={onApply}
            disabled={isApplying}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isApplying ? 'Applying...' : 'Apply Background'}
          </button>
        )}
      </div>
    </div>
  );
}
