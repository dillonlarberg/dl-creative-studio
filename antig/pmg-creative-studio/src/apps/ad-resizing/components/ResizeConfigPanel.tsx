import type { ComponentType, SVGProps } from 'react';
import {
  XMarkIcon,
  BoltIcon,
  DevicePhoneMobileIcon,
  CursorArrowRaysIcon,
  PrinterIcon,
  ComputerDesktopIcon,
  TvIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { CHANNELS, getDeduplicatedDimensions } from '../data/channels';
import type { MockCreative, Dimension } from '../types';
import DimensionPreview from './DimensionPreview';

const CHANNEL_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  'social': DevicePhoneMobileIcon,
  'programmatic': CursorArrowRaysIcon,
  'print': PrinterIcon,
  'digital': ComputerDesktopIcon,
  'digital-signage': TvIcon,
};

interface ResizeConfigPanelProps {
  creative: MockCreative;
  selectedChannels: string[];
  selectedDimensions: Set<string>;
  onToggleChannel: (channelId: string) => void;
  onToggleDimension: (dimensionId: string) => void;
  onSetChannels: (channelIds: string[]) => void;
  onRun: () => void;
  onClose: () => void;
  addMode?: boolean;
  /** Set when configuring multiple photos in a queue (1-indexed). */
  queuePosition?: { current: number; total: number };
  /** Number of photos in the queue that have at least one dimension selected. */
  queueReadyCount?: number;
  onNext?: () => void;
  onPrev?: () => void;
}

export default function ResizeConfigPanel({
  creative,
  selectedChannels,
  selectedDimensions,
  onToggleChannel,
  onToggleDimension,
  onSetChannels,
  onRun,
  onClose,
  addMode = false,
  queuePosition,
  queueReadyCount = 0,
  onNext,
  onPrev,
}: ResizeConfigPanelProps) {
  const availableDimensions: Dimension[] = getDeduplicatedDimensions(selectedChannels);
  const canRun = selectedChannels.length > 0 && selectedDimensions.size > 0;
  const allChannelsSelected = selectedChannels.length === CHANNELS.length;
  const isMultiQueue = !!(queuePosition && queuePosition.total > 1);
  const isLastInQueue = !queuePosition || queuePosition.current === queuePosition.total;
  const canGenerate = isMultiQueue ? queueReadyCount > 0 : canRun;

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-gray-200 bg-white">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <p className="text-[13px] font-semibold text-gray-900">Resize Settings</p>
          {isMultiQueue && queuePosition ? (
            <p className="mt-0.5 text-[11px] text-gray-400">
              Photo {queuePosition.current} of {queuePosition.total}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-gray-400">1 creative selected</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Deselect creative"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Selected creative preview */}
        <div className="border-b border-gray-200 px-5 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Selected Creative</p>
          <div className="flex items-center gap-3">
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-100">
              <img src={creative.thumbnailUrl} alt={creative.name} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-gray-900">{creative.name}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {creative.width}×{creative.height} · {creative.fileType}
              </p>
            </div>
          </div>
        </div>

        {/* Channel selection */}
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Target Channels</p>
            <button
              type="button"
              onClick={() => onSetChannels(allChannelsSelected ? [] : CHANNELS.map(c => c.id))}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
            >
              {allChannelsSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <p className="mb-3 text-[11px] text-gray-400">Choose where this ad will run — sizes load per platform.</p>
          <div className="flex flex-col gap-2">
            {CHANNELS.map((channel) => {
              const active = selectedChannels.includes(channel.id);
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => onToggleChannel(channel.id)}
                  className={cn(
                    'flex flex-col rounded-lg border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/40'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {(() => { const Icon = CHANNEL_ICONS[channel.id]; return Icon ? <Icon className="h-4 w-4 shrink-0 text-gray-400" /> : null; })()}
                    <span className="flex-1 text-[13px] font-medium">{channel.label}</span>
                    {active
                      ? <span className="h-4 w-4 shrink-0 rounded-full bg-blue-600 text-center text-[9px] leading-4 text-white">✓</span>
                      : <span className="text-[11px] text-gray-400">{channel.dimensions.length} sizes</span>
                    }
                  </div>
                  <p className="mt-1 pl-7 text-[10px] text-gray-400">
                    {channel.dimensions.map(d => d.label).join(' · ')}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dimension selection */}
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sizes to Generate</p>
            {availableDimensions.length > 0 && (
              <span className="text-[11px] text-gray-400">
                {selectedDimensions.size}/{availableDimensions.length} selected
              </span>
            )}
          </div>

          {selectedChannels.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
              <p className="text-[12px] font-medium text-gray-500">No channel selected</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                Pick a channel above — sizes are platform-specific, so they appear once you choose where you're running this ad.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {availableDimensions.map((dim) => {
                const checked = selectedDimensions.has(dim.id);
                return (
                  <button
                    key={dim.id}
                    type="button"
                    onClick={() => onToggleDimension(dim.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                      checked
                        ? 'border-blue-200 bg-blue-50/60'
                        : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50'
                    )}
                  >
                    <DimensionPreview width={dim.width} height={dim.height} maxSize={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800">{dim.label}</p>
                      <p className="text-[11px] text-gray-400">{dim.width}×{dim.height} · {dim.channelLabel}</p>
                    </div>
                    <div className={cn(
                      'h-4 w-4 shrink-0 rounded border transition-colors',
                      checked ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                    )}>
                      {checked && (
                        <svg viewBox="0 0 12 12" fill="none" className="h-full w-full p-0.5">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-5 py-4">
        {/* Prev / Next navigation — only shown in multi-photo queue */}
        {isMultiQueue && queuePosition && (
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={queuePosition.current === 1}
              className={cn(
                'flex items-center gap-1 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors',
                queuePosition.current === 1
                  ? 'cursor-not-allowed border-gray-100 text-gray-300'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
              Prev
            </button>
            {!isLastInQueue && (
              <button
                type="button"
                onClick={onNext}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-medium text-blue-700 transition-colors hover:bg-blue-100"
              >
                Next
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Generate button */}
        <button
          type="button"
          onClick={onRun}
          disabled={!canGenerate}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-colors',
            canGenerate
              ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
              : 'cursor-not-allowed bg-gray-100 text-gray-400',
          )}
        >
          <BoltIcon className="h-4 w-4" />
          {isMultiQueue
            ? (canGenerate
                ? `Generate All (${queueReadyCount} photo${queueReadyCount === 1 ? '' : 's'} ready)`
                : 'Configure a photo to continue')
            : (canRun
                ? `${addMode ? 'Add' : 'Generate'} ${selectedDimensions.size} size${selectedDimensions.size === 1 ? '' : 's'}`
                : 'Select a channel to continue')}
        </button>
      </div>
    </div>
  );
}
