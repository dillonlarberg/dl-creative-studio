import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { ButtonDropdown, MenuItem } from '@agencypmg/alli-design-system';
import type { DownloadFormat } from '../utils/downloadImage';

const FORMATS: { value: DownloadFormat; label: string; description: string }[] = [
  { value: 'png', label: 'PNG', description: 'Lossless · transparent support' },
  { value: 'jpg', label: 'JPG', description: 'Smaller file · best for photos' },
  { value: 'webp', label: 'WebP', description: 'Best compression · web-optimized' },
];

interface DownloadDropdownProps {
  count?: number;
  onDownload: (format: DownloadFormat) => void;
  size?: 'sm' | 'md';
  openUp?: boolean;
}

export default function DownloadDropdown({ count, onDownload, openUp = false }: DownloadDropdownProps) {
  const label = count !== undefined ? `Download All (${count})` : 'Download';

  return (
    <ButtonDropdown
      text={label}
      icon={<ArrowDownTrayIcon className="alli-h-4 alli-w-4" />}
      onClick={() => onDownload('png')}
      placement={openUp ? 'top-end' : 'bottom-end'}
    >
      {FORMATS.map(f => (
        <MenuItem key={f.value} as="button" fullWidth onClick={() => onDownload(f.value)}>
          <span className="flex items-center gap-3">
            <span className="w-10 text-[13px] font-semibold">{f.label}</span>
            <span className="text-[12px] text-gray-400">{f.description}</span>
          </span>
        </MenuItem>
      ))}
    </ButtonDropdown>
  );
}
