import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowUpTrayIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { validateVideoFile } from '../utils/videoValidation';
import { uploadVideo } from '../services/uploadVideo';
import { fmtTime } from '../utils/fmtTime';

export interface UploadedSource {
  storagePath: string;
  url: string;
  name: string;
  durationSec?: number;
}

interface SourcePanelProps {
  onUploaded: (src: UploadedSource) => void;
}

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string }
  | { kind: 'ready'; src: UploadedSource }
  | { kind: 'error'; reason: string };

/**
 * Reads a video file's duration client-side via a transient <video> element +
 * object URL. Best-effort — resolves `undefined` on any failure so upload
 * still proceeds (the backend re-probes authoritatively with ffmpeg).
 */
function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      const cleanup = () => URL.revokeObjectURL(objectUrl);
      video.onloadedmetadata = () => {
        const d = Number.isFinite(video.duration) ? video.duration : undefined;
        cleanup();
        resolve(d);
      };
      video.onerror = () => {
        cleanup();
        resolve(undefined);
      };
      video.src = objectUrl;
    } catch {
      resolve(undefined);
    }
  });
}

export default function SourcePanel({ onUploaded }: SourcePanelProps) {
  const { clientSlug = '' } = useParams<{ clientSlug: string }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });

  async function handleFile(file: File) {
    const validation = validateVideoFile(file);
    if (!validation.ok) {
      setState({ kind: 'error', reason: validation.reason });
      return;
    }

    setState({ kind: 'uploading', name: file.name });
    try {
      const durationSec = await probeDuration(file);
      const uploaded = await uploadVideo(clientSlug, file);
      const src: UploadedSource = { ...uploaded, durationSec };
      setState({ kind: 'ready', src });
      onUploaded(src);
    } catch (err) {
      setState({
        kind: 'error',
        reason: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      });
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (file) void handleFile(file);
  }

  const isUploading = state.kind === 'uploading';

  return (
    <div className="flex-1">
      {/* Tabs: From Alli (disabled) | Upload Files (active) */}
      <div className="mb-5 flex items-center gap-6 border-b border-gray-200">
        <div
          className="flex cursor-not-allowed items-center gap-1.5 border-b-2 border-transparent px-0.5 pb-2.5 text-[13px] font-medium text-gray-300"
          title="Connecting an Alli data source is coming soon"
        >
          <CircleStackIcon className="h-3.5 w-3.5" />
          From Alli
          <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
            soon
          </span>
        </div>
        <div className="flex items-center gap-1.5 border-b-2 border-blue-600 px-0.5 pb-2.5 text-[13px] font-semibold text-gray-900">
          <ArrowUpTrayIcon className="h-3.5 w-3.5" />
          Upload Files
        </div>
      </div>

      {/* Upload dropzone */}
      <div className="mx-auto max-w-[640px]">
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime"
          className="hidden"
          onChange={onInputChange}
        />

        <button
          type="button"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex w-full justify-center rounded-lg border-2 border-dashed bg-white/50 px-6 py-14 transition-colors',
            isUploading
              ? 'cursor-wait border-blue-300 bg-blue-50/40'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
          )}
        >
          <div className="text-center">
            {isUploading ? (
              <>
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                <p className="mt-4 text-[13px] font-medium text-gray-700">Uploading {state.name}…</p>
                <p className="mt-1 text-[12px] text-gray-500">Hang tight — this can take a moment for large files.</p>
              </>
            ) : (
              <>
                <ArrowUpTrayIcon className="mx-auto h-11 w-11 text-gray-300" strokeWidth={1.4} />
                <div className="mt-4 text-[13px] leading-6 text-gray-600">
                  <span className="font-semibold text-blue-600">Upload a video</span>
                  <span className="pl-1">or click to browse</span>
                </div>
                <p className="text-[12px] leading-5 text-gray-500">MP4, MOV · 15s minimum, no max length</p>
              </>
            )}
          </div>
        </button>

        {state.kind === 'ready' && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5">
            <p className="min-w-0 truncate text-[13px] font-medium text-green-800">
              Uploaded <span className="font-semibold">{state.src.name}</span>
              {state.src.durationSec != null && (
                <span className="ml-1 font-mono text-[12px] text-green-700">· {fmtTime(state.src.durationSec)}</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="shrink-0 text-[12px] font-medium text-green-700 hover:text-green-900"
            >
              Replace
            </button>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
            <p className="min-w-0 break-words text-[12px] text-red-700">{state.reason}</p>
            <button
              type="button"
              onClick={() => setState({ kind: 'idle' })}
              className="shrink-0 text-[12px] font-medium text-red-700 hover:text-red-900"
            >
              Dismiss
            </button>
          </div>
        )}

        <p className="mt-3 text-center text-[12px] text-gray-400">
          We probe the true duration on upload so nothing downstream runs past the end.
        </p>
      </div>
    </div>
  );
}
