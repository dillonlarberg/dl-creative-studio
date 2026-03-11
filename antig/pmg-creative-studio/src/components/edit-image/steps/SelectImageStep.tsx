import { useState, useEffect } from 'react';
import { ArrowPathIcon, CloudArrowUpIcon, MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { alliService } from '../../../services/alli';
import { storage } from '../../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { CreativeAsset } from '../../../types';
import type { EditImageStepProps } from '../types';

const ASSETS_PER_PAGE = 12;

export function SelectImageStep({
  stepData,
  onStepDataChange,
  clientSlug,
  isLoading,
  setIsLoading,
}: EditImageStepProps) {
  const [imageSource, setImageSource] = useState<'alli' | 'upload'>(stepData.imageSource || 'alli');
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assetPage, setAssetPage] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (clientSlug && imageSource === 'alli') {
      setIsFetchingAssets(true);
      alliService
        .getCreativeAssets(clientSlug)
        .then((all) => setAssets(all.filter((a) => a.type === 'image')))
        .catch(() => setAssets([]))
        .finally(() => setIsFetchingAssets(false));
    }
  }, [clientSlug, imageSource]);

  const platforms = [...new Set(assets.map((a) => a.platform).filter(Boolean))] as string[];

  const filteredAssets = assets.filter((a) => {
    const matchesPlatform = platformFilter === 'all' || a.platform === platformFilter;
    const matchesSearch =
      !searchQuery || (a.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPlatform && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ASSETS_PER_PAGE));
  const paginatedAssets = filteredAssets.slice(
    (assetPage - 1) * ASSETS_PER_PAGE,
    assetPage * ASSETS_PER_PAGE,
  );

  // Clear downstream step data whenever a new image is selected
  const resetDownstreamData = {
    extractedImageUrl: undefined,
    extractionMethod: undefined,
    selectedBackground: undefined,
    customColor: undefined,
    previewReady: undefined,
    compositeDataUrl: undefined,
    finalUrl: undefined,
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
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file.');
      return;
    }
    setUploadError(null);
    setIsLoading(true);
    try {
      const storageRef = ref(storage, `edit-image/${clientSlug}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      onStepDataChange({
        ...resetDownstreamData,
        imageUrl: url,
        imageName: file.name,
        imageSource: 'upload',
      });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* LEFT: Asset picker */}
      <div className="lg:col-span-8 space-y-6">
        {/* Source toggle */}
        <div className="flex items-center justify-between">
          <div className="flex p-1 bg-gray-100 rounded-2xl w-fit">
            {(['alli', 'upload'] as const).map((src) => (
              <button
                key={src}
                onClick={() => setImageSource(src)}
                className={cn(
                  'px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                  imageSource === src
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {src === 'alli' ? 'Alli Central' : 'Local Upload'}
              </button>
            ))}
          </div>
        </div>

        {imageSource === 'alli' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
                Select Image from Alli
              </h3>
              {platforms.length > 0 && (
                <div className="flex gap-1">
                  {['all', ...platforms].map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPlatformFilter(p); setAssetPage(1); }}
                      className={cn(
                        'px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter border transition-all',
                        platformFilter === p
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-500 border-gray-100',
                      )}
                    >
                      {p === 'all' ? 'All' : p}
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
                onChange={(e) => { setSearchQuery(e.target.value); setAssetPage(1); }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-xs focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {isFetchingAssets ? (
              <div className="py-20 text-center space-y-4 bg-gray-50 rounded-2xl border border-dashed border-gray-100">
                <ArrowPathIcon className="h-8 w-8 mx-auto text-blue-600 animate-spin" />
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Querying API...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  {filteredAssets.length} images · Page {assetPage} of {totalPages}
                </p>
                <div className="grid grid-cols-4 gap-2">
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
                      <img src={asset.url} alt={asset.name || 'Asset'} className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-[8px] font-bold text-white truncate">{asset.name || 'Untitled'}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => setAssetPage((p) => Math.max(1, p - 1))}
                      disabled={assetPage === 1}
                      className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30"
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                    </button>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      {assetPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setAssetPage((p) => Math.min(totalPages, p + 1))}
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
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFileUpload(file);
            }}
          >
            <CloudArrowUpIcon className="h-10 w-10 text-gray-400" />
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Drag & drop an image</p>
            <label className="cursor-pointer rounded-xl bg-blue-600 px-6 py-2 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors">
              Browse Files
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }}
              />
            </label>
            {uploadError && <p className="text-[10px] font-bold text-red-500">{uploadError}</p>}
            {isLoading && (
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">Uploading...</p>
            )}
          </div>
        )}
      </div>

      {/* RIGHT: Selected image preview */}
      <div className="lg:col-span-4">
        {stepData.imageUrl ? (
          <div className="space-y-3">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Selected Image</h3>
            <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
              <img src={stepData.imageUrl} alt={stepData.imageName || 'Selected'} className="w-full object-contain" />
            </div>
            <p className="text-[10px] font-bold text-gray-500 truncate">{stepData.imageName}</p>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/30">
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No image selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
