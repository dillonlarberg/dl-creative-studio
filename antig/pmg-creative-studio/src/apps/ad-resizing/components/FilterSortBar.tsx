import { FunnelIcon } from '@heroicons/react/24/outline';
import { Button, Dropdown, MenuItem } from '@agencypmg/alli-design-system';

export type FormatFilter = 'all' | 'landscape' | 'square' | 'portrait';
export type FileTypeFilter = 'all' | 'PNG' | 'JPG' | 'WEBP';
export type SortOption = 'az' | 'za';

interface FilterSortBarProps {
  format: FormatFilter;
  fileType: FileTypeFilter;
  sort: SortOption;
  onFormatChange: (v: FormatFilter) => void;
  onFileTypeChange: (v: FileTypeFilter) => void;
  onSortChange: (v: SortOption) => void;
  onClearFilters: () => void;
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
  { value: 'WEBP', label: 'WebP' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'az', label: 'Name A–Z' },
  { value: 'za', label: 'Name Z–A' },
];

function FilterDropdown<T extends string>({
  value,
  options,
  onChange,
  icon,
  defaultValue,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  icon?: React.ReactNode;
  defaultValue: T;
}) {
  const currentLabel = options.find(o => o.value === value)?.label ?? '';
  const isActive = value !== defaultValue;

  return (
    <Dropdown
      trigger={
        icon ? (
          <span className="flex items-center gap-1.5">
            {icon}
            {currentLabel}
          </span>
        ) : currentLabel
      }
      triggerAsProps={isActive ? { variant: 'primary' } : { variant: 'secondary' }}
    >
      {options.map(opt => (
        <MenuItem
          key={opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </MenuItem>
      ))}
    </Dropdown>
  );
}

export default function FilterSortBar({
  format,
  fileType,
  sort,
  onFormatChange,
  onFileTypeChange,
  onSortChange,
  onClearFilters,
  totalCount,
  filteredCount,
}: FilterSortBarProps) {
  const isFiltered = format !== 'all' || fileType !== 'all';

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <FilterDropdown
          value={format}
          options={FORMAT_OPTIONS}
          onChange={onFormatChange}
          icon={<FunnelIcon className="h-3.5 w-3.5" />}
          defaultValue="all"
        />
        <FilterDropdown
          value={fileType}
          options={FILETYPE_OPTIONS}
          onChange={onFileTypeChange}
          defaultValue="all"
        />
        {isFiltered && (
          <>
            <span className="text-[12px] text-gray-400">
              {filteredCount === 0 ? 'No matches' : `${filteredCount} of ${totalCount}`}
            </span>
            <Button variant="text" onClick={onClearFilters}>
              Clear
            </Button>
          </>
        )}
      </div>

      <FilterDropdown
        value={sort}
        options={SORT_OPTIONS}
        onChange={onSortChange}
        defaultValue="az"
      />
    </div>
  );
}
