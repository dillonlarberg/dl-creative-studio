import { CheckIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import type { TemplateBuilderStep } from '../types';
import type { TemplateBuilderStepData } from '../types';

interface TemplateBuilderStepperProps {
  steps: TemplateBuilderStep<TemplateBuilderStepData>[];
  currentStepIndex: number;
  isLoading: boolean;
  onStepClick: (index: number) => void;
}

export default function TemplateBuilderStepper({
  steps,
  currentStepIndex,
  isLoading,
  onStepClick,
}: TemplateBuilderStepperProps) {
  return (
    <nav aria-label="wizard-progress" data-testid="wizard-breadcrumb">
      <ol className="flex w-full items-center">
        {steps.map((step, index) => {
          const status =
            index < currentStepIndex
              ? 'complete'
              : index === currentStepIndex
              ? 'current'
              : 'upcoming';

          return (
            <li
              key={step.id}
              className="relative flex w-full flex-1 flex-col items-center text-center"
              data-testid={`breadcrumb-${step.id}`}
              data-active={index === currentStepIndex ? 'true' : 'false'}
            >
              {/* Connector line */}
              <div className="absolute inset-x-0 top-4 flex h-[2px] items-center">
                <div
                  className={cn(
                    'h-full w-1/2 transition-all duration-500',
                    index === 0
                      ? 'bg-transparent'
                      : index <= currentStepIndex
                      ? 'bg-blue-600'
                      : 'bg-gray-300'
                  )}
                />
                <div
                  className={cn(
                    'h-full w-1/2 transition-all duration-500',
                    index === steps.length - 1
                      ? 'bg-transparent'
                      : index < currentStepIndex
                      ? 'bg-blue-600'
                      : 'bg-gray-300'
                  )}
                />
              </div>

              {/* Step circle */}
              <button
                type="button"
                onClick={() => !isLoading && onStepClick(index)}
                title={status === 'upcoming' ? 'Complete the current step to continue' : undefined}
                aria-disabled={status === 'upcoming' ? 'true' : undefined}
                className={cn(
                  'relative z-10 flex h-8 w-8 items-center justify-center rounded-full',
                  status === 'complete' && 'bg-blue-600 hover:bg-blue-700',
                  status === 'current' && 'border-2 border-blue-600 bg-white',
                  status === 'upcoming' && 'cursor-not-allowed border-2 border-gray-300 bg-white'
                )}
                aria-current={status === 'current' ? 'step' : undefined}
              >
                {status === 'complete' && (
                  <CheckIcon className="h-5 w-5 text-white" />
                )}
                {status === 'current' && (
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                )}
                {status === 'upcoming' && (
                  <span className="h-2.5 w-2.5 rounded-full bg-transparent" />
                )}
              </button>

              {/* Step name */}
              <span
                className={cn(
                  'mt-2 whitespace-nowrap text-xs font-medium',
                  status === 'current' ? 'text-blue-600' : 'text-blue-gray-500'
                )}
              >
                {step.name}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
