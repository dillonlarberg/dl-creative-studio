import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import type { RequirementField, Channel } from '../../apps/template-builder/types';
import type { ClientAssetHouse } from '../clientAssetHouse';
import type { Candidate } from '../../apps/template-builder/TemplateBuilderContext';

const _synthesize = httpsCallable<
  { brief: string; channel: string; brand: { primaryColor?: string; fontPrimary?: string } | null },
  RequirementField[]
>(functions, 'synthesizeRequirementsAI', { timeout: 60000 });

const _generateLayouts = httpsCallable<
  { requirements: RequirementField[]; channel: string; brand: { primaryColor?: string; fontPrimary?: string; cornerRadius?: string; logoPrimary?: string } | null },
  Candidate[]
>(functions, 'generateLayoutsAI', { timeout: 60000 });

const _suggestMappings = httpsCallable<
  { requirements: RequirementField[]; feedColumns: string[] },
  Record<string, string>
>(functions, 'suggestMappingsAI', { timeout: 30000 });

export async function synthesizeRequirements(opts: {
  brief: string;
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary'> | null;
}): Promise<RequirementField[]> {
  const result = await _synthesize({
    brief: opts.brief,
    channel: opts.channel,
    brand: opts.brand ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary } : null,
  });
  return result.data;
}

export async function generateLayouts(opts: {
  requirements: RequirementField[];
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary' | 'cornerRadius' | 'logoPrimary'> | null;
}): Promise<Candidate[]> {
  const result = await _generateLayouts({
    requirements: opts.requirements,
    channel: opts.channel,
    brand: opts.brand
      ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary, cornerRadius: opts.brand.cornerRadius, logoPrimary: opts.brand.logoPrimary }
      : null,
  });
  return result.data;
}

export async function suggestMappings(opts: {
  requirements: RequirementField[];
  feedColumns: string[];
}): Promise<Record<string, string>> {
  const result = await _suggestMappings({
    requirements: opts.requirements,
    feedColumns: opts.feedColumns,
  });
  return result.data;
}
