import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData } from '../types';
import { useTemplateBuilder } from '../TemplateBuilderContext';
import { useAssetHouse } from '../../../platform/assetHouse/AssetHouseContext';
import { FilledTemplatePreview } from '../_internal/FilledTemplatePreview';
import { CandidatePreview } from '../_internal/CandidatePreview';
import { templateLibraryService } from '../../../services/templateLibrary';
import type { NewTemplateData, FieldMapping } from '../../../services/templateLibrary.types';
import type { ClientSlug } from '../../../platform/firebase/paths';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import { auth } from '../../../firebase';
import { applyClientTransforms } from '../_internal/transformExecutor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RATIO_TO_PX: Record<string, { width: number; height: number }> = {
  '1:1':  { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '4:5':  { width: 1080, height: 1350 },
  '5:4':  { width: 1350, height: 1080 },
  '4:3':  { width: 1024, height: 768  },
  '3:4':  { width: 768,  height: 1024 },
  '2:3':  { width: 800,  height: 1200 },
  '3:2':  { width: 1200, height: 800  },
};

/** Parse ratio string "1:1" / "9:16" into real pixel dimensions, or pass "300x250" through as-is. */
function parseRatio(ratio: string): { width: number; height: number; label: string } {
  if (ratio.includes('x')) {
    const [w, h] = ratio.split('x').map(Number);
    return { width: w ?? 300, height: h ?? 250, label: ratio };
  }
  const px = RATIO_TO_PX[ratio];
  if (px) return { ...px, label: ratio };
  return { width: 1080, height: 1080, label: ratio };
}

/** Convert feedMappings + uploadValues + staticValues into the FieldMapping discriminated union. */
function buildFieldMappings(
  feedMappings: Record<string, string>,
  uploadValues: Record<string, string>,
  slotMappings?: Record<string, string>,
  staticValues?: Record<string, string>,
  fieldSourceMode?: Record<string, 'feed' | 'static' | 'ai'>
): Record<string, FieldMapping> {
  const result: Record<string, FieldMapping> = {};
  for (const [fieldId, column] of Object.entries(feedMappings)) {
    // Skip fields that have been switched to static or ai mode
    const mode = fieldSourceMode?.[fieldId] ?? 'feed';
    if (mode !== 'feed') continue;
    result[fieldId] = {
      source: 'feed',
      column,
      ...(slotMappings?.[fieldId] ? { slotId: slotMappings[fieldId] } : {}),
    };
  }
  for (const [fieldId, assetPath] of Object.entries(uploadValues)) {
    result[fieldId] = { source: 'upload', assetPath };
  }
  // Static-mode fields
  for (const [fieldId, value] of Object.entries(staticValues ?? {})) {
    const mode = fieldSourceMode?.[fieldId] ?? 'feed';
    if (mode === 'static' && value) {
      result[fieldId] = {
        source: 'static',
        value,
      } as FieldMapping;
    }
  }
  return result;
}

/**
 * Build injections for FilledTemplatePreview.
 * Scans all sample rows for the first non-empty value per column (row 0 may
 * have gaps). Includes both AI-synthesized requirements and custom fields.
 */
function resolveInjections(
  fields: Array<{ id: string; type: string }>,
  feedMappings: Record<string, string>,
  sampleData: Array<Record<string, unknown>>,
  assetHouse: { logoPrimary?: string; logoInverse?: string } | null,
  logoVariant?: 'primary' | 'inverse',
  fieldTransforms?: Record<string, string[]>
): Record<string, { type: 'image' | 'text'; value: string }> {
  const injections: Record<string, { type: 'image' | 'text'; value: string }> = {};

  const firstVal = (col: string): string => {
    for (const row of sampleData) {
      const v = String(row[col] ?? '').trim();
      if (v) return v;
    }
    return '';
  };

  for (const field of fields) {
    const col = feedMappings[field.id];
    if (col) {
      const raw = firstVal(col);
      if (raw) {
        const transforms = fieldTransforms?.[field.id] ?? [];
        const fieldType = field.type as 'text' | 'image' | 'currency' | 'button' | 'asset';
        const val = applyClientTransforms(raw, transforms, fieldType);
        injections[field.id] = {
          type: field.type === 'image' ? 'image' : 'text',
          value: val,
        };
      }
    }
  }

  const logoVal =
    logoVariant === 'inverse'
      ? assetHouse?.logoInverse || assetHouse?.logoPrimary || ''
      : assetHouse?.logoPrimary || '';
  if (logoVal) injections['logo'] = { type: 'image', value: logoVal };

  return injections;
}

// ---------------------------------------------------------------------------
// Channel normalizer
// ---------------------------------------------------------------------------

/** Map UI Channel values (Title Case) to the TemplateLibraryRecord channel enum. */
function normalizeChannel(
  channel: string | undefined
): 'social' | 'programmatic' | 'print' | 'signage' {
  switch (channel) {
    case 'Social':
      return 'social';
    case 'Programmatic':
      return 'programmatic';
    case 'Print':
      return 'print';
    case 'Digital Signage':
      return 'signage';
    default:
      return 'social';
  }
}

