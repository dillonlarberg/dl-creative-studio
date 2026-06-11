/**
 * Shared constants for modular apps.
 *
 * `USE_CASES` and `PLATFORM_SIZES` were removed alongside the legacy
 * UseCaseWizardPage monolith — their only consumer.
 *
 * `SOCIAL_WIREFRAMES` is still consumed by the template-builder app
 * (`src/apps/template-builder/`).
 *
 * `AI_PROVIDERS` is consumed by `src/components/AIModelSelector.tsx`.
 */

export const AI_PROVIDERS = [
    {
        id: 'openai' as const,
        name: 'OpenAI',
        description: 'DALL-E & GPT-4o — high quality, versatile',
        capabilities: ['image-generation', 'image-editing', 'ai-review'],
    },
    {
        id: 'google' as const,
        name: 'Google AI',
        description: 'Imagen & Veo — fast, Google ecosystem',
        capabilities: ['image-generation', 'video-generation', 'ai-review'],
    },
    {
        id: 'stability' as const,
        name: 'Stability AI',
        description: 'Stable Diffusion — open source, customizable',
        capabilities: ['image-generation', 'image-editing'],
    },
];

export const SOCIAL_WIREFRAMES = [
    // original_1_copy: #logo #main-image #label
    { id: 'original_1', name: 'Full Bleed Hero', file: 'original_1_copy.html', adSize: 1080, minRequirements: ['Logo', 'Image', 'Promo Label'] },
    // minimalist_frame: #logo #image1 #promo
    { id: 'original_2', name: 'Hero + Promo Badge', file: 'minimalist_frame.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Promo'] },
    // bold_typography: #logo #image1 #headline #promo
    { id: 'original_3', name: 'Logo + Headline + Badge', file: 'bold_typography.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Headline', 'Promo'] },
    // interior_split: #logo #bg(background) #headline1 #headline2 #cta #image1
    { id: 'original_4', name: 'Text Left / Image Right', file: 'interior_split.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Headline 1', 'Headline 2', 'CTA', 'Background Image'] },
    // modern_reveal: #logo #bg(background) #headline1 #image1
    { id: 'original_5', name: 'Text Panel + Image', file: 'modern_reveal.html', adSize: 1080, minRequirements: ['Logo', 'Image', 'Headline', 'Background Image'] },
    // organic_shapes: #logo #background-image #double_image_1 #double_image_2
    { id: 'original_6', name: 'Dual Portrait Gallery', file: 'organic_shapes.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Background Image'] },
    // editorial_spotlight: #logo #image_background #image_1_double #image_2_double
    { id: 'original_7', name: 'Side-by-Side Editorial', file: 'editorial_spotlight.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Background Image'] },
    // featured_collection: #logo #background-image #image1 #image2 #callout
    { id: 'original_8', name: 'Duo + Callout Bar', file: 'featured_collection.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Callout', 'Background Image'] },
    // clean_showcase: #logo #image_1 #headline1
    { id: 'original_9', name: 'Framed + Logo Box', file: 'clean_showcase.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Headline'] },
    // dual_focus: #logo #background #image1 #image2 #promo #price-note
    { id: 'original_11', name: 'Split Duo + Copy Strip', file: 'dual_focus.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Promo', 'Price Note', 'Background Image'] },
    // vibrant_pulse_a: #bg #image1 #headline #promo (no logo)
    { id: 'original_13a', name: 'Half BG / Half Product', file: 'vibrant_pulse_a.html', adSize: 1024, minRequirements: ['Image', 'Background Image', 'Headline', 'Promo'] },
    // vibrant_pulse_b: #image1 #image2 #headline #promo (no logo, no bg)
    { id: 'original_13b', name: 'Dual Split + Text Bar', file: 'vibrant_pulse_b.html', adSize: 1024, minRequirements: ['Image', 'Image 2', 'Headline', 'Promo'] },
    // mosaic_narrative: #logo #background #image1 #image2 #headline1 #promo
    { id: 'original_14', name: 'Portrait Pair + Copy', file: 'mosaic_narrative.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Headline', 'Promo', 'Background Image'] },
    // techno_vibe_a: #logo #image_1 #image_2 #tag
    { id: 'original_15a', name: 'Duo + Center Tag', file: 'techno_vibe_a.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Tag/Callout'] },
    // techno_vibe_b: #logo_1 #image_3 #left-bar #tag
    { id: 'original_15b', name: 'Sidebar + Hero Image', file: 'techno_vibe_b.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Tag/Callout'] },
];

export interface WireframeCatalogEntry {
  id: string;
  name: string;
  file: string;
  adSize: number;
  slots: string[];
  description: string;
  bestFor: string;
  elementTypes: {
    image: number;
    text: number;
    hasLogo: boolean;
    hasBackground: boolean;
    hasCTA: boolean;
    hasPrice: boolean;
  };
}

