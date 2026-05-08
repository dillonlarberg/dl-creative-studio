import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useState, useRef, useEffect } from 'react';
import { cn } from '../../../utils/cn';

export type GenSortOption = 'default' | 'label-az' | 'size-desc' | 'size-asc';

interface GeneratedFilterBarProps {
  channel: string;
  sort: GenSortOption;
  channelOptions: string[];
  onChannelChange: (v: string) => void;
  onSortChange: (v: GenSortOption) => void;
  onClearFilters: () => void;
  totalCount: number;
  filteredCount: number;
}

const SORT_OPTIONS: { value: GenSortOption; label: string }[] = [
  { value: 'default', label: 'By aspect ratio' },
  { value: 'label-az', label: 'Label A–Z' },
  { value: 'size-desc', label: 'Size: largest' },
  { value: 'size-asc', label: 'Size: smallest' },
];

function Dropdown<T extends string>({
  value,
  options,
  onChange,
  isDefault,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  isDefault?: (v: T) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentLabel = options.find(o => o.value === value)?.label ?? '';
  const active = isDefault ? !isDefault(value) : false;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors',
          active
            ? 'border-blue-600 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
        )}
      >
        {currentLabel}
        <ChevronDownIcon className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                'flex w-full items-center px-3 py-2 text-left text-[13px] transition-colors',
                opt.value === value
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GeneratedFilterBar({
  channel,
  sort,
  channelOptions,
  onChannelChange,
  onSortChange,
  onClearFilters,
  totalCount,
  filteredCount,
}: GeneratedFilterBarProps) {
  const channelDropdownOptions = [
    { value: 'all', label: 'All Channels' },
    ...channelOptions.map(label => ({ value: label, label })),
  ];

  const isFiltered = channel !== 'all';

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {channelOptions.length > 1 && (
          <Dropdown
            value={channel}
            options={channelDropdownOptions}
            onChange={onChannelChange}
            isDefault={v => v === 'all'}
          />
        )}
        {isFiltered && (
          <>
            <span className="text-[12px] text-gray-400">
              {filteredCount === 0 ? 'No matches' : `${filteredCount} of ${totalCount}`}
            </span>
            <button
              type="button"
              onClick={onClearFilters}
              className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
            >
              Clear
            </button>
          </>
        )}
      </div>

      <Dropdown
        value={sort}
        options={SORT_OPTIONS}
        onChange={onSortChange}
        isDefault={v => v === 'default'}
      />
    </div>
  );
}
