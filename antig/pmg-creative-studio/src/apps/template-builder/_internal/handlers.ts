/**
 * Plain async handlers ported from src/pages/use-cases/UseCaseWizardPage.tsx.
 * They take their inputs explicitly instead of relying on closure state.
 *
 * Step components call these and route results through `mergeStepData`.
 */

import { batchService } from '../../../services/batches';
import type { ClientAssetHouse } from '../../../services/clientAssetHouse';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';
import type { RequirementField, SelectedFeed } from '../types';
import { BASELINE_ASSETS } from './baseline';

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
