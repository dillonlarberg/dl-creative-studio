/**
 * Plain async handlers ported from src/pages/use-cases/UseCaseWizardPage.tsx.
 * They take their inputs explicitly instead of relying on closure state.
 *
 * Step components call these and route results through `mergeStepData`.
 */

import { batchService } from '../../../services/batches';
import { alliService } from '../../../services/alli';
import type { ClientAssetHouse } from '../../../services/clientAssetHouse';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import type { RequirementField, SelectedFeed } from '../types';
import { BASELINE_ASSETS } from './baseline';

/**
 * Diagnostic envelope returned from {@link fetchFeedSample} when every
 * progressive query attempt fails. Mirrors the shape the monolith stuffs
 * into `feedMetadata.error` (UseCaseWizardPage.tsx lines 825-867).
 */
export interface FeedSampleErrorInfo {
  clientSlug: string;
  modelName: string;
  error: string;
  category: string;
  proxyStatus: string;
  recommendation: string;
  type: string;
  stack: string;
}

export interface FeedSampleResult {
  sampleData: Array<Record<string, unknown>>;
  metadata: unknown | { error: FeedSampleErrorInfo } | null;
  stressMap?: { shortest: Record<string, unknown>; longest: Record<string, unknown> };
}

/**
 * Port of UseCaseWizardPage.tsx lines 723-871. Runs a progressive-fallback
 * ladder of `executeQuery` calls against an Alli model and returns the
 * sample rows plus inferred metadata. On total failure returns a
 * `metadata.error` object describing the diagnostic envelope.
 *
 * Plain async function — no closure dependencies on monolith state.
 */
