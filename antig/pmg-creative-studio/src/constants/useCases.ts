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
    // bold_typography_quick: #image1 #logo
    { id: 'bold_typography_quick', name: 'Quick Bold Hero', file: 'bold_typography_quick.html', adSize: 603, minRequirements: ['Logo', 'Image'] },
    // classic_social_retail: #background_test #image_background #logo
    { id: 'classic_social_retail', name: 'Classic Retail BG', file: 'classic_social_retail.html', adSize: 1024, minRequirements: ['Logo', 'Background Image'] },
    // clean_showcase_standard: #headline1 #image_1
    { id: 'clean_showcase_standard', name: 'Clean Headline Showcase', file: 'clean_showcase_standard.html', adSize: 1024, minRequirements: ['Image', 'Headline'] },
    // dual_lifestyle_focus: #background-image #callout #callout-container #image1 #image2 #logo
    { id: 'dual_lifestyle_focus', name: 'Dual Lifestyle + Callout', file: 'dual_lifestyle_focus.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Callout', 'Background Image'] },
    // editorial_brand_spotlight: #background_image #cta #fbg-logo #headline
    { id: 'editorial_brand_spotlight', name: 'Editorial Brand Spotlight', file: 'editorial_brand_spotlight.html', adSize: 1024, minRequirements: ['Logo', 'Headline', 'CTA', 'Background Image'] },
    // featured_list_grid: #image1 #image2 #logo #promo
    { id: 'featured_list_grid', name: 'Featured List Grid', file: 'featured_list_grid.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Promo'] },
    // geometric_design_system: #headline #logo
    { id: 'geometric_design_system', name: 'Geometric Brand Layout', file: 'geometric_design_system.html', adSize: 1080, minRequirements: ['Logo', 'Headline'] },
    // interactive_vibe_social: #image1 #image2 #logo
    { id: 'interactive_vibe_social', name: 'Vibe Duo Social', file: 'interactive_vibe_social.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2'] },
    // interior_design_grid: #headline #image1 #logo
    { id: 'interior_design_grid', name: 'Interior Design Grid', file: 'interior_design_grid.html', adSize: 433, minRequirements: ['Logo', 'Image', 'Headline'] },
    // masonry_style_showcase: #headline #logo
    { id: 'masonry_style_showcase', name: 'Masonry Showcase', file: 'masonry_style_showcase.html', adSize: 1024, minRequirements: ['Logo', 'Headline'] },
    // minimalist_retail_edge: #background-image #headline2
    { id: 'minimalist_retail_edge', name: 'Minimalist Retail Edge', file: 'minimalist_retail_edge.html', adSize: 1077, minRequirements: ['Headline', 'Background Image'] },
    // modern_minimal_showcase: #label #logo
    { id: 'modern_minimal_showcase', name: 'Modern Minimal Label', file: 'modern_minimal_showcase.html', adSize: 1080, minRequirements: ['Logo', 'Label'] },
    // new_arrivals_reveal: #background-image #logo
    { id: 'new_arrivals_reveal', name: 'New Arrivals Reveal', file: 'new_arrivals_reveal.html', adSize: 822, minRequirements: ['Logo', 'Background Image'] },
    // organic_shapes_editorial: #background_image #image1
    { id: 'organic_shapes_editorial', name: 'Organic Shapes Editorial', file: 'organic_shapes_editorial.html', adSize: 511, minRequirements: ['Image', 'Background Image'] },
    // split_dynamic_reveal: #background_asset #background_image #headline_1 #headline_2 #logo_1
    { id: 'split_dynamic_reveal', name: 'Split Dynamic Reveal', file: 'split_dynamic_reveal.html', adSize: 1024, minRequirements: ['Logo', 'Headline 1', 'Headline 2', 'Background Image'] },
    // promo_banner_vibrant: (no zone IDs)
    { id: 'promo_banner_vibrant', name: 'Promo Banner Vibrant', file: 'promo_banner_vibrant.html', adSize: 1024, minRequirements: [] },
    // original_2_copy: #image1 #logo #promo
    { id: 'original_2_v2', name: 'Hero + Promo Badge V2', file: 'original_2_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Promo'] },
    // original_3_copy: #headline #image1 #logo #promo
    { id: 'original_3_v2', name: 'Logo + Headline + Badge V2', file: 'original_3_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Headline', 'Promo'] },
    // original_4_copy: #cta #headline1 #headline2 #image1 #logo
    { id: 'original_4_v2', name: 'Text Left / Image Right V2', file: 'original_4_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Headline 1', 'Headline 2', 'CTA'] },
    // original_5_copy: #headline1 #image1 #logo
    { id: 'original_5_v2', name: 'Text Panel + Image V2', file: 'original_5_copy.html', adSize: 1080, minRequirements: ['Logo', 'Image', 'Headline'] },
    // original_6_copy: #background-image #double_image_1 #double_image_2 #logo
    { id: 'original_6_v2', name: 'Dual Portrait Gallery V2', file: 'original_6_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Background Image'] },
    // original_7_copy: #image_1_double #image_2_double #image_background #logo
    { id: 'original_7_v2', name: 'Side-by-Side Editorial V2', file: 'original_7_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Background Image'] },
    // original_8_copy: #background-image #callout #callout-container #image1 #image2 #logo
    { id: 'original_8_v2', name: 'Duo + Callout Bar V2', file: 'original_8_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Callout', 'Background Image'] },
    // original_9_copy: #headline1 #image_1 #logo
    { id: 'original_9_v2', name: 'Framed + Logo Box V2', file: 'original_9_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Headline'] },
    // original_11_copy: #image1 #image2 #logo #price-note #promo
    { id: 'original_11_v2', name: 'Split Duo + Copy Strip V2', file: 'original_11_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Promo', 'Price Note'] },
    // original_13a_copy: #headline #image1 #promo
    { id: 'original_13a_v2', name: 'Half BG / Half Product V2', file: 'original_13a_copy.html', adSize: 1024, minRequirements: ['Image', 'Headline', 'Promo'] },
    // original_13b_copy: #headline #image1 #image2 #promo
    { id: 'original_13b_v2', name: 'Dual Split + Text Bar V2', file: 'original_13b_copy.html', adSize: 1024, minRequirements: ['Image', 'Image 2', 'Headline', 'Promo'] },
    // original_14_copy: #headline1 #image1 #image2 #logo #promo
    { id: 'original_14_v2', name: 'Portrait Pair + Copy V2', file: 'original_14_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Headline', 'Promo'] },
    // original_15a_copy: #image_1 #image_2 #logo #tag
    { id: 'original_15a_v2', name: 'Duo + Center Tag V2', file: 'original_15a_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Image 2', 'Tag/Callout'] },
    // original_15b_copy: #image_3 #left-bar #logo_1 #tag
    { id: 'original_15b_v2', name: 'Sidebar + Hero Image V2', file: 'original_15b_copy.html', adSize: 1024, minRequirements: ['Logo', 'Image', 'Tag/Callout'] },
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
    elementTypes: { image: 1, text: 2, hasLogo: true, hasBackground: true, hasCTA: true, hasPrice: false },
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
  {
    id: 'bold_typography_quick',
    name: 'Quick Bold Hero',
    file: 'bold_typography_quick.html',
    adSize: 603,
    slots: ['image1', 'logo'],
    description: 'Compact bold-typography layout with a centered product image and logo lockup.',
    bestFor: 'Quick-turnaround brand posts, story-format placements, narrow canvas sizes.',
    elementTypes: { image: 1, text: 0, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'classic_social_retail',
    name: 'Classic Retail BG',
    file: 'classic_social_retail.html',
    adSize: 1024,
    slots: ['background_test', 'image_background', 'logo'],
    description: 'Classic retail layout with a full background image and logo overlay — clean and timeless.',
    bestFor: 'Retail brand awareness, seasonal campaigns, store-wide promotions.',
    elementTypes: { image: 0, text: 0, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'clean_showcase_standard',
    name: 'Clean Headline Showcase',
    file: 'clean_showcase_standard.html',
    adSize: 1024,
    slots: ['headline1', 'image_1'],
    description: 'Minimal layout pairing a single product image with a bold headline — no logo clutter.',
    bestFor: 'Awareness campaigns that lead with a message, product teaser announcements.',
    elementTypes: { image: 1, text: 1, hasLogo: false, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'dual_lifestyle_focus',
    name: 'Dual Lifestyle + Callout',
    file: 'dual_lifestyle_focus.html',
    adSize: 1024,
    slots: ['background-image', 'callout', 'callout-container', 'image1', 'image2', 'logo'],
    description: 'Two lifestyle images on a background with a prominent callout bar and logo.',
    bestFor: 'Lifestyle brand campaigns, "shop the look" ads, multi-product feature posts.',
    elementTypes: { image: 2, text: 1, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'editorial_brand_spotlight',
    name: 'Editorial Brand Spotlight',
    file: 'editorial_brand_spotlight.html',
    adSize: 1024,
    slots: ['background_image', 'cta', 'fbg-logo', 'headline'],
    description: 'Full-bleed background with a centered headline, CTA button, and logo — editorial and bold.',
    bestFor: 'Brand awareness campaigns, event promotions, launches with a strong call to action.',
    elementTypes: { image: 0, text: 2, hasLogo: true, hasBackground: true, hasCTA: true, hasPrice: false },
  },
  {
    id: 'featured_list_grid',
    name: 'Featured List Grid',
    file: 'featured_list_grid.html',
    adSize: 1024,
    slots: ['image1', 'image2', 'logo', 'promo'],
    description: 'Grid-style layout featuring two product images with a promo label and logo.',
    bestFor: 'Curated product collections, "Top Picks" lists, sale roundups.',
    elementTypes: { image: 2, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'geometric_design_system',
    name: 'Geometric Brand Layout',
    file: 'geometric_design_system.html',
    adSize: 1080,
    slots: ['headline', 'logo'],
    description: 'Geometric shapes frame a large headline and logo — type-driven, no product image required.',
    bestFor: 'Brand identity posts, announcement ads, design-forward campaigns.',
    elementTypes: { image: 0, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'interactive_vibe_social',
    name: 'Vibe Duo Social',
    file: 'interactive_vibe_social.html',
    adSize: 1024,
    slots: ['image1', 'image2', 'logo'],
    description: 'Two vibrant product images arranged for energy and motion with a logo accent.',
    bestFor: 'High-energy social posts, apparel drops, youth-oriented brand campaigns.',
    elementTypes: { image: 2, text: 0, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'interior_design_grid',
    name: 'Interior Design Grid',
    file: 'interior_design_grid.html',
    adSize: 433,
    slots: ['headline', 'image1', 'logo'],
    description: 'Grid-inspired narrow layout with a product image, headline, and logo — refined and structured.',
    bestFor: 'Home decor, interior design, and furniture brands targeting a premium audience.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'masonry_style_showcase',
    name: 'Masonry Showcase',
    file: 'masonry_style_showcase.html',
    adSize: 1024,
    slots: ['headline', 'logo'],
    description: 'Masonry-inspired layout with a dominant headline and logo — graphic, type-led design.',
    bestFor: 'Brand campaigns that lead with copy, editorial announcements, content marketing ads.',
    elementTypes: { image: 0, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'minimalist_retail_edge',
    name: 'Minimalist Retail Edge',
    file: 'minimalist_retail_edge.html',
    adSize: 1077,
    slots: ['background-image', 'headline2'],
    description: 'Edge-to-edge background image with a single crisp headline — stripped back and modern.',
    bestFor: 'Luxury retail, minimalist brand aesthetics, single-message awareness ads.',
    elementTypes: { image: 0, text: 1, hasLogo: false, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'modern_minimal_showcase',
    name: 'Modern Minimal Label',
    file: 'modern_minimal_showcase.html',
    adSize: 1080,
    slots: ['label', 'logo'],
    description: 'Ultra-minimal composition with just a label and logo — maximum white space, maximum brand.',
    bestFor: 'Premium brand posts, logo-forward awareness, minimal product teasers.',
    elementTypes: { image: 0, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'new_arrivals_reveal',
    name: 'New Arrivals Reveal',
    file: 'new_arrivals_reveal.html',
    adSize: 822,
    slots: ['background-image', 'logo'],
    description: 'Reveal-style layout with a background image and logo — built for new product unveils.',
    bestFor: '"New arrivals", product launches, seasonal collection reveals.',
    elementTypes: { image: 0, text: 0, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'organic_shapes_editorial',
    name: 'Organic Shapes Editorial',
    file: 'organic_shapes_editorial.html',
    adSize: 511,
    slots: ['background_image', 'image1'],
    description: 'Organic curved shapes overlay a product image on a textured background — soft and editorial.',
    bestFor: 'Beauty, wellness, lifestyle brands with a natural or artisanal feel.',
    elementTypes: { image: 1, text: 0, hasLogo: false, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'split_dynamic_reveal',
    name: 'Split Dynamic Reveal',
    file: 'split_dynamic_reveal.html',
    adSize: 1024,
    slots: ['background_asset', 'background_image', 'headline_1', 'headline_2', 'logo_1'],
    description: 'Dynamic split canvas with two headlines, logo, and layered background assets for depth.',
    bestFor: 'High-impact brand campaigns, event reveals, dual-message performance ads.',
    elementTypes: { image: 0, text: 2, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'promo_banner_vibrant',
    name: 'Promo Banner Vibrant',
    file: 'promo_banner_vibrant.html',
    adSize: 1024,
    slots: [],
    description: 'Vibrant solid-color promo banner with no slotted zones — purely decorative or motion-ready.',
    bestFor: 'Placeholder banners, animated background layers, non-personalized brand color blocks.',
    elementTypes: { image: 0, text: 0, hasLogo: false, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_2_v2',
    name: 'Hero + Promo Badge V2',
    file: 'original_2_copy.html',
    adSize: 1024,
    slots: ['image1', 'logo', 'promo'],
    description: 'Refreshed minimalist product image layout with a floating promo badge and logo.',
    bestFor: 'Sale or promo announcements with a single featured product — alternate color treatment.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_3_v2',
    name: 'Logo + Headline + Badge V2',
    file: 'original_3_copy.html',
    adSize: 1024,
    slots: ['headline', 'image1', 'logo', 'promo'],
    description: 'Updated bold headline + product image + promo badge layout with revised styling.',
    bestFor: 'Copy-forward campaigns, seasonal sale messaging — alternate visual treatment.',
    elementTypes: { image: 1, text: 2, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_4_v2',
    name: 'Text Left / Image Right V2',
    file: 'original_4_copy.html',
    adSize: 1024,
    slots: ['cta', 'headline1', 'headline2', 'image1', 'logo'],
    description: 'Updated split layout with two headlines, CTA, and product image — revised composition.',
    bestFor: 'Direct-response campaigns with two-headline copy and a strong CTA — alternate styling.',
    elementTypes: { image: 1, text: 2, hasLogo: true, hasBackground: false, hasCTA: true, hasPrice: false },
  },
  {
    id: 'original_5_v2',
    name: 'Text Panel + Image V2',
    file: 'original_5_copy.html',
    adSize: 1080,
    slots: ['headline1', 'image1', 'logo'],
    description: 'Refreshed modern text-panel layout with headline and product image — without background texture.',
    bestFor: 'Single headline brand campaigns, product launches — alternate clean treatment.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_6_v2',
    name: 'Dual Portrait Gallery V2',
    file: 'original_6_copy.html',
    adSize: 1024,
    slots: ['background-image', 'double_image_1', 'double_image_2', 'logo'],
    description: 'Revised dual portrait product layout with background and logo — refreshed spacing and color.',
    bestFor: 'Multi-product campaigns, paired product layouts — alternate visual treatment.',
    elementTypes: { image: 2, text: 0, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_7_v2',
    name: 'Side-by-Side Editorial V2',
    file: 'original_7_copy.html',
    adSize: 1024,
    slots: ['image_1_double', 'image_2_double', 'image_background', 'logo'],
    description: 'Updated editorial split with two equal product images and a textured background.',
    bestFor: 'Fashion, lifestyle, editorial brand campaigns — alternate color and spacing treatment.',
    elementTypes: { image: 2, text: 0, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_8_v2',
    name: 'Duo + Callout Bar V2',
    file: 'original_8_copy.html',
    adSize: 1024,
    slots: ['background-image', 'callout', 'callout-container', 'image1', 'image2', 'logo'],
    description: 'Refreshed two-product callout layout with revised background and callout bar styling.',
    bestFor: '"Featured collection", "Shop the Look" — alternate visual treatment.',
    elementTypes: { image: 2, text: 1, hasLogo: true, hasBackground: true, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_9_v2',
    name: 'Framed + Logo Box V2',
    file: 'original_9_copy.html',
    adSize: 1024,
    slots: ['headline1', 'image_1', 'logo'],
    description: 'Refreshed framed product showcase with headline and logo — cleaner, updated proportions.',
    bestFor: 'Premium single-product showcase — alternate minimal treatment.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_11_v2',
    name: 'Split Duo + Copy Strip V2',
    file: 'original_11_copy.html',
    adSize: 1024,
    slots: ['image1', 'image2', 'logo', 'price-note', 'promo'],
    description: 'Updated two-product split with promo label and price note — revised color and typography.',
    bestFor: 'Price-forward promotions, BOGO deals — alternate visual treatment.',
    elementTypes: { image: 2, text: 2, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: true },
  },
  {
    id: 'original_13a_v2',
    name: 'Half BG / Half Product V2',
    file: 'original_13a_copy.html',
    adSize: 1024,
    slots: ['headline', 'image1', 'promo'],
    description: 'Refreshed half-and-half layout with product image, headline, and promo — no background slot.',
    bestFor: 'Bold retail promotions without logo, high-energy campaigns — alternate treatment.',
    elementTypes: { image: 1, text: 2, hasLogo: false, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_13b_v2',
    name: 'Dual Split + Text Bar V2',
    file: 'original_13b_copy.html',
    adSize: 1024,
    slots: ['headline', 'image1', 'image2', 'promo'],
    description: 'Updated two-image horizontal split with headline and promo text bar — revised styling.',
    bestFor: 'High-energy performance ads, two products — alternate color and type treatment.',
    elementTypes: { image: 2, text: 2, hasLogo: false, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_14_v2',
    name: 'Portrait Pair + Copy V2',
    file: 'original_14_copy.html',
    adSize: 1024,
    slots: ['headline1', 'image1', 'image2', 'logo', 'promo'],
    description: 'Updated portrait-pair layout with headline, promo, and logo — no background slot.',
    bestFor: '"This + That" storytelling, editorial product narratives — alternate treatment.',
    elementTypes: { image: 2, text: 2, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_15a_v2',
    name: 'Duo + Center Tag V2',
    file: 'original_15a_copy.html',
    adSize: 1024,
    slots: ['image_1', 'image_2', 'logo', 'tag'],
    description: 'Refreshed two-product layout with a centered tag label and logo — updated color palette.',
    bestFor: 'Tech, gaming, consumer electronics — two products with a center label, alternate styling.',
    elementTypes: { image: 2, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
  {
    id: 'original_15b_v2',
    name: 'Sidebar + Hero Image V2',
    file: 'original_15b_copy.html',
    adSize: 1024,
    slots: ['image_3', 'left-bar', 'logo_1', 'tag'],
    description: 'Updated hero product image with sidebar accent, logo, and tag — revised proportions.',
    bestFor: 'Single product hero with brand accent color — alternate treatment for tech or fashion.',
    elementTypes: { image: 1, text: 1, hasLogo: true, hasBackground: false, hasCTA: false, hasPrice: false },
  },
];