export const WIREFRAME_CATALOG: WireframeCatalogEntry[] = [
  {
    id: 'original_1',
    name: 'Full Bleed Hero',
    file: 'original_1_copy.html',
    adSize: 1080,
    slots: ['main-image', 'logo', 'label'],
    description: 'Full-bleed product image fills the entire frame. Logo at top, promo label at bottom.',
    bestFor: 'Brand awareness, hero product shots, lifestyle imagery where the image IS the message.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_2',
    name: 'Hero + Promo Badge',
    file: 'minimalist_frame.html',
    adSize: 1024,
    slots: ['logo', 'image1', 'promo'],
    description: 'Minimalist centered product image with a floating promo badge and logo.',
    bestFor: 'Sale or promo announcements with a single featured product.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_3',
    name: 'Logo + Headline + Badge',
    file: 'bold_typography.html',
    adSize: 1024,
    slots: ['logo', 'image1', 'headline', 'promo'],
    description: 'Bold headline sits over the product image with a promo badge below. Copy-led design.',
    bestFor: 'Copy-forward campaigns, seasonal sale messaging, when the headline drives the click.',
    elementTypes: { image: 1, text: 2, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_4',
    name: 'Text Left / Image Right',
    file: 'interior_split.html',
    adSize: 1024,
    slots: ['logo', 'background', 'headline1', 'headline2', 'cta', 'image1'],
    description: 'Split layout: two headlines + CTA on left panel, product image on right.',
    bestFor: 'Direct-response campaigns with a strong CTA, two-headline copy.',
    elementTypes: { image: 1, text: 3, hasLogo: true, hasBackground: true, hasCTA: true, hasPrice: false },
  },
  {
    id: 'original_5',
    name: 'Text Panel + Image',
    file: 'modern_reveal.html',
    adSize: 1080,
    slots: ['logo', 'background', 'headline1', 'image1'],
    description: 'Modern layout with a text panel overlaid on the product image and a background texture.',
    bestFor: 'Single headline brand campaigns, product launches, premium/luxury feel.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_6',
    name: 'Dual Portrait Gallery',
    file: 'organic_shapes.html',
    adSize: 1024,
    slots: ['logo', 'background-image', 'double_image_1', 'double_image_2'],
    description: 'Two portrait product images side-by-side on a background with logo.',
    bestFor: 'Multi-product campaigns, "shop the collection", paired product layouts.',
    elementTypes: { image: 2, text: 0, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_7',
    name: 'Side-by-Side Editorial',
    file: 'editorial_spotlight.html',
    adSize: 1024,
    slots: ['logo', 'image_background', 'image_1_double', 'image_2_double'],
    description: 'Editorial split — two equal product images with a textured background. No text overlay.',
    bestFor: 'Fashion, lifestyle, editorial brand campaigns with two hero products.',
    elementTypes: { image: 2, text: 0, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_8',
    name: 'Duo + Callout Bar',
    file: 'featured_collection.html',
    adSize: 1024,
    slots: ['logo', 'background-image', 'image1', 'image2', 'callout'],
    description: 'Two product images with a callout bar across the bottom and logo.',
    bestFor: '"Featured collection", "Shop the Look", paired product promotions.',
    elementTypes: { image: 2, text: 1, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_9',
    name: 'Framed + Logo Box',
    file: 'clean_showcase.html',
    adSize: 1024,
    slots: ['logo', 'image_1', 'headline1'],
    description: 'Clean framed product image with a logo lockup and headline. Minimal, precise.',
    bestFor: 'Premium single-product showcase, luxury brand advertising.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_11',
    name: 'Split Duo + Copy Strip',
    file: 'dual_focus.html',
    adSize: 1024,
    slots: ['logo', 'background', 'image1', 'image2', 'promo', 'price-note'],
    description: 'Two product images split vertically with promo label and price note strip.',
    bestFor: 'Price-forward promotions, BOGO deals, competitive price messaging.',
    elementTypes: { image: 2, text: 2, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: true },
  },
  {
    id: 'original_13a',
    name: 'Half BG / Half Product',
    file: 'vibrant_pulse_a.html',
    adSize: 1024,
    slots: ['bg', 'image1', 'headline', 'promo'],
    description: 'Background color fills half the frame, product image fills the other half.',
    bestFor: 'Bold retail promotions without brand logo, high-energy performance campaigns.',
    elementTypes: { image: 1, text: 2, hasLogo: false, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_13b',
    name: 'Dual Split + Text Bar',
    file: 'vibrant_pulse_b.html',
    adSize: 1024,
    slots: ['image1', 'image2', 'headline', 'promo'],
    description: 'Two images split horizontally with headline and promo text bar. No logo, no background.',
    bestFor: 'High-energy performance ads, two products, minimal branding required.',
    elementTypes: { image: 2, text: 2, hasLogo: false, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_14',
    name: 'Portrait Pair + Copy',
    file: 'mosaic_narrative.html',
    adSize: 1024,
    slots: ['logo', 'background', 'image1', 'image2', 'headline1', 'promo'],
    description: 'Two portrait product images with headline, promo copy, and logo on a background.',
    bestFor: '"This + That" comparisons, storytelling campaigns, editorial product narratives.',
    elementTypes: { image: 2, text: 2, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_15a',
    name: 'Duo + Center Tag',
    file: 'techno_vibe_a.html',
    adSize: 1024,
    slots: ['logo', 'image_1', 'image_2', 'tag'],
    description: 'Two product images with a centered tag/callout label and logo. Bold, modern.',
    bestFor: 'Tech, gaming, consumer electronics — two products with a punchy center label.',
    elementTypes: { image: 2, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_15b',
    name: 'Sidebar + Hero Image',
    file: 'techno_vibe_b.html',
    adSize: 1024,
    slots: ['logo_1', 'image_3', 'left-bar', 'tag'],
    description: 'Hero product image with a colored sidebar accent bar, logo, and tag label.',
    bestFor: 'Single product hero with strong brand accent color, tech or fashion verticals.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
];
