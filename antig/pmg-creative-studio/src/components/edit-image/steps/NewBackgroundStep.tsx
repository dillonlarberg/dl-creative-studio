import { useState, useEffect, useRef } from 'react';
import { CloudArrowUpIcon, MagnifyingGlassIcon, CheckIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { alliService } from '../../../services/alli';
import { storage } from '../../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { CreativeAsset } from '../../../types';
import type { EditImageStepProps } from '../types';

const ASSETS_PER_PAGE = 8;

export function NewBackgroundStep({
  stepData,
  onStepDataChange,
  clientSlug,
  assetHouse,
  isLoading,
  setIsLoading,
}: EditImageStepProps) {
  const [imageMode, setImageMode] = useState<'alli' | 'upload' | null>(null);
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetPage, setAssetPage] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Gather brand colors from assetHouse
  const brandColors: { label: string; value: string }[] = [];
  if (assetHouse) {
    if (assetHouse.primaryColor) {
      brandColors.push({ label: 'Primary', value: assetHouse.primaryColor });
    }
    for (const v of assetHouse.variables || []) {
      if (v.type === 'color' && v.value) {
        brandColors.push({ label: v.name, value: v.value });
      }
    }
    for (const a of assetHouse.assets || []) {
      if (a.type === 'color' && a.value) {
        brandColors.push({ label: a.name, value: a.value });
      }
    }
  }

  // Add custom color if set and not already in brand colors
  const allColors = [...brandColors];
  if (stepData.customColor && !brandColors.some((c) => c.value.toLowerCase() === stepData.customColor!.toLowerCase())) {
    allColors.push({ label: 'Custom', value: stepData.customColor });
  }

  // Fetch Alli creative assets when browse mode is opened
  useEffect(() => {
    if (imageMode === 'alli' && clientSlug) {
      setIsFetchingAssets(true);
      alliService
        .getCreativeAssets(clientSlug)
        .then((all) => setAssets(all.filter((a) => a.type === 'image')))
        .catch(() => setAssets([]))
        .finally(() => setIsFetchingAssets(false));
    }
  }, [imageMode, clientSlug]);

  const filteredAssets = assets.filter(
    (a) => !searchQuery || (a.name || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ASSETS_PER_PAGE));
  const paginatedAssets = filteredAssets.slice(
    (assetPage - 1) * ASSETS_PER_PAGE,
    assetPage * ASSETS_PER_PAGE,
  );

  const selectColor = (color: string) => {
    onStepDataChange({ selectedBackground: { type: 'color', value: color } });
  };

  const handleCustomColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    onStepDataChange({
      customColor: color,
      selectedBackground: { type: 'color', value: color },
    });
  };

  const selectImage = (url: string, name: string) => {
    onStepDataChange({ selectedBackground: { type: 'image', url, name } });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file.');
      return;
    }
    setUploadError(null);
    setIsLoading(true);
    try {
      const storageRef = ref(storage, `edit-image/${clientSlug}/bg_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      selectImage(url, file.name);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedBackground = stepData.selectedBackground;
  const selectedColor = selectedBackground?.type === 'color' ? selectedBackground : null;
  const selectedImage = selectedBackground?.type === 'image' ? selectedBackground : null;
  const selectedColorValue = selectedColor?.value ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Brand Colors */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Brand Colors</h3>
        {brandColors.length > 0 ? (
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">From Alli Asset Library</p>
        ) : (
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">No brand colors configured — use + to pick a custom color</p>
        )}
        <div className="flex flex-wrap gap-3 items-center">
          {allColors.map((color) => (
            <button
              key={color.value}
              onClick={() => selectColor(color.value)}
              className={cn(
                'relative h-12 w-12 rounded-xl border-2 transition-all shadow-sm',
                selectedColorValue === color.value
                  ? 'border-blue-600 ring-2 ring-blue-200 scale-110'
                  : 'border-gray-200 hover:border-blue-300 hover:scale-105',
              )}
              style={{ backgroundColor: color.value }}
              title={color.label}
            >
              {selectedColorValue === color.value && (
                <CheckIcon className="absolute inset-0 m-auto h-5 w-5 text-blue-600 drop-shadow" />
              )}
            </button>
          ))}

          {/* + button for custom color picker */}
          <button
            onClick={() => colorInputRef.current?.click()}
            className="h-12 w-12 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-blue-300 transition-all bg-gray-50"
            title="Pick a custom color"
          >
            <PlusIcon className="h-5 w-5 text-gray-400" />
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="sr-only"
            value={stepData.customColor || '#000000'}
            onChange={handleCustomColor}
          />
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Background Image */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Background Image</h3>

        {!imageMode ? (
          <div className="grid grid-cols-2 gap-4">
            {/* Browse Alli Creative */}
            <button
              onClick={() => setImageMode('alli')}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-100 p-6 text-center hover:border-blue-300 hover:bg-gray-50/50 transition-all"
            >
              <div className="rounded-xl bg-blue-50 p-4">
                <MagnifyingGlassIcon className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Browse Alli Creative</p>
              <p className="text-[9px] text-gray-500">Search existing assets</p>
            </button>

            {/* Upload Image */}
            <button
              onClick={() => setImageMode('upload')}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center hover:border-blue-300 hover:bg-gray-50/50 transition-all"
            >
              <div className="rounded-xl bg-green-50 p-4">
                <CloudArrowUpIcon className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Upload Image</p>
              <p className="text-[9px] text-gray-500">JPG, PNG, WebP</p>
            </button>
          </div>
        ) : imageMode === 'alli' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setImageMode(null)}
                className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
              >
                &larr; Back
              </button>
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
              <div className="py-16 text-center space-y-4 bg-gray-50 rounded-2xl border border-dashed border-gray-100">
                <ArrowPathIcon className="h-8 w-8 mx-auto text-blue-600 animate-spin" />
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Querying API...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  {filteredAssets.length} images &middot; Page {assetPage} of {totalPages}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {paginatedAssets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => selectImage(asset.url, asset.name || 'alli-asset')}
                      className={cn(
                        'group relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                        selectedImage?.url === asset.url
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
          <div className="space-y-4">
            <button
              onClick={() => setImageMode(null)}
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
            >
              &larr; Back
            </button>

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
          </div>
        )}

        {/* Selected background preview */}
        {selectedImage && (
          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-3 border border-gray-100">
            <img src={selectedImage.url} alt={selectedImage.name} className="h-16 w-16 rounded-lg object-cover" />
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected Background</p>
              <p className="text-xs font-bold text-gray-900 truncate max-w-xs">{selectedImage.name}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
