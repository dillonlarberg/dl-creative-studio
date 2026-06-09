import type { RequirementField, Channel } from '../../apps/template-builder/types';
import type { ClientAssetHouse } from '../clientAssetHouse';
import type { Candidate } from '../../apps/template-builder/TemplateBuilderContext';

// ── synthesizeRequirements ──────────────────────────────────────────────────
// Derives template field requirements from a creative brief and channel.
// TODO: replace mock with Gemini/Claude call proxied through Firebase Functions.
export async function synthesizeRequirements(opts: {
  brief: string;
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary'> | null;
}): Promise<RequirementField[]> {
  await new Promise((r) => setTimeout(r, 800));

  const brief = opts.brief.toLowerCase();
  const fields: RequirementField[] = [];

  // Always include headline for all channels
  fields.push({ id: 'headline', label: 'Headline', category: 'Dynamic', source: 'Feed', type: 'text' });

  // Image for Social + Programmatic
  if (opts.channel === 'Social' || opts.channel === 'Programmatic') {
    fields.push({ id: 'image_url', label: 'Product Image', category: 'Dynamic', source: 'Feed', type: 'image' });
  }

  // Price if brief mentions it or is e-commerce-y
  if (brief.includes('price') || brief.includes('deal') || brief.includes('sale') || brief.includes('product') || brief.length < 10) {
    fields.push({ id: 'price', label: 'Price', category: 'Dynamic', source: 'Feed', type: 'currency' });
  }

  // Logo always
  fields.push({ id: 'logo', label: 'Brand Logo', category: 'Brand', source: 'Creative House', type: 'asset' });

  // CTA for Social + Programmatic
  if (opts.channel === 'Social' || opts.channel === 'Programmatic') {
    fields.push({ id: 'cta', label: 'Call to Action', category: 'System', source: 'User Preset', type: 'button' });
  }

  return fields;
}

// ── generateLayouts ──────────────────────────────────────────────────────────
// Generates 3 layout candidates from brand tokens + requirements.
// TODO: replace mock with Gemini/Claude call proxied through Firebase Functions.
export async function generateLayouts(opts: {
  requirements: RequirementField[];
  channel: Channel;
  brand: Pick<ClientAssetHouse, 'primaryColor' | 'fontPrimary' | 'cornerRadius' | 'logoPrimary'> | null;
}): Promise<Candidate[]> {
  await new Promise((r) => setTimeout(r, 1500));

  const color = opts.brand?.primaryColor ?? '#2563eb';
  const font = opts.brand?.fontPrimary ?? 'Inter';
  const radius = opts.brand?.cornerRadius ?? '12px';
  const logo = opts.brand?.logoPrimary ?? null;

  const hasHeadline = opts.requirements.some((r) => r.id === 'headline');
  const hasPrice = opts.requirements.some((r) => r.id === 'price');
  const hasImage = opts.requirements.some((r) => r.type === 'image');
  const hasLogo = opts.requirements.some((r) => r.category === 'Brand');
  const hasCTA = opts.requirements.some((r) => r.type === 'button');

  return [
    {
      id: 'editorial',
      name: 'Editorial Grid',
      variant: 'grid',
      description: 'Clean editorial layout with strong typographic hierarchy.',
      strategy: 'Safe, high-legibility format optimised for awareness and recall.',
      styles: { primaryColor: color, fontFamily: font, borderRadius: radius, shadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', gradient: `linear-gradient(135deg, ${color} 0%, #000 100%)`, logo },
      elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo },
    },
    {
      id: 'bold',
      name: 'High Voltage',
      variant: 'stacked',
      description: 'Aggressive stacked layout built for maximum contrast and click-through.',
      strategy: 'High-impact variant with bold type and slanted containers for performance campaigns.',
      styles: { primaryColor: color, fontFamily: font, borderRadius: '0px', accentRotation: '-2deg', gradient: `linear-gradient(to right, ${color}, ${color}88)`, logo },
      elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo },
    },
    {
      id: 'minimal',
      name: 'Architect Minimal',
      variant: 'minimal',
      description: 'Space-first aesthetic with generous whitespace and hairline details.',
      strategy: 'Premium minimal treatment suited to fashion, luxury, and lifestyle contexts.',
      styles: { primaryColor: color, fontFamily: font, borderRadius: radius, logo },
      elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo },
    },
  ];
}

// ── suggestMappings ──────────────────────────────────────────────────────────
// Auto-maps requirement field IDs to feed column names by semantic similarity.
// TODO: replace mock with Gemini/Claude call proxied through Firebase Functions.
export async function suggestMappings(opts: {
  requirements: RequirementField[];
  feedColumns: string[];
}): Promise<Record<string, string>> {
  if (opts.feedColumns.length === 0) return {};
  await new Promise((r) => setTimeout(r, 400));

  const result: Record<string, string> = {};
  const cols = opts.feedColumns.map((c) => c.toLowerCase());

  for (const req of opts.requirements) {
    if (req.type === 'asset' || req.type === 'button') continue;

    const aliases: Record<string, string[]> = {
      headline: ['headline', 'title', 'name', 'product_name', 'product_title', 'ad_title'],
      price: ['price', 'sale_price', 'cost', 'amount', 'regular_price', 'offer_price'],
      image_url: ['image', 'image_url', 'img', 'photo', 'picture', 'thumbnail', 'product_image'],
      description: ['description', 'desc', 'body', 'copy', 'text'],
    };

    const candidates = aliases[req.id] ?? [req.id, req.label.toLowerCase().replace(/\s+/g, '_')];
    const match = candidates.find((alias) => cols.some((col) => col.includes(alias)));
    if (match) {
      const actualCol = opts.feedColumns.find((c) => c.toLowerCase().includes(match));
      if (actualCol) result[req.id] = actualCol;
    }
  }

  return result;
}