// ---------------------------------------------------------------------------
// Step body
// ---------------------------------------------------------------------------

function PublishStepBody({
  stepData,
  mergeStepData,
  client,
}: StepRenderProps<TemplateBuilderStepData>) {
  const tbCtx = useTemplateBuilder();
  const { assetHouse } = useAssetHouse();

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const requirements = tbCtx.requirements;
  const feedSampleData = tbCtx.feedSampleData as Array<Record<string, unknown>>;
  const feedMappings = stepData.feedMappings ?? {};
  const uploadValues = stepData.uploadValues ?? {};

  const customFields = (stepData.customFields ?? []).map((f) => ({
    id: f.id,
    type: f.type,
  }));
  const allFields = [
    ...requirements.filter((r) => r.category === 'Dynamic'),
    ...customFields,
  ];

  const hasWireframe = Boolean(stepData.selectedWireframeId && stepData.wireframeFile);

  const selectedCandidate =
    tbCtx.candidates[stepData.selectedCandidateIndex ?? 0] ?? null;

  const injections = resolveInjections(
    allFields,
    feedMappings,
    feedSampleData,
    assetHouse,
    stepData.logoVariant,
    stepData.fieldTransforms
  );

  const cssOverrides: Record<string, string> = {
    ...(stepData.backgroundColor ? { background_color: stepData.backgroundColor } : {}),
    ...(stepData.accentColor ? { accent_color: stepData.accentColor } : {}),
    ...(stepData.fontFamily ? { font_family: stepData.fontFamily } : {}),
  };

  // ── NewTemplateData construction ─────────────────────────────────────────

  const newTemplateData: NewTemplateData = {
    name: stepData.templateName ?? 'Untitled Template',
    channel: normalizeChannel(stepData.channel),
    adSizes: (stepData.ratios ?? []).map((r) => parseRatio(r)),
    scaffoldId: stepData.selectedWireframeId ?? `${stepData.channel ?? 'social'}-ai-generated`,
    scaffoldSnapshot: {
      expectedFields: requirements
        .filter((r) => r.category === 'Dynamic' && r.type !== 'button' && r.type !== 'asset')
        .map((r) => r.id),
      contentHash: 'draft',
      capturedAt: Timestamp.fromDate(new Date()),
    },
    datasourceId: stepData.selectedFeedId ?? '',
    datasourceName: stepData.selectedFeedName ?? '',
    feedSnapshot: {
      columns: tbCtx.feedColumns,
      capturedAt: Timestamp.fromDate(new Date()),
    },
    fieldMappings: buildFieldMappings(
      feedMappings,
      uploadValues,
      stepData.slotMappings,
      stepData.staticValues,
      stepData.fieldSourceMode
    ),
    fieldTransforms: stepData.fieldTransforms ?? {},
    zoneStyles: stepData.zoneStyles,
    staticValues: stepData.staticValues,
    fieldSourceMode: stepData.fieldSourceMode,
    aiSuggestedMappings: stepData.aiSuggestedMappings,
    brandOverrides: {
      ...(stepData.backgroundColor ? { primaryColor: stepData.backgroundColor } : {}),
      ...(stepData.accentColor ? { accentColor: stepData.accentColor } : {}),
      ...(assetHouse?.logoPrimary ? { logoUrl: assetHouse.logoPrimary } : {}),
    },
    ...(stepData.brief ? { brief: stepData.brief } : {}),
    aiRequirements: {
      intent: stepData.brief ?? '',
      keyMessages: [],
    },
  };

  // ── Publish handler ──────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    setIsDrafting(true);
    setDraftError(null);
    try {
      await templateLibraryService.saveDraft(client.slug as ClientSlug, newTemplateData);
      setDraftSaved(true);
    } catch (err: unknown) {
      setDraftError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsDrafting(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      const templateId = await templateLibraryService.saveDraft(
        client.slug as ClientSlug,
        newTemplateData
      );
      await templateLibraryService.publish(client.slug as ClientSlug, templateId);
      setPublishedId(templateId);
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setIsPublishing(false);
    }
  };

  const fieldsMappedCount = Object.keys(feedMappings).length;
  const templateNameOk = Boolean((stepData.templateName ?? '').trim()) && !(stepData.templateName ?? '').startsWith('Untitled');
  const isReady = templateNameOk && fieldsMappedCount > 0;

  const isPublishDisabled =
    isPublishing ||
    Boolean(publishedId) ||
    !(stepData.templateName ?? '').trim() ||
    !auth.currentUser;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 min-h-[600px] -mx-6">
      {/* ── Left 60% — Template Preview ─────────────────────────────────── */}
      <div className="w-3/5 border-r border-gray-100 px-8 py-8 flex flex-col items-center justify-center bg-gray-50/50">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">
          Preview
        </p>
        {hasWireframe && stepData.wireframeFile ? (
          <FilledTemplatePreview
            templateFile={stepData.wireframeFile}
            name={stepData.templateName ?? 'Template Preview'}
            scale={0.45}
            adSize={SOCIAL_WIREFRAMES.find((w) => w.id === stepData.selectedWireframeId)?.adSize ?? 1024}
            injections={injections}
            cssOverrides={cssOverrides}
            slotOverrides={stepData.slotMappings}
            zoneStyles={stepData.zoneStyles}
          />
        ) : selectedCandidate ? (
          <CandidatePreview
            candidate={selectedCandidate}
            feedSampleData={feedSampleData}
            feedMappings={feedMappings}
            assetHouse={assetHouse}
            logoVariant={stepData.logoVariant}
            accentColor={stepData.accentColor}
            backgroundColor={stepData.backgroundColor}
            ratios={stepData.ratios ?? ['1:1']}
          />
        ) : (
          <div className="flex items-center justify-center h-64 rounded-xl border-2 border-dashed border-gray-200 w-full">
            <p className="text-sm text-gray-400">No preview available</p>
          </div>
        )}
      </div>

      {/* ── Right 40% — Publish Card ─────────────────────────────────────── */}
      <div className="w-2/5 px-8 py-8 flex flex-col gap-6">
        {/* Template name input */}
        <div className="space-y-2">
          <label
            htmlFor="template-name"
            className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]"
          >
            Template Name
          </label>
          <input
            id="template-name"
            type="text"
            value={stepData.templateName ?? ''}
            onChange={(e) => mergeStepData({ templateName: e.target.value })}
            placeholder="e.g. Summer Sale Social 1:1"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          />
          {(stepData.templateName ?? '').startsWith('Untitled') && (
            <p className="text-[10px] font-bold text-amber-600">
              Give your template a descriptive name before publishing — e.g. "Summer Sale Social 1:1"
            </p>
          )}
        </div>

        {/* Metadata summary */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 text-sm">
          <MetaRow label="Channel">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-black text-blue-700 uppercase tracking-widest">
              {stepData.channel ?? '—'}
            </span>
          </MetaRow>
          <MetaRow label="Sizes">
            {stepData.ratios && stepData.ratios.length > 0
              ? stepData.ratios.join(', ')
              : '—'}
          </MetaRow>
          <MetaRow label="Feed">
            {stepData.selectedFeedName ?? '—'}
          </MetaRow>
          <MetaRow label="Fields mapped">
            {fieldsMappedCount} {fieldsMappedCount === 1 ? 'field' : 'fields'}
          </MetaRow>
          <MetaRow label="Status">
            {isReady ? (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-[10px] font-black text-green-700 uppercase tracking-widest">
                Ready to publish
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700 uppercase tracking-widest">
                Review required
              </span>
            )}
          </MetaRow>
        </div>

        {/* Success state */}
        {publishedId ? (
          <div className="flex flex-col items-center gap-4 rounded-xl bg-green-50 border border-green-200 p-6 text-center">
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm font-semibold text-green-800">Template published!</p>
              <p className="text-[10px] font-medium text-green-600 mt-1">
                It's now available in the Template Library for use across campaigns.
              </p>
            </div>
            <a
              href={`/adlabs/${client.slug}/templates`}
              className="w-full rounded-xl py-3 text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 bg-gray-900 text-white hover:bg-gray-700 active:scale-[0.98]"
            >
              View in Template Library
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </a>
            <a
              href={`/adlabs/${client.slug}`}
              className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] hover:text-gray-700 transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        ) : (
          <>
            {/* Error state */}
            {publishError && (
              <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                <ExclamationCircleIcon className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-red-700">{publishError}</p>
                  <button
                    type="button"
                    onClick={() => void handlePublish()}
                    className="mt-2 text-[10px] font-black text-red-600 uppercase tracking-[0.15em] hover:text-red-800 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Publish CTA */}
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={isPublishDisabled}
              className={[
                'w-full rounded-xl py-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2',
                isPublishDisabled
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-700 active:scale-[0.98] shadow-lg hover:shadow-gray-300',
              ].join(' ')}
            >
              {isPublishing ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Publishing…
                </>
              ) : (
                'Publish to Template Library'
              )}
            </button>

            {/* Save as Draft */}
            {draftSaved ? (
              <p className="text-center text-[10px] font-bold text-gray-400">Draft saved — not yet published.</p>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={isDrafting || !(stepData.templateName ?? '').trim()}
                  className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] hover:text-gray-700 disabled:opacity-40 transition-colors"
                >
                  {isDrafting ? 'Saving…' : 'Save as Draft'}
                </button>
                {draftError && (
                  <p className="text-[9px] text-red-500">{draftError}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility sub-component
// ---------------------------------------------------------------------------

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] shrink-0">
        {label}
      </span>
      <span className="text-xs text-gray-700 text-right truncate">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step export
// ---------------------------------------------------------------------------

export const publishStep: WizardStep<TemplateBuilderStepData> = {
  id: 'publish',
  name: 'Publish',
  description: 'Review your template and publish it to the Template Library for use across campaigns.',
  validate: () => ({ ok: true }),
  render: (props) => <PublishStepBody {...props} />,
};
