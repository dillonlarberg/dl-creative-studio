import type { TemplateBuilderStepData, Channel } from '../types';
import type { TemplateLibraryRecord } from '../../../services/templateLibrary.types';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';

export function mapTemplateToStepData(t: TemplateLibraryRecord): Partial<TemplateBuilderStepData> {
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
    staticValues: t.staticValues,
    fieldSourceMode: t.fieldSourceMode,
    aiSuggestedMappings: t.aiSuggestedMappings,
    selectedWireframeId: t.scaffoldId,
    ...(wireframe ? { wireframeFile: wireframe.file } : {}),
    ...(t.brandOverrides?.primaryColor ? { backgroundColor: t.brandOverrides.primaryColor } : {}),
    ...(t.brandOverrides?.accentColor ? { accentColor: t.brandOverrides.accentColor } : {}),
    ...(t.logoVariant ? { logoVariant: t.logoVariant } : {}),
  };
}
