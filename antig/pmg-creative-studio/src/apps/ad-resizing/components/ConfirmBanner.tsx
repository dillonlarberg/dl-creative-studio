import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';

interface ConfirmBannerProps {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmBanner({ message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmBannerProps) {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" />
      <p className="flex-1 text-[13px] text-amber-800">{message}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-amber-200 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
