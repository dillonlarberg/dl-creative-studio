import type { UseCase } from '../types';

export const USE_CASES: UseCase[] = [
    {
        id: 'image-resize',
        title: 'Resize Image',
        description: 'Resize and reformat existing images for different ad placements and platforms.',
        icon: 'ArrowsPointingOutIcon',
        entryPaths: ['create-new', 'optimize-existing'],
        outputFormats: ['jpeg', 'png'],
    },
    {
        id: 'edit-image',
        title: 'Edit Existing Image',
        description: 'Modify existing campaign images using AI — update backgrounds, colors, elements, and more.',
        icon: 'PaintBrushIcon',
        entryPaths: ['create-new', 'optimize-existing'],
        outputFormats: ['jpeg', 'png'],
    },
    {
        id: 'new-image',
        title: 'Generate New Image',
        description: 'Create brand-new static creative from a text description using AI image generation.',
        icon: 'SparklesIcon',
        entryPaths: ['create-new'],
        outputFormats: ['jpeg', 'png'],
        requiresBrandStandards: true,
    },
    {
        id: 'edit-video',
        title: 'Edit Existing Video',
        description: 'Trim, resize, add overlays, or adjust existing video creative.',
        icon: 'FilmIcon',
        entryPaths: ['create-new', 'optimize-existing'],
        outputFormats: ['mp4'],
    },
    {
        id: 'new-video',
        title: 'Generate New Video',
        description: 'Create brand-new video content using AI video generation.',
        icon: 'VideoCameraIcon',
        entryPaths: ['create-new'],
        outputFormats: ['mp4'],
        requiresBrandStandards: true,
    },
    {
        id: 'video-cutdown',
        title: 'Video Cutdown',
        description: 'Upload a video and get AI-recommended cutdowns (15s, 30s, etc.) with automated stitching.',
        icon: 'ScissorsIcon',
        entryPaths: ['create-new', 'optimize-existing'],
        outputFormats: ['mp4'],
    },
    {
        id: 'template-builder',
        title: 'Dynamic Template Builder',
        description: 'Create or edit HTML templates for dynamic product ads — connect to product feeds and preview.',
        icon: 'RectangleGroupIcon',
        entryPaths: ['create-new'],
        outputFormats: ['html', 'jpeg'],
        requiresBrandStandards: true,
    },
    {
        id: 'feed-processing',
        title: 'Process Product Feed',
        description: 'Apply a template to an entire product feed — batch generate styled product images.',
        icon: 'CpuChipIcon',
        entryPaths: ['create-new'],
        outputFormats: ['jpeg'],
        requiresBrandStandards: true,
    },
];

export const PLATFORM_SIZES = [
    { name: 'Meta Feed (1080×1080)', width: 1080, height: 1080 },
    { name: 'Meta Story (1080×1920)', width: 1080, height: 1920 },
    { name: 'Google Display (1200×628)', width: 1200, height: 628 },
    { name: 'Google Display (300×250)', width: 300, height: 250 },
    { name: 'Google Display (728×90)', width: 728, height: 90 },
    { name: 'Google Display (160×600)', width: 160, height: 600 },
    { name: 'Pinterest Pin (1000×1500)', width: 1000, height: 1500 },
    { name: 'TikTok/Reels (1080×1920)', width: 1080, height: 1920 },
    { name: 'YouTube Thumbnail (1280×720)', width: 1280, height: 720 },
    { name: 'Custom', width: 0, height: 0 },
];

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
