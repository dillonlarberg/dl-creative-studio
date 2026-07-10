import { SparklesIcon } from '@heroicons/react/24/outline';
import type { TemplateBuilderStepData } from '../types';
import { useTemplateBuilder } from '../TemplateBuilderContext';
import { useAssetHouse } from '../../../platform/assetHouse/AssetHouseContext';
import { generateLayouts, bestSampleRow } from '../../../services/ai/templateAI';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import { SkeletonCard } from './SkeletonCard';
import { CandidateCard } from './CandidateCard';

export interface CandidateSelectorProps {
  stepData: TemplateBuilderStepData;
  mergeStepData: (partial: Partial<TemplateBuilderStepData>) => void;
  isLoadingCandidates: boolean;
  setIsLoadingCandidates: (v: boolean) => void;
  layoutError: string | null;
  setLayoutError: (v: string | null) => void;
  selectedCandidateIndex: number;
  userHasEditedStyles: boolean;
}

export function CandidateSelector({
  stepData,
  mergeStepData,
  isLoadingCandidates,
  setIsLoadingCandidates,
  layoutError,
  setLayoutError,
  selectedCandidateIndex,
  userHasEditedStyles,
}: CandidateSelectorProps) {
  const tbCtx = useTemplateBuilder();
  const { assetHouse } = useAssetHouse();
  const { candidates, requirements, feedColumns, setCandidates, feedSampleData } = tbCtx;

  const isSocial = stepData.channel === 'Social';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SparklesIcon className="h-3.5 w-3.5 text-blue-600" />
        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
          Layout Candidate
        </h4>
      </div>

      {layoutError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {layoutError}
        </div>
      )}

      {isLoadingCandidates ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : candidates.length === 0 && !isSocial ? (
        <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
            Generating layout options…
          </p>
        </div>
      ) : candidates.length === 0 && isSocial ? null : (
        <div className="space-y-3">
          {candidates.map((c, idx) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              selected={idx === selectedCandidateIndex}
              onClick={() => {
                const wf = c.wireframeId
                  ? SOCIAL_WIREFRAMES.find((w) => w.id === c.wireframeId)
                  : null;
                mergeStepData({
                  selectedCandidateIndex: idx,
                  ...(wf ? { selectedWireframeId: wf.id, wireframeFile: wf.file } : {}),
                });
                // auto-apply AI zone style suggestions if user hasn't manually edited styles
                if (
                  !userHasEditedStyles &&
                  c.suggestedZoneStyles &&
                  Object.keys(c.suggestedZoneStyles).length > 0
                ) {
                  mergeStepData({ zoneStyles: c.suggestedZoneStyles });
                }
              }}
            />
          ))}
          {/* Regenerate button */}
          <button
            type="button"
            disabled={isLoadingCandidates}
            onClick={async () => {
              setIsLoadingCandidates(true);
              setLayoutError(null);
              try {
                const generated = await generateLayouts({
                  requirements,
                  channel: stepData.channel ?? 'Social',
                  brand: assetHouse,
                  feedColumns,
                  brief: stepData.brief,
                  feedSampleRow: bestSampleRow(
                    (feedSampleData ?? []).map((row) =>
                      Object.fromEntries(
                        Object.entries(row as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])
                      )
                    )
                  ),
                });
                setCandidates(generated);
              } catch (err) {
                console.error('[CandidateSelector] regenerate failed:', err);
                setLayoutError('Failed to regenerate layouts. Please try again.');
              } finally {
                setIsLoadingCandidates(false);
              }
            }}
            className="w-full py-2 border border-gray-200 rounded-xl text-[9px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
