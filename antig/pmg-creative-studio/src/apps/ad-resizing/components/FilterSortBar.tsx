import { ChevronDownIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { useState, useRef, useEffect } from 'react';
import { cn } from '../../../utils/cn';

export type FormatFilter = 'all' | 'landscape' | 'square' | 'portrait';
export type FileTypeFilter = 'all' | 'PNG' | 'JPG' | 'GIF';
export type SortOption = 'newest' | 'oldest' | 'az' | 'za';

interface FilterSortBarProps {
  format: FormatFilter;
  fileType: FileTypeFilter;
  sort: SortOption;
  onFormatChange: (v: FormatFilter) => void;
  onFileTypeChange: (v: FileTypeFilter) => void;
  onSortChange: (v: SortOption) => void;
  totalCount: number;
  filteredCount: number;
}

const FORMAT_OPTIONS: { value: FormatFilter; label: string }[] = [
  { value: 'all', label: 'All Formats' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'square', label: 'Square' },
  { value: 'portrait', label: 'Portrait' },
];

const FILETYPE_OPTIONS: { value: FileTypeFilter; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'PNG', label: 'PNG' },
  { value: 'JPG', label: 'JPG' },
  { value: 'GIF', label: 'GIF' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'az', label: 'Name A–Z' },
  { value: 'za', label: 'Name Z–A' },
];

function Dropdown<T extends string>({
  value,
  options,
  onChange,
  icon,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentLabel = options.find(o => o.value === value)?.label ?? '';

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
          value !== 'all' && value !== 'newest'
            ? 'border-blue-600 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
        )}
      >
        {icon}
        {currentLabel}
        <ChevronDownIcon className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
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

export default function FilterSortBar({
  format,
  fileType,
  sort,
  onFormatChange,
  onFileTypeChange,
  onSortChange,
  totalCount,
  filteredCount,
}: FilterSortBarProps) {
  const isFiltered = format !== 'all' || fileType !== 'all';

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Dropdown
          value={format}
          options={FORMAT_OPTIONS}
          onChange={onFormatChange}
          icon={<FunnelIcon className="h-3.5 w-3.5" />}
        />
        <Dropdown
          value={fileType}
          options={FILETYPE_OPTIONS}
          onChange={onFileTypeChange}
        />
        {isFiltered && (
          <span className="text-[12px] text-gray-400">
            {filteredCount} of {totalCount}
          </span>
        )}
      </div>

      <Dropdown
        value={sort}
        options={SORT_OPTIONS}
        onChange={onSortChange}
      />
    </div>
  );
}
