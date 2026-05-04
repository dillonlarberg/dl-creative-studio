import { useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CircleStackIcon,
  PhotoIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { RequirementField, TemplateBuilderStepData } from '../types';
import { cn } from '../../../utils/cn';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import { analyzeCreativeIntent } from '../_internal/handlers';

/**
 * Intent step — Synthesize Design Requirements. JSX lifted from
 * UseCaseWizardPage.tsx lines 2539-2693.
 */

function IntentStepBody({
  stepData,
  mergeStepData,
}: StepRenderProps<TemplateBuilderStepData>) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const requirements = stepData.requirements ?? [];
  const selectedWireframe = stepData.selectedWireframe
    ? SOCIAL_WIREFRAMES.find((w) => w.id === stepData.selectedWireframe)
    : null;

  const runAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const { requirements: synth, autoApprove } = await analyzeCreativeIntent({
        selectedWireframe: stepData.selectedWireframe,
        prompt: stepData.prompt,
      });
      mergeStepData({
        requirements: synth,
        areRequirementsApproved: autoApprove,
      });
    } catch (err) {
      console.error('Intent analysis failed:', err);
      alert('AI failed to synthesize requirements. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeRequirement = (id: string) => {
    mergeStepData({ requirements: requirements.filter((r) => r.id !== id) });
  };

  const addCustomRequirement = () => {
    const label = window.prompt(
      "Enter the name of the dynamic field (e.g. 'Promo Code', 'Disclaimer'):"
    );
    if (!label) return;
    const newReq: RequirementField = {
      id: `custom_${Date.now()}`,
      label,
      category: 'Dynamic',
      source: 'Feed',
      type: 'text',
    };
    mergeStepData({ requirements: [...requirements, newReq] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">
            Step 2 of 7
          </label>
          <h3 className="text-lg font-bold text-gray-900 italic">
            {selectedWireframe
              ? `Configure Wireframe: ${selectedWireframe.name}`
              : 'Synthesize Design Requirements'}
          </h3>
        </div>
        <div className="flex gap-2">
          {requirements.length > 0 && (
            <div className="px-3 py-1 bg-green-50 rounded-full border border-green-100 flex items-center gap-2">
              <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">
                Live Optimization Active
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Prompt input */}
        <div className="bg-white rounded-3xl border-2 border-gray-100 p-6 space-y-4 shadow-sm h-full flex flex-col">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none">
                Creative Intent & Guidelines
              </label>
              {stepData.selectedWireframe && (
                <span className="text-[8px] font-black text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 uppercase tracking-widest animate-pulse">
                  Wireframe Lock Active
                </span>
              )}
            </div>
            <textarea
              placeholder={
                stepData.selectedWireframe
                  ? 'Guidelines pre-loaded from wireframe. Add custom overrides if needed...'
                  : "Describe the aesthetic and functional requirements... e.g. 'A minimalist layout for Facebook highlighting the product price and a clear Shop Now CTA.'"
              }
              className="w-full flex-1 min-h-[140px] px-6 py-4 rounded-2xl border-2 border-gray-50 focus:border-blue-600 focus:ring-8 focus:ring-blue-50 outline-none transition-all font-medium text-gray-900 text-sm shadow-inner bg-gray-50/20 resize-none"
              value={stepData.prompt || ''}
              onChange={(e) => mergeStepData({ prompt: e.target.value })}
            />
          </div>

          <button
            onClick={() => void runAnalyze()}
            disabled={!stepData.prompt || isAnalyzing}
            className={cn(
              'w-full py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3',
              isAnalyzing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-100 active:scale-95'
            )}
          >
            {isAnalyzing ? (
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
            ) : (
              <SparklesIcon className="h-5 w-5" />
            )}
            {isAnalyzing
              ? 'Synthesizing Requirements...'
              : 'Synthesize Field Requirements'}
          </button>
        </div>

        {/* Requirements list */}
        <div className="h-full">
          <div className="bg-white rounded-3xl p-6 border-2 border-dashed border-gray-200 flex flex-col h-[400px] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                  Requirement Synthesis
                </h4>
              </div>
              {requirements.length > 0 && (
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-md">
                  {requirements.length} FIELDS IDENTIFIED
                </span>
              )}
            </div>

            {requirements.length > 0 ? (
              <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-1">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th className="py-2 text-[8px] font-black text-gray-400 uppercase tracking-widest px-2">
                        Source
                      </th>
                      <th className="py-2 text-[8px] font-black text-gray-400 uppercase tracking-widest">
                        Requirement Label
                      </th>
                      <th className="py-2 text-[8px] font-black text-gray-400 uppercase tracking-widest text-right px-2">
                        Type
                      </th>
                      <th className="py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-gray-200">
                    {requirements.map((req) => (
                      <tr
                        key={req.id}
                        className="group hover:bg-blue-50/30 transition-colors"
                      >
                        <td className="py-3 px-2">
                          <div
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter',
                              req.source === 'Creative House'
                                ? 'bg-purple-50 text-purple-600 border border-purple-100'
                                : 'bg-blue-50 text-blue-600 border border-blue-100'
                            )}
                          >
                            {req.source === 'Creative House' ? (
                              <PhotoIcon className="h-2.5 w-2.5" />
                            ) : (
                              <CircleStackIcon className="h-2.5 w-2.5" />
                            )}
                            {req.source === 'Creative House' ? 'House' : 'Feed'}
                          </div>
                        </td>
                        <td className="py-3">
                          <p className="text-[11px] font-bold text-gray-900 leading-none">
                            {req.label}
                          </p>
                        </td>
                        <td className="py-3 text-right px-2">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                            {req.type}
                          </span>
                        </td>
                        <td className="py-3 text-right pr-2">
                          <button
                            onClick={() => removeRequirement(req.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-500 text-gray-300"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  onClick={addCustomRequirement}
                  className="w-full py-2 hover:bg-gray-50 rounded-xl border-2 border-dashed border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-widest transition-all mt-4 flex items-center justify-center gap-2"
                >
                  <span className="text-sm">+</span> Add Custom Field
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-start justify-center text-left px-2">
                <div className="h-16 w-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-6">
                  <SparklesIcon className="h-8 w-8 text-gray-200" />
                </div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                  Enter your creative intent and click
                  <br />
                  "Synthesize" to identify dynamic fields.
                </p>
              </div>
            )}

            {requirements.length > 0 && (
              <div className="pt-8 border-t border-gray-100 mt-8 flex flex-col items-start gap-5">
                <div className="text-left">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-relaxed">
                    System identified{' '}
                    {requirements.filter((r) => r.category === 'Dynamic').length}{' '}
                    dynamic,{' '}
                    {requirements.filter((r) => r.category === 'Brand').length}{' '}
                    brand assets.
                  </p>
                  <p className="text-[8px] font-medium text-gray-400 uppercase tracking-widest mt-0.5 italic">
                    Human approval required to lock structure
                  </p>
                </div>
                <button
                  onClick={() =>
                    mergeStepData({
                      areRequirementsApproved: !stepData.areRequirementsApproved,
                    })
                  }
                  className={cn(
                    'w-fit px-8 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 outline-none',
                    stepData.areRequirementsApproved
                      ? 'bg-green-50 text-green-600 border border-green-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100'
                  )}
                >
                  {stepData.areRequirementsApproved ? (
                    <>
                      <CheckCircleIcon className="h-4 w-4" /> Approved
                    </>
                  ) : (
                    'Approve & Continue'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const intentStep: WizardStep<TemplateBuilderStepData> = {
  id: 'intent',
  name: 'Define Intent',

  validate: (data) => {
    if (!data.prompt?.trim())
      return { ok: false, reason: 'Creative prompt required' };
    if (!data.requirements || data.requirements.length === 0) {
      return { ok: false, reason: 'Synthesize requirements before continuing' };
    }
    if (!data.areRequirementsApproved) {
      return { ok: false, reason: 'Requirements must be approved' };
    }
    return { ok: true };
  },

  // Auto-trigger requirement synthesis when entering with a wireframe
  // already selected and no requirements yet (monolith line 1013).
  onEnter: async ({ stepData, mergeStepData }) => {
    const hasWireframe = !!stepData.selectedWireframe;
    const empty = !stepData.requirements || stepData.requirements.length === 0;
    if (hasWireframe && empty) {
      const { requirements, autoApprove } = await analyzeCreativeIntent({
        selectedWireframe: stepData.selectedWireframe,
        prompt: stepData.prompt,
      });
      mergeStepData({ requirements, areRequirementsApproved: autoApprove });
    }
  },

  render: (props) => <IntentStepBody {...props} />,
};
