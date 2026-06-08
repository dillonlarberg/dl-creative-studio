import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { Stage } from '../types';

/** Display steps for the cutdown wizard. The `run` stage maps onto "Versions". */
type StepId = 'source' | 'music' | 'brief' | 'versions' | 'render';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'source', label: 'Source' },
  { id: 'music', label: 'Music' },
  { id: 'brief', label: 'Brief' },
  { id: 'versions', label: 'Versions' },
  { id: 'render', label: 'Render' },
];

/** Map the AppRoot Stage onto the display StepId (run → versions). */
function stageToStep(stage: Stage): StepId {
  return stage === 'run' ? 'versions' : stage;
}

interface StepIndicatorProps {
  current: Stage;
}

export default function StepIndicator({ current }: StepIndicatorProps) {
  const activeStep = stageToStep(current);
  const activeIndex = STEPS.findIndex((s) => s.id === activeStep);

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const status: 'complete' | 'current' | 'upcoming' =
          i < activeIndex ? 'complete' : i === activeIndex ? 'current' : 'upcoming';

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
                  status === 'upcoming' ? 'border border-gray-300 bg-white' : 'bg-blue-600',
                )}
              >
                {status === 'complete' ? (
                  <CheckIcon className="h-2.5 w-2.5 text-white" />
                ) : (
                  <span
                    className={cn(
                      'text-[10px] font-bold leading-none',
                      status === 'upcoming' ? 'text-gray-400' : 'text-white',
                    )}
                  >
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'text-[12px] font-medium leading-none',
                  status === 'upcoming'
                    ? 'text-gray-400'
                    : status === 'current'
                      ? 'text-gray-900'
                      : 'text-gray-600',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="mx-3 h-px w-6 bg-gray-200" />}
          </div>
        );
      })}
    </div>
  );
}