export async function fetchFeedSample(opts: {
  clientSlug: string;
  feed: SelectedFeed | string;
}): Promise<FeedSampleResult> {
  const feed = opts.feed;
  const modelName = typeof feed === 'string' ? feed : feed.name;
  const feedObj = typeof feed === 'string' ? null : feed;

  let dimensions: string[] = [];
  let measures: string[] = [];
  let metadata: unknown = null;

  try {
    if (feedObj) {
      dimensions = (feedObj.dimensions || [])
        .map((d) => (typeof d === 'string' ? d : d.name))
        .filter(Boolean) as string[];
      measures = (feedObj.measures || [])
        .map((m) => (typeof m === 'string' ? m : m.name))
        .filter(Boolean) as string[];
    }

    if (dimensions.length === 0 && measures.length === 0) {
      try {
        const meta = await alliService.getModelMetadata(opts.clientSlug, modelName);
        metadata = meta;
        dimensions = ((meta.dimensions || []) as Array<{ name: string }>).map(
          (d) => d.name
        );
        measures = ((meta.measures || []) as Array<{ name: string }>).map(
          (m) => m.name
        );
      } catch (metaErr) {
        console.warn('[FeedSample] Metadata discovery skipped:', metaErr);
      }
    } else if (feedObj) {
      metadata = feedObj;
    }

    const attempts: Array<{ dims: string[]; meas: string[] }> = [
      { dims: dimensions, meas: measures },
      { dims: dimensions, meas: [] },
    ];

    if (modelName === 'creative_insights_data_export') {
      attempts.unshift({
        dims: ['ad_id', 'url', 'creative_type', 'brand_visuals'],
        meas: ['cpm', 'ctr'],
      });
      attempts.push({ dims: ['ad_id', 'url'], meas: [] });
      attempts.push({ dims: ['ad_id'], meas: [] });
    } else {
      if (dimensions.length > 0) {
        attempts.push({ dims: [dimensions[0]], meas: [] });
      }
      attempts.push({ dims: [], meas: [] });
    }

    let data: Array<Record<string, unknown>> = [];
    let lastError: unknown = null;
    let stressMap:
      | { shortest: Record<string, unknown>; longest: Record<string, unknown> }
      | undefined;

    for (const attempt of attempts) {
      try {
        const result = await alliService.executeQuery(opts.clientSlug, modelName, {
          dimensions: attempt.dims.length > 0 ? attempt.dims : undefined,
          measures: attempt.meas.length > 0 ? attempt.meas : undefined,
          limit: 25,
        });
        data =
          result.results ||
          result.rows ||
          result.data ||
          (Array.isArray(result) ? result : []);
        if (data.length > 0 || (result.results && result.results.length === 0)) {
          if (data.length > 0) {
            const shortest: Record<string, unknown> = {};
            const longest: Record<string, unknown> = {};
            const allCols = Object.keys(data[0] || {});
            allCols.forEach((col) => {
              let minIdx = 0;
              let maxIdx = 0;
              data.forEach((row, idx) => {
                const val = String(row[col] ?? '');
                if (val.length < String(data[minIdx][col] ?? '').length) minIdx = idx;
                if (val.length > String(data[maxIdx][col] ?? '').length) maxIdx = idx;
              });
              shortest[col] = data[minIdx][col];
              longest[col] = data[maxIdx][col];
            });
            stressMap = { shortest, longest };
          }
          break;
        }
      } catch (err) {
        console.warn('[FeedSample] Attempt failed:', err);
        lastError = err;
      }
    }

    if (data.length === 0 && lastError) {
      throw lastError;
    }

    let processedData = data;
    if (modelName === 'creative_insights_data_export') {
      processedData = data.filter((row) => {
        const ct =
          row.creative_type ||
          row.creative_insights_data_export__creative_type;
        return String(ct ?? '').toLowerCase() !== 'thumbnail';
      });
    }

    return { sampleData: processedData, metadata, stressMap };
  } catch (err) {
    const errorMessage = (err as Error)?.message || String(err);
    const isFailedToFetch = errorMessage.toLowerCase().includes('failed to fetch');

    let errorCategory = 'API Error';
    let recommendation =
      'The Alli API returned an error for this specific query. Try a different source or retry with common fields.';
    if (isFailedToFetch) {
      errorCategory = 'Proxy Connectivity';
      recommendation =
        'Could not reach the PMG Proxy server. Check VPN and internet connection. If you are on PMG-Corp, ensure you have proxy access.';
    } else if (errorMessage.includes('403')) {
      errorCategory = 'Unauthorized';
      recommendation =
        "You do not have permission to query this model. Ensure your Alli account has access to this client's data.";
    } else if (errorMessage.toLowerCase().includes('timeout')) {
      errorCategory = 'Network Timeout';
      recommendation =
        'The query took too long to execute. This model might be too large for a live preview.';
    }

    let proxyStatus = 'Unknown';
    try {
      const proxyBase = 'https://us-central1-automated-creative-e10d7.cloudfunctions.net';
      const ping = await fetch(`${proxyBase}/helloWorld`, { mode: 'no-cors' });
      proxyStatus = ping.type === 'opaque' || ping.ok ? 'Reachable' : 'Unreachable';
    } catch {
      proxyStatus = 'Unreachable';
    }

    const debugInfo: FeedSampleErrorInfo = {
      clientSlug: opts.clientSlug,
      modelName,
      error: errorMessage,
      category: errorCategory,
      proxyStatus,
      recommendation,
      type: (err as Error)?.name || 'Error',
      stack: (err as Error)?.stack || 'No stack trace available',
    };
    return { sampleData: [], metadata: { error: debugInfo } };
  }
}

/**
 * Port of UseCaseWizardPage.tsx lines 675-710. Fetches data sources for
 * the client and applies the "feed" name/description filter, falling back
 * to all models if no feed-named ones exist.
 */
export async function fetchDataSources(opts: {
  clientSlug: string;
}): Promise<{ feeds: SelectedFeed[]; error?: string }> {
  if (!opts.clientSlug) {
    return { feeds: [], error: 'No client slug' };
  }
  try {
    const models = (await alliService.getDataSources(opts.clientSlug)) as Array<
      Record<string, unknown>
    >;

    let feeds = models.filter((m) => {
      const searchStr = `${m.name || ''} ${m.description || ''} ${m.label || ''}`
        .toString()
        .toLowerCase();
      return searchStr.includes('feed') || m.name === 'creative_insights_data_export';
    });

    if (feeds.length === 0 && models.length > 0) {
      feeds = models;
    }

    if (feeds.length === 0) {
      return {
        feeds: [],
        error:
          'No models found for this client. Check permissions or try another brand.',
      };
    }

    return { feeds: feeds as SelectedFeed[] };
  } catch (err) {
    return {
      feeds: [],
      error: (err as Error)?.message || String(err),
    };
  }
}

/**
 * Port of UseCaseWizardPage.tsx line 521.
 * Returns the synthesized requirements list. Caller decides whether to
 * mark them approved (the wireframe path auto-approves; the prompt path
 * leaves areRequirementsApproved=false until the user clicks Approve).
 */
