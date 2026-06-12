import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import WizardShell from '../../platform/wizard/WizardShell';
import { SharedDataProvider } from '../../platform/wizard/SharedDataContext';
import { AssetHouseProvider } from '../../platform/assetHouse/AssetHouseContext';
import { TemplateBuilderProvider } from './TemplateBuilderContext';
import { useCurrentClient } from '../../platform/client/useCurrentClient';
import manifest from './manifest';
import type { TemplateBuilderStepData, Channel } from './types';
import type { TemplateLibraryRecord } from '../../services/templateLibrary.types';
import { templateLibraryService } from '../../services/templateLibrary';
import { SOCIAL_WIREFRAMES } from '../../constants/useCases';
import type { ClientSlug } from '../../platform/firebase/paths';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapTemplateToStepData(t: TemplateLibraryRecord): Partial<TemplateBuilderStepData> {
  const channelMap: Record<string, Channel> = {
    social: 'Social',
    programmatic: 'Programmatic',
    print: 'Print',
    signage: 'Digital Signage',
  };

  const ratios = t.adSizes.map((s) => s.label ?? `${s.width}:${s.height}`);

  const feedMappings: Record<string, string> = {};
  const uploadValues: Record<string, string> = {};
  const slotMappings: Record<string, string> = {};

  for (const [fieldId, mapping] of Object.entries(t.fieldMappings)) {
    if (mapping.source === 'feed') {
      feedMappings[fieldId] = mapping.column;
      if (mapping.slotId) slotMappings[fieldId] = mapping.slotId;
    } else if (mapping.source === 'upload') {
      uploadValues[fieldId] = mapping.assetPath;
    }
  }

  const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === t.scaffoldId);

  return {
    templateName: t.name,
    channel: channelMap[t.channel] ?? 'Social',
    ratios,
    selectedFeedId: t.datasourceId,
    selectedFeedName: t.datasourceName,
    brief: t.aiRequirements?.intent ?? t.brief ?? '',
    feedMappings,
    ...(Object.keys(uploadValues).length > 0 ? { uploadValues } : {}),
    ...(Object.keys(slotMappings).length > 0 ? { slotMappings } : {}),
    fieldTransforms: t.fieldTransforms ?? {},
    zoneStyles: t.zoneStyles,
    selectedWireframeId: t.scaffoldId,
    ...(wireframe ? { wireframeFile: wireframe.file } : {}),
    ...(t.brandOverrides?.primaryColor ? { backgroundColor: t.brandOverrides.primaryColor } : {}),
    ...(t.brandOverrides?.accentColor ? { accentColor: t.brandOverrides.accentColor } : {}),
  };
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function TemplateBuilderAppRoot() {
  const [searchParams] = useSearchParams();
  const fromTemplateId = searchParams.get('from');
  const isCopy = searchParams.get('copy') === '1';
  // Read slug from the URL param directly — synchronous and always available.
  // useCurrentClient resolves asynchronously (currentClient starts as null),
  // which would leave slug='' on first render and cause the guard to spin forever.
  const { clientSlug: urlSlug } = useParams<{ clientSlug: string }>();
  const { currentClient } = useCurrentClient();
  const slug = urlSlug ?? currentClient?.slug ?? '';

  const [fromData, setFromData] = useState<Partial<TemplateBuilderStepData> | null>(null);
  const [loading, setLoading] = useState(!!fromTemplateId);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!fromTemplateId) {
      setLoading(false);
      return;
    }
    // Wait for the client slug to resolve before fetching.
    // Without this guard, the early return would call setLoading(false)
    // before the fetch runs, causing WizardShell to mount with empty stepData.
    if (!slug) return;
    templateLibraryService
      .getTemplate(slug as ClientSlug, fromTemplateId)
      .then((template) => {
        const data = mapTemplateToStepData(template);
        if (isCopy) {
          data.templateName = `Copy of ${template.name}`;
        }
        // Clear any stale session so it doesn't override the template pre-fill
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(`wiz_${slug}_template-builder`);
        }
        setFromData(data);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [fromTemplateId, slug, isCopy]);

  const resolvedManifest = useMemo(() => {
    if (!fromData) return manifest;
    const prefilledData = fromData;
    return {
      ...manifest,
      initialStepData: (): TemplateBuilderStepData => ({
        ...manifest.initialStepData(),
        ...prefilledData,
      }),
    };
  }, [fromData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-600">Failed to load template: {loadError}</p>
      </div>
    );
  }

  return (
    <SharedDataProvider clientSlug={slug}>
      <AssetHouseProvider clientSlug={slug}>
        <TemplateBuilderProvider>
          <WizardShell<TemplateBuilderStepData> manifest={resolvedManifest} />
        </TemplateBuilderProvider>
      </AssetHouseProvider>
    </SharedDataProvider>
  );
}
