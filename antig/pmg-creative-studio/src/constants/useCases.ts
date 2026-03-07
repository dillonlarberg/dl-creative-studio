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