export async function analyzeCreativeIntent(opts: {
  selectedWireframe?: string;
  prompt?: string;
}): Promise<{ requirements: RequirementField[]; autoApprove: boolean }> {
  await new Promise((r) => setTimeout(r, 1200));

  if (opts.selectedWireframe) {
    const identified: RequirementField[] = [
      { id: 'headline', label: 'Dynamic Headline', category: 'Dynamic', source: 'Locked', type: 'text', value: BASELINE_ASSETS.headline1 },
      { id: 'cta', label: 'Interactive CTA', category: 'System', source: 'Locked', type: 'button', value: BASELINE_ASSETS.cta },
      { id: 'promo', label: 'Promo Callout', category: 'Dynamic', source: 'Locked', type: 'text', value: BASELINE_ASSETS.promo },
      { id: 'image1', label: 'Primary Creative', category: 'Dynamic', source: 'Locked', type: 'image', value: BASELINE_ASSETS.image1 },
      { id: 'image2', label: 'Secondary Creative', category: 'Dynamic', source: 'Locked', type: 'image', value: BASELINE_ASSETS.image2 },
      { id: 'logo', label: 'Brand Logo', category: 'Brand', source: 'Locked', type: 'asset', value: BASELINE_ASSETS.logo },
      { id: 'styles', label: 'Brand Style Tokens', category: 'Brand', source: 'Locked', type: 'style', value: 'Theme: PMG Hiring' },
    ];
    return { requirements: identified, autoApprove: true };
  }

  if (!opts.prompt) return { requirements: [], autoApprove: false };

  const prompt = opts.prompt.toLowerCase();
  const hasReccoKeywords =
    prompt.includes('recommend') ||
    prompt.includes('suggest') ||
    prompt.includes('not sure') ||
    prompt.length < 15;

  const identified: RequirementField[] = [];

  if (prompt.includes('price') || prompt.includes('cost') || hasReccoKeywords) {
    identified.push({ id: 'price', label: 'Dynamic Price Slot', category: 'Dynamic', source: 'Feed', type: 'currency' });
  }
  if (prompt.includes('headline') || prompt.includes('title') || prompt.includes('text') || hasReccoKeywords) {
    const label = prompt.includes('title') ? 'Primary Title' : 'Dynamic Headline';
    identified.push({ id: 'headline', label, category: 'Dynamic', source: 'Feed', type: 'text' });
  }
  if (prompt.includes('image') || prompt.includes('photo') || prompt.includes('product') || hasReccoKeywords) {
    const label = prompt.includes('product') ? 'Hero Product Image' : 'Creative Asset';
    identified.push({ id: 'image_url', label, category: 'Dynamic', source: 'Feed', type: 'image' });
  }
  if (prompt.includes('logo') || prompt.includes('brand') || hasReccoKeywords) {
    identified.push({ id: 'logo', label: 'Brand Logo', category: 'Brand', source: 'Creative House', type: 'asset' });
  }
  if (prompt.includes('cta') || prompt.includes('button') || hasReccoKeywords) {
    identified.push({ id: 'cta', label: 'Interactive CTA', category: 'System', source: 'User Preset', type: 'button' });
  }
  if (identified.length === 0) {
    identified.push({ id: 'custom_slot', label: 'Dynamic Content Slot', category: 'Dynamic', source: 'Feed', type: 'text' });
  }

  return { requirements: identified, autoApprove: false };
}

/**
 * Port of UseCaseWizardPage.tsx line 873. Generates the candidate-list shown
 * on the generate step. Reads brand standards from the asset house.
 */
