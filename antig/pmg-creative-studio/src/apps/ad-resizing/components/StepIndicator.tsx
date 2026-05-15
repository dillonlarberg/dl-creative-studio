import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';

export type StepId = 'browse' | 'results' | 'download';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'results', label: 'Generate' },
  { id: 'download', label: 'Download' },
];

interface StepIndicatorProps {
  activeStep: StepId;
  resultsDone: boolean;
  browseDone: boolean;
  onStepClick?: (step: StepId) => void;
}

function getStatus(
  id: StepId,
  activeStep: StepId,
  browseDone: boolean,
  resultsDone: boolean,
): 'complete' | 'current' | 'upcoming' {
  if (id === 'browse') return browseDone ? 'complete' : activeStep === 'browse' ? 'current' : 'upcoming';
  if (id === 'results') return resultsDone ? 'complete' : activeStep === 'results' ? 'current' : 'upcoming';
  return activeStep === 'download' ? 'current' : 'upcoming';
}

export default function StepIndicator({
  activeStep,
  resultsDone,
  browseDone,
  onStepClick,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const status = getStatus(step.id, activeStep, browseDone, resultsDone);
        const clickable = status === 'complete' && !!onStepClick;

        const circle = (
          <div
            className={cn(
              'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
              status === 'upcoming'
                ? 'border border-gray-300 bg-white'
                : 'bg-blue-600',
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
        );

        const label = (
          <span
            className={cn(
              'text-[12px] font-medium leading-none',
              status === 'upcoming'
                ? 'text-gray-400'
                : status === 'current'
                  ? 'text-gray-900'
                  : 'text-gray-600',
              clickable && 'group-hover:text-blue-600',
            )}
          >
            {step.label}
          </span>
        );

        return (
          <div key={step.id} className="flex items-center">
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick(step.id)}
                title={`Back to ${step.label}`}
                className="group flex items-center gap-1.5"
              >
                {circle}
                {label}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {circle}
                {label}
              </div>
            )}
            {i < STEPS.length - 1 && (
              <div className="mx-3 h-px w-6 bg-gray-200" />
            )}
          </div>
        );
      })}
    </div>
  );
}
