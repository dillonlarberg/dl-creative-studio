import { CheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Button, ConfirmPopover } from '@agencypmg/alli-design-system';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../utils/cn';
import type { ValidationRequirement } from '../../types';

interface TemplateBuilderFooterProps {
  currentStepIndex: number;
  isLoading: boolean;
  isLastStep: boolean;
  isNextDisabled: boolean;
  requirements: ValidationRequirement[] | null;
  clientSlug: string;
  nextStepName: string | undefined;
  onNext: () => void;
  onBack: () => void;
  onDiscard: () => void;
}

export default function TemplateBuilderFooter({
  currentStepIndex,
  isLoading,
  isLastStep,
  isNextDisabled,
  requirements,
  clientSlug,
  nextStepName,
  onNext,
  onBack,
  onDiscard,
}: TemplateBuilderFooterProps) {
  const navigateRouter = useNavigate();

  return (
    <div className="mt-12 pt-8 border-t border-gray-100 space-y-4">
      {/* Requirements checklist — exact replica of WizardShell lines 453-480 */}
      {requirements ? (
        <div
          className="flex items-center justify-end gap-6"
          data-testid="wizard-requirements"
        >
          {requirements.map(({ label, met }) => (
            <div
              key={label}
              className={cn(
                'flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-colors',
                met ? 'text-green-600' : 'text-gray-300'
              )}
              data-testid={`wizard-requirement-${label}`}
              data-met={met ? 'true' : 'false'}
            >
              <div
                className={cn(
                  'h-4 w-4 rounded-full flex items-center justify-center border transition-all',
                  met ? 'bg-green-500 border-green-500' : 'border-gray-200 bg-white'
                )}
              >
                {met && <CheckIcon className="h-2.5 w-2.5 text-white" />}
              </div>
              {label}
            </div>
          ))}
        </div>
      ) : null}

      {/* Button row — exact replica of WizardShell lines 482-541 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={currentStepIndex === 0 || isLoading}
          className={cn(
            'rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all',
            currentStepIndex === 0 || isLoading
              ? 'cursor-not-allowed text-gray-200'
              : 'text-blue-gray-400 border border-gray-100 hover:bg-gray-50'
          )}
        >
          ← Previous Step
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigateRouter(`/adlabs/${clientSlug}`)}
            data-testid="wizard-save-exit"
            className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50"
          >
            Save &amp; Exit
          </button>

          <ConfirmPopover
            content="Discard this template? All unsaved work will be lost and cannot be recovered."
            action={
              <Button variant="caution" onClick={() => void onDiscard()}>
                Discard
              </Button>
            }
          >
            <button
              type="button"
              data-testid="wizard-discard"
              className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-red-500"
            >
              Discard
            </button>
          </ConfirmPopover>

          {/* Not rendered on last step — exact replica of WizardShell line 522 */}
          {!isLastStep && (
            <button
              type="button"
              onClick={() => void onNext()}
              disabled={isNextDisabled}
              className={cn(
                'rounded-xl bg-blue-600 px-8 py-3 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center gap-2',
                isNextDisabled
                  ? 'opacity-20 cursor-not-allowed grayscale bg-gray-400 shadow-none'
                  : 'hover:bg-blue-700 hover:shadow-blue-200'
              )}
            >
              {isLoading && <ArrowPathIcon className="h-3 w-3 animate-spin" />}
              {isLoading
                ? 'Loading...'
                : `Next: ${nextStepName ?? 'Continue'} →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
