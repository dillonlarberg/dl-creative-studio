import { cn } from '../../../utils/cn';

export type StepId = 'browse' | 'results' | 'download';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'results', label: 'Generate' },
  { id: 'download', label: 'Download' },
];

interface StepIndicatorProps {
  /** Current logical step — 'browse' / 'results' / 'download'. */
  activeStep: StepId;
  /** Once all outputs in the active job complete, the Generate step shows as done. */
  resultsDone: boolean;
  /** True once the user has progressed past Browse (i.e. has at least one job). */
  browseDone: boolean;
}

export default function StepIndicator({ activeStep, resultsDone, browseDone }: StepIndicatorProps) {
  return (
    <div className="mb-6 flex items-center gap-0">
      {STEPS.map((step, i) => {
        const isDone =
          (step.id === 'browse' && browseDone) ||
          (step.id === 'results' && resultsDone);
        const isActive = step.id === activeStep;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                isDone ? 'bg-green-500 text-white' : isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
              )}>
                {isDone ? '✓' : i + 1}
              </div>
              <span className={cn(
                'text-[12px] font-medium transition-colors',
                isDone ? 'text-green-600' : isActive ? 'text-blue-600' : 'text-gray-400'
              )}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className={cn(
                'mx-3 h-px w-10 transition-colors',
                isDone ? 'bg-green-300' : 'bg-gray-200'
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
