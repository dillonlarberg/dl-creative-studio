// Temporary: routes through helloWorld (an existing function with allUsers IAM)
// until Diego sets the invoker policy on the 3 standalone Cloud Functions
// (synthesizeRequirementsAI, generateLayoutsAI, suggestMappingsAI).
// To revert: restore httpsCallable calls and delete this file's contents.
import type { RequirementField, Channel } from '../../apps/template-builder/types';
import type { ClientAssetHouse } from '../clientAssetHouse';
import type { Candidate } from '../../apps/template-builder/TemplateBuilderContext';
import { WIREFRAME_CATALOG } from '../../constants/useCases';

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
  feedColumns?: string[];
  brief?: string;
  feedSampleRow?: Record<string, string> | null;
}): Promise<Candidate[]> {
  return callGemini<Candidate[]>('generateLayouts', {
    requirements: opts.requirements,
    channel: opts.channel,
    brand: opts.brand
      ? { primaryColor: opts.brand.primaryColor, fontPrimary: opts.brand.fontPrimary, cornerRadius: opts.brand.cornerRadius, logoPrimary: opts.brand.logoPrimary }
      : null,
    feedColumns: opts.feedColumns ?? [],
    brief: opts.brief ?? '',
    feedSampleRow: opts.feedSampleRow ?? null,
    wireframeCatalog: WIREFRAME_CATALOG.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      bestFor: w.bestFor,
      slots: w.slots,
      imageCount: w.elementTypes.image,
      hasLogo: w.elementTypes.hasLogo,
      hasBackground: w.elementTypes.hasBackground,
      hasCTA: w.elementTypes.hasCTA,
      hasPrice: w.elementTypes.hasPrice,
    })),
  });
}

/**
 * Returns the first row from sampleRows where at least 3 values are non-empty.
 * Falls back to row 0 if no such row exists. Truncates each value to 80 chars.
 */
export function bestSampleRow(
  sampleRows: Record<string, string>[]
): Record<string, string> | null {
  if (!sampleRows || sampleRows.length === 0) return null;
  const truncate = (v: string) => (v.length > 80 ? v.slice(0, 80) : v);
  for (const row of sampleRows.slice(0, 5)) {
    const nonEmpty = Object.values(row).filter((v) => v && v.trim().length > 0);
    if (nonEmpty.length >= 3) {
      return Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, truncate(v)])
      );
    }
  }
  // fallback: row 0 with truncation
  return Object.fromEntries(
    Object.entries(sampleRows[0]).map(([k, v]) => [k, truncate(v)])
  );
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
