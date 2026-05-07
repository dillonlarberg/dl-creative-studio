import { useRef, useState, useEffect } from 'react';
import { ArrowDownTrayIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
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

export default function DownloadDropdown({ count, onDownload, size = 'md', openUp = false }: DownloadDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          'flex items-center gap-1.5 rounded-lg bg-blue-600 font-medium text-white hover:bg-blue-700 active:bg-blue-800',
          size === 'sm' ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-2 text-[13px]'
        )}
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
        {count !== undefined ? `Download All (${count})` : 'Download'}
        <ChevronDownIcon className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn('absolute right-0 z-30 w-[220px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg', openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Choose format</p>
          </div>
          {FORMATS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => { onDownload(f.value); setOpen(false); }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
            >
              <span className="w-10 shrink-0 text-[13px] font-semibold text-gray-900">{f.label}</span>
              <span className="text-[12px] text-gray-400">{f.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
