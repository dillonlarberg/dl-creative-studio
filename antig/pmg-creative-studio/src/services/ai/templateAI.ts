// Temporary: routes through helloWorld (an existing function with allUsers IAM)
// until Diego sets the invoker policy on the 3 standalone Cloud Functions
// (synthesizeRequirementsAI, generateLayoutsAI, suggestMappingsAI).
// To revert: restore httpsCallable calls and delete this file's contents.
import type { RequirementField, Channel } from '../../apps/template-builder/types';
import type { ClientAssetHouse } from '../clientAssetHouse';
import type { Candidate } from '../../apps/template-builder/TemplateBuilderContext';

const PROXY = '/api/helloWorld';

async function callGemini<T>(action: string, payload: object): Promise<T> {
  const res = await fetch(`${PROXY}?templateAI=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Template AI error (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function synthesizeRequirements(opts: {
  brief: string;
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary'> | null;
}): Promise<RequirementField[]> {
  return callGemini<RequirementField[]>('synthesize', {
    brief: opts.brief,
    channel: opts.channel,
    brand: opts.brand ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary } : null,
  });
}

export async function generateLayouts(opts: {
  requirements: RequirementField[];
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary' | 'cornerRadius' | 'logoPrimary'> | null;
}): Promise<Candidate[]> {
  return callGemini<Candidate[]>('generateLayouts', {
    requirements: opts.requirements,
    channel: opts.channel,
    brand: opts.brand
      ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary, cornerRadius: opts.brand.cornerRadius, logoPrimary: opts.brand.logoPrimary }
      : null,
  });
}

export async function suggestMappings(opts: {
  requirements: RequirementField[];
  feedColumns: string[];
}): Promise<Record<string, string>> {
  return callGemini<Record<string, string>>('suggestMappings', {
    requirements: opts.requirements,
    feedColumns: opts.feedColumns,
  });
}
