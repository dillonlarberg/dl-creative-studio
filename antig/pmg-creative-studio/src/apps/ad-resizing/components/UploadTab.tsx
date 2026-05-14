import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUpTrayIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import { validateUploadFile } from '../utils/uploadValidation';
import { uploadCreative, listUploads, retryFirestoreWrite, type UploadMeta } from '../services/uploadService';
import UploadedCreativeGrid from './UploadedCreativeGrid';
import type { Creative } from '../types';

interface UploadTabProps {
  clientSlug: string;
  onUploadConnect: (creatives: Creative[]) => void;
}

type PendingStatus = 'uploading' | 'error-storage' | 'error-firestore' | 'invalid';

interface PendingUpload {
  id: string;
  name: string;
  tempUrl: string;
  status: PendingStatus;
  error?: string;
  uploadId?: string;
  storageMeta?: UploadMeta;
}

function probeImageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1080, height: 1080 });
    img.src = objectUrl;
  });
}

export default function UploadTab({ clientSlug, onUploadConnect }: UploadTabProps) {
  const [uploadedCreatives, setUploadedCreatives] = useState<Creative[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const isMountedRef = useRef(true);
  const pendingRevokeRef = useRef<Map<string, string>>(new Map());
  const allTempUrlsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    listUploads(clientSlug)
      .then(creatives => { if (isMountedRef.current) setUploadedCreatives(creatives); })
      .catch(() => { if (isMountedRef.current) setLoadError('Could not load previous uploads. You can still upload new files.'); });
    return () => {
      isMountedRef.current = false;
      for (const url of allTempUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, [clientSlug]);

  const handleThumbnailLoaded = useCallback((creativeId: string) => {
    const tempUrl = pendingRevokeRef.current.get(creativeId);
    if (tempUrl) {
      URL.revokeObjectURL(tempUrl);
      pendingRevokeRef.current.delete(creativeId);
      allTempUrlsRef.current.delete(tempUrl);
    }
  }, []);

  async function processFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const items = fileArray.map(file => {
      const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const validation = validateUploadFile(file);
      if (!validation.valid) {
        return { localId, file, tempUrl: '', valid: false as const, error: validation.error };
      }
      const tempUrl = URL.createObjectURL(file);
      allTempUrlsRef.current.add(tempUrl);
      return { localId, file, tempUrl, valid: true as const, error: undefined };
    });

    setPendingUploads(prev => [
      ...prev,
      ...items.map(item => ({
        id: item.localId,
        name: item.file.name,
        tempUrl: item.tempUrl,
        status: item.valid ? ('uploading' as PendingStatus) : ('invalid' as PendingStatus),
        error: item.error,
      })),
    ]);

    await Promise.allSettled(
      items
        .filter(item => item.valid)
        .map(async ({ localId, file, tempUrl }) => {
          try {
            const dimensions = await probeImageDimensions(tempUrl);
            if (!isMountedRef.current) return;
            const creative = await uploadCreative(clientSlug, file, dimensions);
            if (!isMountedRef.current) return;
            pendingRevokeRef.current.set(creative.id, tempUrl);
            setPendingUploads(prev => prev.filter(p => p.id !== localId));
            setUploadedCreatives(prev => [creative, ...prev]);
          } catch (err) {
            if (!isMountedRef.current) return;
            URL.revokeObjectURL(tempUrl);
            allTempUrlsRef.current.delete(tempUrl);
            const message = err instanceof Error ? err.message : 'Upload failed';
            setPendingUploads(prev => prev.map(p =>
              p.id === localId
                ? { ...p, status: 'error-storage' as PendingStatus, error: 'Upload failed. Tap to retry.' }
                : p,
            ));
            console.error('Upload error for', file.name, message);
          }
        }),
    );
  }

  async function retryPending(pending: PendingUpload) {
    if (pending.status === 'error-firestore' && pending.uploadId && pending.storageMeta) {
      try {
        await retryFirestoreWrite(clientSlug, pending.uploadId, pending.storageMeta);
        if (!isMountedRef.current) return;
        const creative: Creative = {
          id: pending.uploadId,
          name: pending.storageMeta.name,
          thumbnailUrl: pending.storageMeta.url,
          originalUrl: pending.storageMeta.url,
          width: pending.storageMeta.width,
          height: pending.storageMeta.height,
          fileType: pending.storageMeta.fileType,
          uploadedAt: new Date().toISOString(),
          source: 'upload',
          sourceKind: 'upload',
          tags: [],
        };
        setPendingUploads(prev => prev.filter(p => p.id !== pending.id));
        setUploadedCreatives(prev => [creative, ...prev]);
      } catch {
        if (!isMountedRef.current) return;
        setPendingUploads(prev => prev.map(p =>
          p.id === pending.id ? { ...p, error: 'Retry failed. Try again.' } : p,
        ));
      }
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedCreatives = uploadedCreatives.filter(c => selectedIds.has(c.id));
  const hasUploads = uploadedCreatives.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          {loadError}
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              listUploads(clientSlug)
                .then(c => { if (isMountedRef.current) setUploadedCreatives(c); })
                .catch(() => { if (isMountedRef.current) setLoadError('Could not load previous uploads.'); });
            }}
            className="ml-auto shrink-0 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      <div
        onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          processFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
          hasUploads ? 'px-4 py-5' : 'px-6 py-16',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40',
        )}
      >
        <ArrowUpTrayIcon className={cn('mb-2 h-6 w-6', isDragging ? 'text-blue-500' : 'text-gray-400')} />
        {hasUploads ? (
          <p className="text-[13px] text-gray-500">
            <span className="font-medium text-blue-600">Upload more files</span>
            {' '}or drag and drop
          </p>
        ) : (
          <>
            <p className="text-[14px] font-medium text-gray-700">Drag files here or click to browse</p>
            <p className="mt-1 text-[12px] text-gray-400">PNG, JPG, WebP · Max 50 MB per file</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {pendingUploads.length > 0 && (
        <div className="flex flex-col gap-2">
          {pendingUploads.map(pending => (
            <div
              key={pending.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[13px]',
                pending.status === 'uploading' && 'border-blue-100 bg-blue-50',
                (pending.status === 'error-storage' || pending.status === 'error-firestore') && 'border-red-100 bg-red-50',
                pending.status === 'invalid' && 'border-amber-100 bg-amber-50',
              )}
            >
              {pending.status === 'uploading' && (
                <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
              )}
              {(pending.status === 'error-storage' || pending.status === 'error-firestore') && (
                <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
              {pending.status === 'invalid' && (
                <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <span className="truncate font-medium text-gray-700">{pending.name}</span>
                {pending.error && (
                  <p className={cn('text-[12px]', pending.status === 'invalid' ? 'text-amber-600' : 'text-red-600')}>
                    {pending.error}
                  </p>
                )}
              </div>
              {pending.status === 'error-firestore' && (
                <button
                  type="button"
                  onClick={() => retryPending(pending)}
                  className="shrink-0 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                >
                  <ArrowPathIcon className="h-3.5 w-3.5" />
                </button>
              )}
              {(pending.status === 'invalid' || pending.status === 'error-storage') && (
                <button
                  type="button"
                  onClick={() => setPendingUploads(prev => prev.filter(p => p.id !== pending.id))}
                  className="shrink-0 text-gray-300 hover:text-gray-500"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <UploadedCreativeGrid
        creatives={uploadedCreatives}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onThumbnailLoaded={handleThumbnailLoaded}
      />

      {selectedCreatives.length > 0 && (
        <div className="sticky bottom-0 flex justify-end border-t border-gray-100 bg-white pt-4 pb-1">
          <button
            type="button"
            onClick={() => onUploadConnect(selectedCreatives)}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-[13px] font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Continue with {selectedCreatives.length} file{selectedCreatives.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
