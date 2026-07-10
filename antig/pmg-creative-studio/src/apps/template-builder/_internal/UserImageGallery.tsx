import { useState, useEffect, useRef } from 'react';
import { ArrowUpTrayIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import {
  uploadUserCanvasImage,
  listUserCanvasImages,
  type UserCanvasAsset,
} from '../services/userImageGalleryService';

export interface UserImageGalleryProps {
  clientSlug: string;
  selectedUrl?: string;
  onSelect: (url: string) => void;
}

export function UserImageGallery({ clientSlug, selectedUrl, onSelect }: UserImageGalleryProps) {
  const [assets, setAssets] = useState<UserCanvasAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load user's existing uploads
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listUserCanvasImages(clientSlug)
      .then((list) => { if (!cancelled) setAssets(list); })
      .catch(() => { /* Firestore rules may block — silently proceed empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientSlug]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = '';

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const asset = await uploadUserCanvasImage(clientSlug, file, setProgress);
      setAssets((prev) => [asset, ...prev]);
      onSelect(asset.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div className="space-y-1.5">
      {/* Section header + upload button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          My uploads
        </span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border transition-colors',
            uploading
              ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400 bg-gray-50'
              : 'border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100',
          )}
        >
          <ArrowUpTrayIcon className="h-3 w-3" />
          {uploading ? `${progress}%` : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Upload progress bar */}
      {uploading && (
        <div className="w-full h-1 rounded bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && <p className="text-[10px] text-red-500">{error}</p>}

      {/* Thumbnail grid */}
      {loading ? (
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-3 border border-dashed border-gray-200 rounded text-gray-400">
          <PhotoIcon className="h-5 w-5 mb-1 opacity-40" />
          <p className="text-[10px]">No uploads yet</p>
        </div>
      ) : (
        <div
          className="grid grid-cols-4 gap-1 overflow-y-auto"
          style={{ maxHeight: 84 }}
        >
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onSelect(asset.url)}
              title={asset.name}
              className={cn(
                'aspect-square rounded overflow-hidden border-2 transition-all',
                selectedUrl === asset.url
                  ? 'border-indigo-600 ring-1 ring-indigo-400'
                  : 'border-transparent hover:border-indigo-300',
              )}
            >
              <img
                src={asset.url}
                alt={asset.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
