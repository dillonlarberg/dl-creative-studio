import type { ComponentType, SVGProps } from 'react';
import {
  XMarkIcon,
  BoltIcon,
  DevicePhoneMobileIcon,
  CursorArrowRaysIcon,
  PrinterIcon,
  ComputerDesktopIcon,
  TvIcon,
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
}: ResizeConfigPanelProps) {
  const availableDimensions: Dimension[] = getDeduplicatedDimensions(selectedChannels);
  const canRun = selectedChannels.length > 0 && selectedDimensions.size > 0;
  const allChannelsSelected = selectedChannels.length === CHANNELS.length;

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-gray-200 bg-white">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <p className="text-[13px] font-semibold text-gray-900">Resize Settings</p>
          <p className="mt-0.5 text-[11px] text-gray-400">1 creative selected</p>
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
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Target Channels</p>
            <button
              type="button"
              onClick={() => onSetChannels(allChannelsSelected ? [] : CHANNELS.map(c => c.id))}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
            >
              {allChannelsSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {CHANNELS.map((channel) => {
              const active = selectedChannels.includes(channel.id);
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => onToggleChannel(channel.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/40'
                  )}
                >
                  {(() => { const Icon = CHANNEL_ICONS[channel.id]; return Icon ? <Icon className="h-4 w-4 shrink-0 text-gray-400" /> : null; })()}
                  <span className="flex-1 text-[13px] font-medium">{channel.label}</span>
                  <span className="text-[11px] text-gray-400">{channel.dimensions.length} sizes</span>
                  {active && (
                    <span className="h-4 w-4 shrink-0 rounded-full bg-blue-600 text-center text-[9px] leading-4 text-white">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dimension selection */}
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Output Sizes</p>
            {availableDimensions.length > 0 && (
              <span className="text-[11px] text-gray-400">
                {selectedDimensions.size}/{availableDimensions.length} selected
              </span>
            )}
          </div>

          {selectedChannels.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-gray-400">
              Select a channel to see available sizes.
            </p>
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

      {/* Run footer */}
      <div className="border-t border-gray-200 px-5 py-4">
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-colors',
            canRun
              ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
              : 'cursor-not-allowed bg-gray-100 text-gray-400'
          )}
        >
          <BoltIcon className="h-4 w-4" />
          {canRun
            ? `Run — ${selectedDimensions.size} size${selectedDimensions.size === 1 ? '' : 's'}`
            : 'Select channels to run'}
        </button>
      </div>
    </div>
  );
}