export async function generateCandidates(opts: {
  selectedWireframe?: string;
  requirements: RequirementField[];
  assetHouse: ClientAssetHouse | null;
  clientLogoUrl?: string;
}): Promise<{ candidates: unknown[]; selectedIndex: number }> {
  await new Promise((r) => setTimeout(r, 2000));

  const brandColor = opts.assetHouse?.primaryColor || '#2563eb';
  const brandFont = opts.assetHouse?.fontPrimary || 'Inter';
  const brandLogo = opts.assetHouse?.logoPrimary;
  const fallbackLogo = opts.clientLogoUrl || 'https://via.placeholder.com/150?text=Logo';

  const hasHeadline = opts.requirements.some((r) => r.id === 'headline');
  const hasPrice = opts.requirements.some((r) => r.id === 'price');
  const hasImage = opts.requirements.some((r) => r.id === 'image_url');
  const hasLogo = opts.requirements.some((r) => r.category === 'Brand' || r.id === 'logo');
  const hasCTA = opts.requirements.some((r) => r.id === 'cta');

  let candidates: unknown[];
  if (opts.selectedWireframe) {
    const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === opts.selectedWireframe);
    candidates = [
      {
        id: 'wireframe-primary',
        name: `${wireframe?.name || 'Wireframe'} Primary`,
        variant: 'wireframe',
        strategy: `Official ${wireframe?.name} layout optimized with your brand standards and data mapping.`,
        styles: { primaryColor: brandColor, fontFamily: brandFont, logo: hasLogo ? brandLogo || fallbackLogo : null },
        elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo },
      },
      {
        id: 'wireframe-inverse',
        name: `${wireframe?.name || 'Wireframe'} Inverse`,
        variant: 'wireframe',
        strategy: `Inverted color palette variation of the ${wireframe?.name} layout for high contrast environments.`,
        styles: { primaryColor: '#ffffff', accentColor: brandColor, fontFamily: brandFont, logo: hasLogo ? brandLogo || fallbackLogo : null },
        elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo },
      },
    ];
  } else {
    candidates = [
      {
        id: 'v1',
        name: 'Gilded Performance',
        variant: 'grid',
        strategy: 'Premium editorial layout with refined typography and gold-standard legibility.',
        styles: {
          primaryColor: brandColor,
          fontFamily: brandFont,
          layout: 'auto',
          logo: hasLogo ? brandLogo || fallbackLogo : null,
          padding: '32px',
          borderRadius: opts.assetHouse?.cornerRadius || '12px',
          shadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
          gradient: `linear-gradient(135deg, ${brandColor} 0%, #000000 100%)`,
        },
        elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo },
      },
      {
        id: 'v2',
        name: 'High-Voltage Dynamic',
        variant: 'stacked',
        strategy: 'Aggressive, high-impact variation using slanted containers and maximum contrast.',
        styles: {
          primaryColor: brandColor,
          fontFamily: brandFont,
          layout: 'split-hero',
          logo: hasLogo ? brandLogo || fallbackLogo : null,
          overlayOpacity: 0.95,
          accentRotation: '-2deg',
          borderRadius: '0px',
          gradient: `linear-gradient(to right, ${brandColor}, ${brandColor}88)`,
        },
        elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo },
      },
      {
        id: 'v3',
        name: 'Architect Minimal',
        variant: 'wide',
        strategy: 'Space-first aesthetic utilizing heavy tracking and hairline borders.',
        styles: {
          primaryColor: brandColor,
          fontFamily: brandFont,
          layout: 'minimal',
          logo: hasLogo ? brandLogo || fallbackLogo : null,
          fontSpacing: '0.25em',
          borderWidth: '1px',
          borderColor: '#00000022',
        },
        elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo },
      },
    ];
  }

  return { candidates, selectedIndex: 0 };
}

/**
 * Port of UseCaseWizardPage.tsx line 637.
 * Mocks a batch deployment: creates batch, marks processing, adds 3 demo
 * results, then completes. Returns the batch id.
 */
export async function handleExecuteBatch(opts: {
  clientSlug: string;
  selectedFeed: SelectedFeed | null;
  feedSampleData: Array<Record<string, unknown>>;
  feedMappings: Record<string, string>;
  ratio?: string;
}): Promise<string> {
  const batchId = await batchService.createBatch({
    clientSlug: opts.clientSlug,
    templateId: 'active-session',
    feedId: (opts.selectedFeed as { id?: string } | null)?.id || 'manual',
    feedName: opts.selectedFeed?.name || 'Uploaded Feed',
    status: 'pending',
    totalVariations: opts.feedSampleData.length || 45,
    completedVariations: 0,
    ratio: opts.ratio || '1:1',
  });

  await batchService.updateBatchStatus(batchId, 'processing');

  for (let i = 0; i < Math.min(3, opts.feedSampleData.length); i++) {
    const headlineKey = opts.feedMappings.headline;
    const product = headlineKey
      ? (opts.feedSampleData[i]?.[headlineKey] as string) || 'Product Variation'
      : 'Product Variation';
    await batchService.addResult(batchId, {
      url: `https://picsum.photos/seed/${batchId}-${i}/1080/1080`,
      feedRowIndex: i,
      metadata: { product },
    });
  }

  await batchService.updateBatchStatus(batchId, 'completed', opts.feedSampleData.length || 45);
  return batchId;
}
