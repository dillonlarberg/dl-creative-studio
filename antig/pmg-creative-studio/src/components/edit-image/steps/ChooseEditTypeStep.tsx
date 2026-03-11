import { cn } from '../../../utils/cn';
import type { EditImageStepProps, EditType } from '../types';

const EDIT_TYPES: { id: EditType; title: string; description: string; enabled: boolean }[] = [
  {
    id: 'background',
    title: 'Change Background',
    description: 'Replace the background with a solid color or image from the catalog.',
    enabled: true,
  },
  {
    id: 'text',
    title: 'Change Text',
    description: 'Detect and replace text in the image using brand fonts.',
    enabled: false,
  },
  {
    id: 'colors',
    title: 'Change Colors',
    description: 'Swap dominant colors with your brand palette.',
    enabled: false,
  },
];

export function ChooseEditTypeStep({ stepData, onStepDataChange }: EditImageStepProps) {
  const selectedType = EDIT_TYPES.find((t) => t.id === stepData.editType);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Preview video placeholder */}
      <div className="overflow-hidden rounded-2xl border-2 border-gray-100 bg-gray-900">
        <div className="flex flex-col items-center justify-center py-16 px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 mb-3">
            <svg className="h-5 w-5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">
            {selectedType ? `${selectedType.title} Preview` : 'Tool Preview'}
          </p>
          <p className="mt-1 text-[9px] text-white/20">Video placeholder</p>
        </div>
      </div>

      <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] text-center">
        What would you like to change?
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {EDIT_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => type.enabled && onStepDataChange({ editType: type.id })}
            disabled={!type.enabled}
            className={cn(
              'relative flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all',
              type.enabled
                ? stepData.editType === type.id
                  ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-200'
                  : 'border-gray-100 hover:border-blue-300 hover:bg-gray-50/50 cursor-pointer'
                : 'border-gray-100 bg-gray-50/30 opacity-60 cursor-not-allowed',
            )}
          >
            {!type.enabled && (
              <span className="absolute top-2 right-2 rounded-full bg-gray-200 px-2 py-0.5 text-[8px] font-black text-gray-500 uppercase tracking-widest">
                Soon
              </span>
            )}
            <p className="text-sm font-black text-gray-900 uppercase tracking-wider">
              {type.title}
            </p>
            <p className="text-[10px] text-gray-500 leading-relaxed">{type.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
