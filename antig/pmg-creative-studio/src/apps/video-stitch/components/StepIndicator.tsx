/**
 * StepIndicator — 5-stage progress for the stitch wizard (mirrors video-cutdown's).
 * source → arrange → music → run ("Stitch") → reel.
 */
import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { Stage } from '../types';

const STEPS: { id: Stage; label: string }[] = [
  { id: 'source', label: 'Source' },
  { id: 'arrange', label: 'Arrange' },
  { id: 'music', label: 'Music' },
  { id: 'run', label: 'Stitch' },
  { id: 'reel', label: 'Reel' },
];

interface StepIndicatorProps {
  current: Stage;
}

export default function StepIndicator({ current }: StepIndicatorProps) {
  const activeIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <div className="flex items-center overflow-x-auto pb-1">
      {STEPS.map((step, i) => {
        const status: 'complete' | 'current' | 'upcoming' =
          i < activeIndex ? 'complete' : i === activeIndex ? 'current' : 'upcoming';
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  status === 'complete' && 'bg-blue-600 text-white',
                  status === 'current' && 'bg-blue-600 text-white',
                  status === 'upcoming' && 'border border-gray-300 bg-white text-gray-400',
                )}
              >
                {status === 'complete' ? <CheckIcon className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  'whitespace-nowrap text-[13px]',
                  status === 'current' && 'font-semibold text-gray-900',
                  status === 'complete' && 'font-medium text-gray-600',
                  status === 'upcoming' && 'font-medium text-gray-400',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={cn('mx-2 h-px w-6 shrink-0', i < activeIndex ? 'bg-blue-600' : 'bg-gray-200')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
