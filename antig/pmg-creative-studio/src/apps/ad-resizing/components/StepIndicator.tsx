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

export default function StepIndicator({ activeStep, resultsDone, browseDone, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const isDone =
          (step.id === 'browse' && browseDone) ||
          (step.id === 'results' && resultsDone);
        const isActive = step.id === activeStep;
        const isLast = i === STEPS.length - 1;
        const isClickable = isDone && !!onStepClick;

        const circle = (
          <div className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
            isDone ? 'bg-green-500 text-white' : isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400',
          )}>
            {isDone ? '✓' : i + 1}
          </div>
        );

        const label = (
          <span className={cn(
            'text-[12px] font-medium transition-colors',
            isDone ? 'text-green-600' : isActive ? 'text-blue-600' : 'text-gray-400',
            isClickable && 'group-hover:underline group-hover:underline-offset-2',
          )}>
            {step.label}
          </span>
        );

        return (
          <div key={step.id} className="flex items-center">
            {isClickable ? (
              <button
                type="button"
                onClick={() => onStepClick!(step.id)}
                title={`Go back to ${step.label}`}
                className="group flex items-center gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
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
            {!isLast && (
              <div className={cn(
                'mx-3 h-px w-10 transition-colors',
                isDone ? 'bg-green-300' : 'bg-gray-200',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
