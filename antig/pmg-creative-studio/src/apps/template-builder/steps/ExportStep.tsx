import { useState } from 'react';
import { CloudArrowUpIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData } from '../types';
import { handleExecuteBatch } from '../_internal/handlers';

/**
 * Export step — Batch & Export. JSX lifted from
 * UseCaseWizardPage.tsx lines 4141-4194.
 */

function ExportStepBody({
  stepData,
  client,
}: StepRenderProps<TemplateBuilderStepData>) {
  const [isProcessing, setIsProcessing] = useState(false);

  const candidates = (stepData.candidates ?? []) as Array<{ name?: string }>;
  const selectedCandidate =
    candidates[stepData.selectedCandidateIndex ?? 0] ?? null;

  const onExecute = async () => {
    setIsProcessing(true);
    try {
      const batchId = await handleExecuteBatch({
        clientSlug: client.slug,
        selectedFeed: stepData.selectedFeed ?? null,
        feedSampleData: stepData.feedSampleData ?? [],
        feedMappings: stepData.feedMappings ?? {},
        ratio: stepData.ratios?.[0] ?? '1:1',
      });
      alert(
        `Batch Deployment Orchestrated Successfully!\n\nUsage tracked under Batch ID: ${batchId}`
      );
    } catch (err) {
      console.error('Batch failed:', err);
      alert('Failed to execute batch deployment.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
          Batch Orchestration
        </label>
        <h3 className="text-xl font-bold text-gray-900 italic">
          Configure Final Output
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Summary */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border-2 border-gray-100 p-8 space-y-8 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                <CloudArrowUpIcon className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                  Target Feed
                </p>
                <p className="text-lg font-black text-gray-900 italic leading-none">
                  {stepData.selectedFeed?.name || 'No feed selected'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-4 border-b border-gray-50 text-[11px]">
                <span className="font-bold text-gray-400 uppercase tracking-widest">
                  Total Assets
                </span>
                <span className="font-black text-gray-900">
                  {stepData.feedSampleData?.length || 45} Variations
                </span>
              </div>
              <div className="flex items-center justify-between py-4 border-b border-gray-50 text-[11px]">
                <span className="font-bold text-gray-400 uppercase tracking-widest">
                  Aspect Ratio
                </span>
                <span className="font-black text-gray-900">
                  {stepData.ratios?.[0] || '1:1'}
                </span>
              </div>
              <div className="flex items-center justify-between py-4 border-b border-gray-50 text-[11px]">
                <span className="font-bold text-gray-400 uppercase tracking-widest">
                  Design Scaffold
                </span>
                <span className="font-black text-gray-900">
                  {selectedCandidate?.name ?? '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Execute */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border-2 border-gray-100 p-8 shadow-sm space-y-8">
            <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
              Execute Generation
            </h4>
            <button
              disabled={isProcessing}
              className="w-full py-5 bg-black rounded-2xl text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-gray-900 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={() => void onExecute()}
            >
              <SparklesIcon className="h-5 w-5" />
              {isProcessing ? 'Deploying...' : 'Execute Batch Deployment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const exportStep: WizardStep<TemplateBuilderStepData> = {
  id: 'export',
  name: 'Batch & Export',

  validate: () => ({ ok: true }),

  render: (props) => <ExportStepBody {...props} />,
};
