import { useParams, Link } from 'react-router-dom';
import { USE_CASES, SOCIAL_WIREFRAMES } from '../../constants/useCases';
import { cn } from '../../utils/cn';
import { CheckIcon, ArrowLeftIcon, ArrowPathIcon, SparklesIcon, TrashIcon, PhotoIcon, CloudArrowUpIcon, CircleStackIcon, MagnifyingGlassIcon, ArrowRightIcon, CheckCircleIcon, ExclamationTriangleIcon, ChevronLeftIcon, ChevronRightIcon, RectangleGroupIcon } from '@heroicons/react/24/outline';
import { Dialog, Transition, TransitionChild, DialogPanel, DialogTitle } from '@headlessui/react';
import { useState, useEffect, useRef, Fragment } from 'react';
import type { UseCaseId, CreativeAsset } from '../../types';
import { clientAssetHouseService } from '../../services/clientAssetHouse';
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import { creativeService } from '../../services/creative';
import type { CreativeRecord } from '../../services/creative';
import { videoService } from '../../services/videoService';
import { alliService } from '../../services/alli';
import { storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { templateService } from '../../services/templates';
import type { TemplateRecord } from '../../services/templates';
import { batchService } from '../../services/batches';
import { EditImageWizard } from '../../components/edit-image/EditImageWizard';

const fallbackLogo = "https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png"; // temporary fallback

// edit-image: Recursively strip undefined values and non-serializable objects
// (e.g. File) before saving to Firestore, which rejects them.
const sanitizeForFirestore = (obj: Record<string, any>): Record<string, any> =>
    Object.fromEntries(
        Object.entries(obj)
            .filter(([, v]) => v !== undefined && !(v instanceof File))
            .map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? sanitizeForFirestore(v) : v])
    );

// ---------------------------------------------------------------------------
// TemplatePreview
// Module-level (outside the wizard component) so it is NEVER re-created on
// state changes → iframes never reload when e.g. a size button is clicked.
//
// Rendering strategy:
//   • iframe is rendered at FULL adSize (e.g. 1024×1024)
//     → browser fetches images at their native resolution  (no pixelation)
//   • A CSS transform: scale() on the outer wrapper shrinks it to clipSize
//     → pure GPU compositing, no quality loss
// ---------------------------------------------------------------------------
const TemplatePreview = ({ templateFile, name, scale = 0.20, adSize = 1024 }: {
    templateFile: string;
    name: string;
    scale?: number;
    adSize?: number;
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [loaded, setLoaded] = useState(false);
    const clipSize = Math.round(adSize * scale);

    const handleLoad = () => {
        setLoaded(true);
    };

    return (
        // Outer box: the clipped, visible size
        <div style={{
            width: `${clipSize}px`,
            height: `${clipSize}px`,
            overflow: 'hidden',
            borderRadius: '4px',
            position: 'relative',
            flexShrink: 0,
            background: '#f3f4f6',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.07)',
        }}>
            {/* Shimmer skeleton while loading */}
            {!loaded && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                    zIndex: 2,
                }} />
            )}
            {/* Inner scaler: full adSize, CSS-transform-scaled down */}
            <div style={{
                width: `${adSize}px`,
                height: `${adSize}px`,
                transformOrigin: 'top left',
                transform: `scale(${scale})`,
                opacity: loaded ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }}>
                <iframe
                    ref={iframeRef}
                    src={`/template_examples/social/${templateFile}`}
                    onLoad={handleLoad}
                    loading="lazy"
                    style={{
                        width: `${adSize}px`,
                        height: `${adSize}px`,
                        border: 'none',
                        pointerEvents: 'none',
                        display: 'block',
                    }}
                    title={name}
                    scrolling="no"
                />
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// FilledTemplatePreview
// Same scaling strategy as TemplatePreview, but fetches the HTML source,
// injects real mapped values (images + text) by element-ID matching, then
// renders the modified HTML via `srcdoc` so the Pokémon placeholders are
// replaced with actual creative data.
// ---------------------------------------------------------------------------

// Maps a field requirement label/id to a list of element IDs to try (in priority order).
const FIELD_ID_MAP: Record<string, { type: 'image' | 'text'; targets: string[] }> = {
    // ---- image fields ----
    image: { type: 'image', targets: ['image1', 'image_1', 'singe-image-1', 'image_1_single', 'double_image_1', 'image_1_double', 'main-image', 'image_3'] },
    image_url: { type: 'image', targets: ['image1', 'image_1', 'double_image_1', 'main-image', 'image_3'] },
    image_2: { type: 'image', targets: ['image2', 'image_2', 'double_image_2', 'image_2_double', 'image_1_double'] },
    background_image: { type: 'image', targets: ['background-image', 'image_background', 'background_image', 'bg', 'background_asset', 'background_test'] },
    background: { type: 'image', targets: ['background-image', 'image_background', 'bg', 'background'] },
    logo: { type: 'image', targets: ['logo', 'logo_1', 'logo_2', 'fbg-logo'] },
    // ---- text fields ----
    headline: { type: 'text', targets: ['headline', 'headline1', 'headline2', 'tag', 'callout', 'promo', 'label'] },
    headline_1: { type: 'text', targets: ['headline1', 'headline', 'headline_1'] },
    headline_2: { type: 'text', targets: ['headline2', 'headline_2'] },
    callout: { type: 'text', targets: ['callout', 'tag', 'promo', 'label'] },
    tag: { type: 'text', targets: ['tag', 'callout', 'label'] },
    tag_callout: { type: 'text', targets: ['tag', 'callout', 'label', 'promo'] },
    promo: { type: 'text', targets: ['promo', 'label', 'callout', 'tag'] },
    promo_label: { type: 'text', targets: ['promo', 'label', 'callout'] },
    label: { type: 'text', targets: ['label', 'promo', 'callout'] },
    cta: { type: 'text', targets: ['cta', 'promo', 'label'] },
    price: { type: 'text', targets: ['price', 'price-note', 'promo', 'label'] },
    price_note: { type: 'text', targets: ['price-note', 'promo'] },
    callout_text: { type: 'text', targets: ['callout', 'tag', 'label'] },
};

// CSS property injections keyed by fieldId/semantic name.
// These apply via a <style> block override so they work even on non-id'd elements.
const CSS_INJECTION_MAP: Record<string, { selector: string; property: string }[]> = {
    background_color: [
        { selector: '#ad', property: 'background-color' },
        { selector: '#base', property: 'background-color' },
        { selector: '#bg', property: 'background-color' },
        { selector: '#background', property: 'background-color' },
        { selector: '#left', property: 'background-color' },
    ],
    accent_color: [
        { selector: '#callout-container', property: 'background-color' },
        { selector: '#promo', property: 'background-color' },
        { selector: '#label', property: 'background-color' },
        { selector: '#tag', property: 'background-color' },
        { selector: '#left-bar', property: 'background-color' },
        { selector: '#logo-group', property: 'background-color' },
    ],
    text_color: [
        { selector: '#headline', property: 'color' },
        { selector: '#headline1', property: 'color' },
        { selector: '#headline2', property: 'color' },
        { selector: '#callout', property: 'color' },
        { selector: '#promo', property: 'color' },
        { selector: '#tag', property: 'color' },
        { selector: '#label', property: 'color' },
        { selector: '#cta', property: 'color' },
    ],
    font_family: [
        { selector: '#headline', property: 'font-family' },
        { selector: '#headline1', property: 'font-family' },
        { selector: '#headline2', property: 'font-family' },
        { selector: '#callout', property: 'font-family' },
        { selector: '#promo', property: 'font-family' },
        { selector: '#tag', property: 'font-family' },
        { selector: '#label', property: 'font-family' },
        { selector: '#cta', property: 'font-family' },
        { selector: 'body', property: 'font-family' },
    ],
};

function injectIntoHtml(
    html: string,
    injections: Record<string, { type: 'image' | 'text'; value: string }>,
    cssOverrides?: Record<string, string>, // e.g. { background_color: '#ff0000', accent_color: '#ffcb05' }
): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // --- Element-level injections (img src, textContent) ---
    for (const [fieldId, { type, value }] of Object.entries(injections)) {
        if (!value) continue;

        const lowerField = fieldId.toLowerCase();
        let targetIds: string[] = [];

        if (FIELD_ID_MAP[lowerField]) {
            targetIds = FIELD_ID_MAP[lowerField].targets;
        } else {
            for (const [key, mapping] of Object.entries(FIELD_ID_MAP)) {
                if (lowerField.includes(key) || key.includes(lowerField)) {
                    targetIds = mapping.targets;
                    break;
                }
            }
        }

        for (const tid of targetIds) {
            const el = doc.querySelector(`#${tid}`) ||
                doc.querySelector(`[id*="${tid}"]`) as HTMLElement | null;
            if (!el) continue;

            if (type === 'image') {
                (el as HTMLImageElement).src = value;
                el.removeAttribute('srcset');
            } else {
                el.textContent = value;
            }
            break;
        }
    }

    // --- CSS-level overrides (colors, etc.) ---
    if (cssOverrides && Object.keys(cssOverrides).length > 0) {
        let styleRules = '';
        for (const [key, val] of Object.entries(cssOverrides)) {
            if (!val) continue;
            const rules = CSS_INJECTION_MAP[key];
            if (!rules) continue;
            for (const { selector, property } of rules) {
                // Only apply if the element actually exists in this template
                if (doc.querySelector(selector)) {
                    styleRules += `${selector} { ${property}: ${val} !important; }\n`;
                }
            }
        }
        if (styleRules) {
            const styleEl = doc.createElement('style');
            styleEl.id = '__dynamic-overrides__';
            styleEl.textContent = styleRules;
            doc.head.appendChild(styleEl);
        }
    }

    return new XMLSerializer().serializeToString(doc);
}

const FilledTemplatePreview = ({
    templateFile,
    name,
    scale = 0.30,
    adSize = 1024,
    injections,
    cssOverrides,
}: {
    templateFile: string;
    name: string;
    scale?: number;
    adSize?: number;
    injections: Record<string, { type: 'image' | 'text'; value: string }>;
    cssOverrides?: Record<string, string>;
}) => {
    const [srcdoc, setSrcdoc] = useState<string>('');
    const [loaded, setLoaded] = useState(false);
    const clipSize = Math.round(adSize * scale);

    useEffect(() => {
        setLoaded(false);
        setSrcdoc('');
        fetch(`/template_examples/social/${templateFile}`)
            .then(r => r.text())
            .then(html => {
                const filled = injectIntoHtml(html, injections, cssOverrides);
                setSrcdoc(filled);
            })
            .catch(err => console.error('[FilledTemplatePreview] fetch error:', err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateFile, JSON.stringify(injections), JSON.stringify(cssOverrides)]);

    return (
        <div style={{
            width: `${clipSize}px`,
            height: `${clipSize}px`,
            overflow: 'hidden',
            borderRadius: '4px',
            position: 'relative',
            flexShrink: 0,
            background: '#f3f4f6',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.07)',
        }}>
            {!loaded && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                    zIndex: 2,
                }} />
            )}
            <div style={{
                width: `${adSize}px`,
                height: `${adSize}px`,
                transformOrigin: 'top left',
                transform: `scale(${scale})`,
                opacity: loaded ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }}>
                {srcdoc && (
                    <iframe
                        srcDoc={srcdoc}
                        onLoad={() => setLoaded(true)}
                        style={{
                            width: `${adSize}px`,
                            height: `${adSize}px`,
                            border: 'none',
                            pointerEvents: 'none',
                            display: 'block',
                        }}
                        title={name}
                        scrolling="no"
                        sandbox="allow-same-origin"
                    />
                )}
            </div>
        </div>
    );
};
// use useState+useRef inside module-level component requires that import to stay in the component
// (already imported at top level as part of react – this is fine)

const BASELINE_ASSETS = {
    headline1: "Who's That Pokémon?",
    cta: "Guess Now",
    promo: "It's Pikachu",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/International_Pok%C3%A9mon_logo.svg/3840px-International_Pok%C3%A9mon_logo.svg.png",
    image1: "https://pngimg.com/uploads/pikachu/pikachu_PNG17.png",
    image2: "https://pngimg.com/uploads/pikachu/pikachu_PNG19.png",
    backgroundimage: "https://img.freepik.com/free-vector/flat-comic-style-background_23-2148818641.jpg?t=st=1772950532~exp=1772954132~hmac=5971caf3596a6cee4f69d4e25e5c005a00a634a7f3cd3db4566a0b961d35c059&w=2000",
    font: "https://firebasestorage.googleapis.com/v0/b/automated-creative-e10d7.firebasestorage.app/o/clients%2Fstrategy%2Fassets%2Ffont%2FPPRightGrotesk-WideBold.otf?alt=media&token=dea7ebfb-8609-49e7-bec9-20290a869128",
    background_color: "#e9e4de",
    cta_button_color: "#ffcb05",
    headline_color: "#3c5aa6"
};

// Wizard step definitions per use case
const WIZARD_STEPS: Record<UseCaseId, { id: string; name: string }[]> = {
    'image-resize': [
        { id: 'upload', name: 'Select Image' },
        { id: 'sizes', name: 'Choose Sizes' },
        { id: 'preview', name: 'Preview' },
        { id: 'approve', name: 'Approve & Download' },
    ],
    'edit-image': [
        { id: 'select', name: 'Select Image' },
        { id: 'edit-type', name: 'Edit Type' },
        { id: 'canvas', name: 'Canvas' },
        { id: 'new-background', name: 'New Background' },
        { id: 'preview', name: 'Preview' },
        { id: 'approve', name: 'Save' },
    ],
    'new-image': [
        { id: 'brief', name: 'Creative Brief' },
        { id: 'context', name: 'Brand Context' },
        { id: 'model', name: 'Choose AI Model' },
        { id: 'generate', name: 'Generate & Review' },
        { id: 'sizes', name: 'Select Sizes' },
        { id: 'approve', name: 'Approve & Download' },
    ],
    'edit-video': [
        { id: 'select', name: 'Select Video' },
        { id: 'edit-type', name: 'Choose Edit Type' },
        { id: 'configure', name: 'Configure Edit' },
        { id: 'preview', name: 'Preview' },
        { id: 'approve', name: 'Approve & Download' },
    ],
    'new-video': [
        { id: 'brief', name: 'Creative Brief' },
        { id: 'model', name: 'Choose AI Model' },
        { id: 'generate', name: 'Generate & Preview' },
        { id: 'approve', name: 'Approve & Download' },
    ],
    'video-cutdown': [
        { id: 'upload', name: 'Upload Video' },
        { id: 'configure', name: 'Select Lengths' },
        { id: 'ai-reccos', name: 'AI Recommendations' },
        { id: 'process', name: 'Format & Stitch' },
        { id: 'download', name: 'Download' },
    ],
    'static-creative': [
        { id: 'dimensions', name: 'Select Sizes' },
        { id: 'strategy', name: 'Content Strategy' },
        { id: 'inputs', name: 'Creative Inputs' },
        { id: 'preview', name: 'Preview & Layout' },
        { id: 'approve', name: 'Approve & Download' },
    ],
    'template-builder': [
        { id: 'context', name: 'Define Context' },
        { id: 'intent', name: 'Define Intent' },
        { id: 'source', name: 'Connect Data' },
        { id: 'mapping', name: 'Map Fields' },
        { id: 'generate', name: 'Generate Candidates' },
        { id: 'refine', name: 'Refine Design' },
        { id: 'export', name: 'Batch & Export' },
    ],
    'feed-processing': [
        { id: 'template', name: 'Select Template' },
        { id: 'feed', name: 'Select Feed' },
        { id: 'preview', name: 'Preview Batch' },
        { id: 'generate', name: 'Generate All' },
        { id: 'download', name: 'Download' },
    ],
};

const MODEL_MAPPING: Record<string, string> = {
    'Gemini 3 Flash Preview': 'gemini-3-flash-preview',
};

export default function UseCaseWizardPage() {
    const { useCaseId } = useParams<{ useCaseId: string }>();
    const useCase = USE_CASES.find((uc) => uc.id === useCaseId);
    const [currentStep, setCurrentStep] = useState(0);
    const [assetHouse, setAssetHouse] = useState<ClientAssetHouse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [creativeId, setCreativeId] = useState<string | null>(null);
    const [creative, setCreative] = useState<CreativeRecord | null>(null);
    const [stepData, setStepData] = useState<Record<string, any>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [history, setHistory] = useState<CreativeRecord[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [videoSource, setVideoSource] = useState<'upload' | 'alli'>('alli');
    const [alliAssets, setAlliAssets] = useState<CreativeAsset[]>([]);
    const [assetDurations, setAssetDurations] = useState<Record<string, number>>({});
    const [platforms, setPlatforms] = useState<string[]>([]);
    const [platformFilter, setPlatformFilter] = useState('all');
    const [isFetchingAssets, setIsFetchingAssets] = useState(false);
    const [assetPage, setAssetPage] = useState(1);

    // -- Template Builder State --
    const [dataSources, setDataSources] = useState<any[]>([]);
    const [isFetchingFeeds, setIsFetchingFeeds] = useState(false);
    const [selectedFeed, setSelectedFeed] = useState<any | null>(null);
    const [feedSampleData, setFeedSampleData] = useState<any[]>([]);
    const [feedMetadata, setFeedMetadata] = useState<any>(null);
    const [feedMappings, setFeedMappings] = useState<Record<string, string>>({});
    const [candidates, setCandidates] = useState<any[]>([]);
    const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
    const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
    const [isGeneratingCandidates, setIsGeneratingCandidates] = useState(false);
    const [isFeedModalOpen, setIsFeedModalOpen] = useState(false);
    const [savedTemplates, setSavedTemplates] = useState<TemplateRecord[]>([]);
    const [requirements, setRequirements] = useState<any[]>([]);
    const [isAnalyzingIntent, setIsAnalyzingIntent] = useState(false);
    const [areRequirementsApproved, setAreRequirementsApproved] = useState(false);
    const [feedListError, setFeedListError] = useState<string | null>(null);
    const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
    const [textStressTest, setTextStressTest] = useState<'normal' | 'shortest' | 'longest'>('normal');
    const [logoScale, setLogoScale] = useState(1);
    const [logoVariant, setLogoVariant] = useState<'primary' | 'inverse'>('primary');
    const [headlineSize, setHeadlineSize] = useState(1);
    const [priceSize, setPriceSize] = useState(1);

    const [selectedWireframe, setSelectedWireframe] = useState<any | null>(null);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);

    // TemplatePreview is now a module-level component (defined above) — no per-render re-creation.

    const getDeepValue = (key: string) => {
        if (!key || !feedSampleData[currentFeedIndex]) return '';
        if (textStressTest === 'normal') return feedSampleData[currentFeedIndex][key] || '';
        return stepData.stressMap?.[textStressTest]?.[key] || feedSampleData[currentFeedIndex][key] || '';
    };

    // ----------------------------

    const ITEMS_PER_PAGE = 16; // 4 columns × 4 rows

    const client = JSON.parse(localStorage.getItem('selectedClient') || '{}');

    // Move steps definition up so handleNext can use it
    const steps = WIZARD_STEPS[useCaseId as UseCaseId] || [];

    useEffect(() => {
        if (client.slug) {
            fetchStatus();
            if (useCaseId === 'template-builder') {
                fetchTemplates();
                fetchDataSources();
                // Load Asset House for branding
                clientAssetHouseService.getAssetHouse(client.slug).then(house => {
                    if (house) setAssetHouse(house);
                });
            }
        }
    }, [client.slug, useCaseId]);

    const fetchTemplates = async () => {
        if (!client.slug) return;
        try {
            const list = await templateService.getTemplates(client.slug);
            setSavedTemplates(list);
        } catch (err) {
            console.error('Failed to fetch templates:', err);
        }
    };

    // Fetch Alli assets if source is 'alli'
    useEffect(() => {
        if (videoSource === 'alli' && client.slug && alliAssets.length === 0) {
            fetchAlliAssets();
        }
    }, [videoSource, client.slug]);

    const fetchAlliAssets = async () => {
        setIsFetchingAssets(true);
        try {
            const assets = await alliService.getCreativeAssets(client.slug);
            const videos = assets.filter(a => a.type === 'video');
            setAlliAssets(videos);

            // Extract unique platforms
            const uniquePlatforms = Array.from(new Set(videos.map(v => v.platform).filter(Boolean))) as string[];
            setPlatforms(uniquePlatforms);
        } catch (err) {
            console.error('[Alli-Assets] Fetch failed:', err);
        } finally {
            setIsFetchingAssets(false);
        }
    };

    const analyzeCreativeIntent = async () => {
        setIsAnalyzingIntent(true);
        setAreRequirementsApproved(false);
        try {
            await new Promise(r => setTimeout(r, 1200));

            // If we have a wireframe, we pull requirements from its known schema
            if (stepData.selectedWireframe) {
                const identified = [
                    { id: 'headline', label: 'Dynamic Headline', category: 'Dynamic', source: 'Locked', type: 'text', value: BASELINE_ASSETS.headline1 },
                    { id: 'cta', label: 'Interactive CTA', category: 'System', source: 'Locked', type: 'button', value: BASELINE_ASSETS.cta },
                    { id: 'promo', label: 'Promo Callout', category: 'Dynamic', source: 'Locked', type: 'text', value: BASELINE_ASSETS.promo },
                    { id: 'image1', label: 'Primary Creative', category: 'Dynamic', source: 'Locked', type: 'image', value: BASELINE_ASSETS.image1 },
                    { id: 'image2', label: 'Secondary Creative', category: 'Dynamic', source: 'Locked', type: 'image', value: BASELINE_ASSETS.image2 },
                    { id: 'logo', label: 'Brand Logo', category: 'Brand', source: 'Locked', type: 'asset', value: BASELINE_ASSETS.logo },
                    { id: 'styles', label: 'Brand Style Tokens', category: 'Brand', source: 'Locked', type: 'style', value: 'Theme: PMG Hiring' }
                ];
                setRequirements(identified);
                setAreRequirementsApproved(true);
                return;
            }

            if (!stepData.prompt) return;
            // ... existing AI logic
            const prompt = stepData.prompt.toLowerCase();
            const hasReccoKeywords = prompt.includes('recommend') || prompt.includes('suggest') || prompt.includes('not sure') || prompt.length < 15;

            let identified: any[] = [];

            // Dynamic Mapping
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

            // Brand & System
            if (prompt.includes('logo') || prompt.includes('brand') || hasReccoKeywords) {
                identified.push({ id: 'logo', label: 'Brand Logo', category: 'Brand', source: 'Creative House', type: 'asset' });
            }
            if (prompt.includes('cta') || prompt.includes('button') || hasReccoKeywords) {
                identified.push({ id: 'cta', label: 'Interactive CTA', category: 'System', source: 'User Preset', type: 'button' });
            }

            // Fallback for extremely specific but unrecognized input
            if (identified.length === 0) {
                identified.push({ id: 'custom_slot', label: 'Dynamic Content Slot', category: 'Dynamic', source: 'Feed', type: 'text' });
            }

            setRequirements(identified);
        } catch (err) {
            console.error('Intent analysis failed:', err);
            alert('AI failed to synthesize requirements. Please try again.');
        } finally {
            setIsAnalyzingIntent(false);
        }
    };

    const handleAddCustomRequirement = () => {
        const label = prompt("Enter the name of the dynamic field (e.g. 'Promo Code', 'Disclaimer'):");
        if (!label) return;

        const newReq = {
            id: `custom_${Date.now()}`,
            label,
            category: 'Dynamic',
            source: 'Feed',
            type: 'text'
        };
        setRequirements(prev => [...prev, newReq]);
    };

    const handleRemoveRequirement = (id: string) => {
        setRequirements(prev => prev.filter(r => r.id !== id));
    };

    const handleSaveTemplate = async () => {
        if (!client.slug) return;

        try {
            const name = prompt("Enter a name for this template preset:", `Template - ${candidates[selectedCandidateIndex || 0]?.name || 'Custom'}`);
            if (!name) return;

            setIsProcessing(true);
            const config = {
                backgroundColor: stepData.backgroundColor || '#ffffff',
                accentColor: stepData.accentColor || '#2563eb',
                showLogo: stepData.showLogo !== false,
                showPrice: stepData.showPrice !== false,
                showCTA: stepData.showCTA !== false,
                overrideHeadline: stepData.overrideHeadline
            };

            await templateService.saveTemplate(
                client.slug,
                name,
                config,
                candidates[selectedCandidateIndex || 0]?.name || 'custom-scaffold'
            );

            alert('Template preset saved successfully! It will now appear in your Historical Templates.');
            fetchTemplates();
        } catch (err) {
            console.error('Failed to save template:', err);
            alert('Failed to save template preset.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleExecuteBatch = async () => {
        if (!client.slug) return;

        setIsProcessing(true);
        try {
            const batchId = await batchService.createBatch({
                clientSlug: client.slug,
                templateId: 'active-session',
                feedId: selectedFeed?.id || 'manual',
                feedName: selectedFeed?.name || 'Uploaded Feed',
                status: 'pending',
                totalVariations: feedSampleData.length || 45,
                completedVariations: 0,
                ratio: stepData.ratio || '1:1'
            });

            // Simulate the processing phase
            await batchService.updateBatchStatus(batchId, 'processing');

            // Mocking results adding for troubleshooting demo
            for (let i = 0; i < Math.min(3, feedSampleData.length); i++) {
                await batchService.addResult(batchId, {
                    url: `https://picsum.photos/seed/${batchId}-${i}/1080/1080`,
                    feedRowIndex: i,
                    metadata: { product: feedSampleData[i]?.[feedMappings.headline] || 'Product Variation' }
                });
            }

            await batchService.updateBatchStatus(batchId, 'completed', feedSampleData.length || 45);
            alert(`Batch Deployment Orchestrated Successfully!\n\nUsage tracked under Batch ID: ${batchId}`);
        } catch (err) {
            console.error('Batch failed:', err);
            alert('Failed to execute batch deployment.');
        } finally {
            setIsProcessing(false);
        }
    };

    const fetchDataSources = async () => {
        if (!client.slug) {
            console.warn('[DataSources] No client slug found in localStorage');
            return;
        }
        setIsFetchingFeeds(true);
        setFeedListError(null);
        try {
            console.log(`[DataSources] Fetching for client: ${client.slug}`);
            const models = await alliService.getDataSources(client.slug);
            console.log(`[DataSources] Total models returned: ${models.length}`);

            // Filter logic: search for "feed" in name, description, or label
            let feeds = models.filter((m: any) => {
                const searchStr = `${m.name || ''} ${m.description || ''} ${m.label || ''}`.toLowerCase();
                return searchStr.includes('feed') || m.name === 'creative_insights_data_export';
            });

            // Fallback: If no "feed" specific models are found, show all available models
            if (feeds.length === 0 && models.length > 0) {
                console.log('[DataSources] No feed-specific models found (by name/desc/label), falling back to all models.');
                feeds = models;
            }

            if (feeds.length === 0) {
                setFeedListError('No models found for this client. Check permissions or try another brand.');
            }

            setDataSources(feeds);
        } catch (err: any) {
            console.error('[DataSources] Fetch failed:', err);
            setFeedListError(err.message || String(err));
        } finally {
            setIsFetchingFeeds(false);
        }
    };

    // Ensure we fetch data sources when reaching the source step if they aren't loaded
    useEffect(() => {
        if (useCaseId === 'template-builder' &&
            steps[currentStep]?.id === 'source' &&
            dataSources.length === 0 &&
            !isFetchingFeeds &&
            !feedListError) {
            fetchDataSources();
        }
    }, [currentStep, dataSources.length, isFetchingFeeds, feedListError]);

    const fetchFeedSample = async (feed: any) => {
        const modelName = typeof feed === 'string' ? feed : feed.name;
        setIsLoading(true);
        setFeedSampleData([]);
        setFeedMetadata(null);
        // DO NOT setRequirements([]) here - we need the requirements from the previous step!

        let dimensions: string[] = [];
        let measures: string[] = [];

        try {
            // 1. Discover potential dimensions and measures
            dimensions = (feed.dimensions || []).map((d: any) => typeof d === 'string' ? d : d.name).filter(Boolean);
            measures = (feed.measures || []).map((m: any) => typeof m === 'string' ? m : m.name).filter(Boolean);

            if (dimensions.length === 0 && measures.length === 0) {
                try {
                    const meta = await alliService.getModelMetadata(client.slug, modelName);
                    setFeedMetadata(meta);
                    dimensions = (meta.dimensions || []).map((d: any) => d.name);
                    measures = (meta.measures || []).map((m: any) => m.name);
                } catch (metaErr) {
                    console.warn('[FeedSample] Metadata discovery skipped:', metaErr);
                }
            } else if (feed && typeof feed === 'object') {
                setFeedMetadata(feed);
            }

            // 2. Define progressive attempts
            const attempts = [
                // 1st: Try ALL available fields (user feedback: see ALL columns)
                { dims: dimensions, meas: measures },
                // 2nd: Try dimensions only
                { dims: dimensions, meas: [] },
            ];

            // If it's the creative insights model, add specific known-good fallbacks
            if (modelName === 'creative_insights_data_export') {
                attempts.unshift({ dims: ['ad_id', 'url', 'creative_type', 'brand_visuals'], meas: ['cpm', 'ctr'] });
                attempts.push({ dims: ['ad_id', 'url'], meas: [] });
                attempts.push({ dims: ['ad_id'], meas: [] });
            } else {
                // For general models, try a single known dimension if we have any
                if (dimensions.length > 0) {
                    attempts.push({ dims: [dimensions[0]], meas: [] });
                }
                // Last resort: empty query (backend might default)
                attempts.push({ dims: [], meas: [] });
            }

            let data: any[] = [];
            let lastError: any = null;

            for (const attempt of attempts) {
                try {
                    console.log(`[FeedSample] Attempting query for ${modelName}:`, attempt);
                    const result = await alliService.executeQuery(client.slug, modelName, {
                        dimensions: attempt.dims.length > 0 ? attempt.dims : undefined,
                        measures: attempt.meas.length > 0 ? attempt.meas : undefined,
                        limit: 25
                    });
                    data = result.results || result.rows || result.data || (Array.isArray(result) ? result : []);
                    if (data.length > 0 || (result.results && result.results.length === 0)) {
                        // Calculate Stress Test Cases (Min/Max lengths for each column)
                        if (data.length > 0) {
                            const stressMap: any = { shortest: {}, longest: {} };
                            const allCols = Object.keys(data[0] || {});
                            allCols.forEach(col => {
                                let minIdx = 0; let maxIdx = 0;
                                data.forEach((row, idx) => {
                                    const val = String(row[col] || '');
                                    if (val.length < String(data[minIdx][col] || '').length) minIdx = idx;
                                    if (val.length > String(data[maxIdx][col] || '').length) maxIdx = idx;
                                });
                                stressMap.shortest[col] = data[minIdx][col];
                                stressMap.longest[col] = data[maxIdx][col];
                            });
                            setStepData(prev => ({ ...prev, stressMap }));
                        }
                        break; // Success (even if empty results, if the query itself didn't fail)
                    }
                } catch (err) {
                    console.warn(`[FeedSample] Attempt failed:`, err);
                    lastError = err;
                }
            }

            if (data.length === 0 && lastError) {
                throw lastError;
            }

            // 3. Post-processing
            let processedData = data;
            if (modelName === 'creative_insights_data_export') {
                processedData = data.filter((row: any) => {
                    const ct = row.creative_type || row.creative_insights_data_export__creative_type || row.creative_type;
                    return String(ct || '').toLowerCase() !== 'thumbnail';
                });
            }

            console.log('[FeedSample] Final sample row count:', processedData.length);
            setFeedSampleData(processedData);
        } catch (err: any) {
            console.error('[FeedSample] Error:', err);
            setFeedSampleData([]);

            // UI Diagnostic Logic
            let errorCategory = 'API Error';
            let recommendation = 'The Alli API returned an error for this specific query. Try a different source or retry with common fields.';

            const errorMessage = err?.message || String(err);
            const isFailedToFetch = errorMessage.toLowerCase().includes('failed to fetch');

            if (isFailedToFetch) {
                errorCategory = 'Proxy Connectivity';
                recommendation = 'Could not reach the PMG Proxy server. Check VPN and internet connection. If you are on PMG-Corp, ensure you have proxy access.';
            } else if (errorMessage.includes('403')) {
                errorCategory = 'Unauthorized';
                recommendation = 'You do not have permission to query this model. Ensure your Alli account has access to this client\'s data.';
            } else if (errorMessage.toLowerCase().includes('timeout')) {
                errorCategory = 'Network Timeout';
                recommendation = 'The query took too long to execute. This model might be too large for a live preview.';
            }

            // Optional: Connectivity Ping
            let proxyStatusResult = 'Unknown';
            try {
                const proxyBase = 'https://us-central1-automated-creative-e10d7.cloudfunctions.net';
                const ping = await fetch(`${proxyBase}/helloWorld`, { mode: 'no-cors' });
                proxyStatusResult = ping.type === 'opaque' || ping.ok ? 'Reachable' : 'Unreachable';
            } catch (e) {
                proxyStatusResult = 'Unreachable';
            }

            const debugInfo = {
                clientSlug: client.slug,
                modelName: modelName,
                error: errorMessage,
                category: errorCategory,
                proxyStatus: proxyStatusResult,
                recommendation: recommendation,
                type: err?.name || 'Error',
                stack: err?.stack || 'No stack trace available'
            };
            setFeedMetadata({ error: debugInfo });
        } finally {
            setIsLoading(false);
        }
    };

    const generateCandidates = async () => {
        setIsGeneratingCandidates(true);
        // Simulate deeper AI logic synthesing requirements and brand standards
        await new Promise(r => setTimeout(r, 2000));

        const brandColor = assetHouse?.primaryColor || '#2563eb';
        const brandFont = assetHouse?.fontPrimary || 'Inter';
        const brandLogo = assetHouse?.logoPrimary;
        const fallbackLogo = client.logo_url || 'https://via.placeholder.com/150?text=Logo';

        // Check which dynamic fields are actually approved/required
        const hasHeadline = requirements.some(r => r.id === 'headline');
        const hasPrice = requirements.some(r => r.id === 'price');
        const hasImage = requirements.some(r => r.id === 'image_url');
        const hasLogo = requirements.some(r => r.category === 'Brand' || r.id === 'logo');
        const hasCTA = requirements.some(r => r.id === 'cta');

        if (stepData.selectedWireframe) {
            const wireframe = SOCIAL_WIREFRAMES.find(w => w.id === stepData.selectedWireframe);
            setCandidates([
                {
                    id: 'wireframe-primary',
                    name: `${wireframe?.name || 'Wireframe'} Primary`,
                    variant: 'wireframe',
                    strategy: `Official ${wireframe?.name} layout optimized with your brand standards and data mapping.`,
                    styles: {
                        primaryColor: brandColor,
                        fontFamily: brandFont,
                        logo: hasLogo ? brandLogo || fallbackLogo : null,
                    },
                    elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo }
                },
                {
                    id: 'wireframe-inverse',
                    name: `${wireframe?.name || 'Wireframe'} Inverse`,
                    variant: 'wireframe',
                    strategy: `Inverted color palette variation of the ${wireframe?.name} layout for high contrast environments.`,
                    styles: {
                        primaryColor: '#ffffff',
                        accentColor: brandColor,
                        fontFamily: brandFont,
                        logo: hasLogo ? brandLogo || fallbackLogo : null,
                    },
                    elements: { headline: hasHeadline, price: hasPrice, image: hasImage, cta: hasCTA, logo: hasLogo }
                }
            ]);
        } else {
            // Create logical variations based on intent + brand house + approved fields
            setCandidates([
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
                        borderRadius: assetHouse?.cornerRadius || '12px',
                        shadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                        gradient: `linear-gradient(135deg, ${brandColor} 0%, #000000 100%)`
                    },
                    elements: {
                        headline: hasHeadline,
                        price: hasPrice,
                        image: hasImage,
                        cta: hasCTA,
                        logo: hasLogo
                    }
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
                        gradient: `linear-gradient(to right, ${brandColor}, ${brandColor}88)`
                    },
                    elements: {
                        headline: hasHeadline,
                        price: hasPrice,
                        image: hasImage,
                        cta: hasCTA,
                        logo: hasLogo
                    }
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
                        borderColor: '#00000022'
                    },
                    elements: {
                        headline: hasHeadline,
                        price: hasPrice,
                        image: hasImage,
                        cta: hasCTA,
                        logo: hasLogo
                    }
                },
            ]);
        }
        setSelectedCandidateIndex(0);
        setIsGeneratingCandidates(false);
    };



    const filteredAssets = platformFilter === 'all'
        ? alliAssets
        : alliAssets.filter(a => a.platform === platformFilter);

    const totalPages = Math.ceil(filteredAssets.length / ITEMS_PER_PAGE);
    const paginatedAssets = filteredAssets.slice((assetPage - 1) * ITEMS_PER_PAGE, assetPage * ITEMS_PER_PAGE);

    // Reset pagination when filter changes
    useEffect(() => {
        setAssetPage(1);
    }, [platformFilter]);

    // Auto-trigger analysis if we land on AI reccos without results
    useEffect(() => {
        const step = steps[currentStep];
        if (useCaseId === 'template-builder' && step?.id === 'intent' && stepData.selectedWireframe && requirements.length === 0 && !isAnalyzingIntent) {
            analyzeCreativeIntent();
        }
    }, [currentStep, stepData.selectedWireframe, requirements.length, isAnalyzingIntent]);

    // Track if we've auto-triggered for the current creative + step combination
    const autoTriggeredRef = useRef<string | null>(null);

    // Auto-trigger analysis if we land on AI reccos without results
    useEffect(() => {
        const step = steps[currentStep];
        const triggerKey = `${creativeId}_${currentStep}`;

        if (
            useCaseId === 'video-cutdown' &&
            step?.id === 'ai-reccos' &&
            !stepData.ai_reccos &&
            !isLoading &&
            autoTriggeredRef.current !== triggerKey
        ) {
            const videoUrl = creative?.stepData?.upload?.videoUrl || creative?.stepData?.configure?.videoUrl;
            const lengths = creative?.stepData?.configure?.lengths || [15];

            if (videoUrl && creativeId) {
                console.log('[Auto-Trigger] Starting missing AI analysis for', triggerKey);
                autoTriggeredRef.current = triggerKey;
                let technicalModel = stepData.model ? (MODEL_MAPPING[stepData.model] || stepData.model) : 'gemini-3-flash-preview';
                if (technicalModel === 'gemini-3-pro-preview' || technicalModel === 'Gemini 3 Pro Preview') {
                    technicalModel = 'gemini-3-flash-preview';
                }
                triggerAIAnalysis(creativeId, videoUrl, lengths, creative.stepData, technicalModel);
            }
        }
    }, [currentStep, stepData.ai_reccos, creativeId, creative?.stepData, isLoading]);
    const triggerAIAnalysis = async (id: string, videoUrl: string, lengths: number[], existingStepData: any, modelName?: string) => {
        const activeTechnicalModel = modelName || 'gemini-3-flash-preview';
        // Map back to a nice display name if possible
        const displayModel = Object.keys(MODEL_MAPPING).find(k => MODEL_MAPPING[k] === activeTechnicalModel) || activeTechnicalModel;

        console.log(`[AI-Analysis] Triggering with URL: ${videoUrl}, Lengths: ${lengths}, Model: ${activeTechnicalModel}`);
        setIsLoading(true);
        try {
            const reccos = await videoService.getCutdownRecommendations(videoUrl, lengths, activeTechnicalModel);
            const newAIReccoData = { lengths, videoUrl, ai_reccos: reccos, model: displayModel };

            // Update local state immediately if we're still on this step
            setStepData(prev => ({ ...prev, ...newAIReccoData }));

            // Persistent save
            await creativeService.updateCreative(id, {
                stepData: {
                    ...existingStepData,
                    'ai-reccos': newAIReccoData
                }
            });

            // Refresh global creative object
            const fresh = await creativeService.getCreative(id);
            if (fresh) setCreative(fresh);
        } catch (err) {
            console.error('[AI-Analysis] Gemini failure:', err);
            alert(`AI Analysis Failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHistory = async (): Promise<CreativeRecord[]> => {
        if (!client.slug || !useCaseId) return [];
        console.log(`[History] Fetching for slug: "${client.slug}", useCase: "${useCaseId}"`);
        try {
            const items = await creativeService.getClientCreatives(client.slug);
            const relevant = items.filter(i => i.useCaseId === useCaseId);
            console.log(`[History] Found ${items.length} total docs, ${relevant.length} relevant to ${useCaseId}`);
            setHistory(relevant);
            return relevant;
        } catch (err) {
            console.error('[History] Fetch failed:', err);
            return [];
        }
    };

    const fetchStatus = async () => {
        setIsLoading(true);
        try {
            const data = await clientAssetHouseService.getAssetHouse(client.slug);
            setAssetHouse(data);

            if (useCaseId) {
                // Fetch recent projects for this use case
                await fetchHistory();

                // Set default model for video-cutdown if not already set
                if (useCaseId === 'video-cutdown' && !stepData.model) {
                    setStepData(prev => ({ ...prev, model: 'Gemini 3 Flash Preview' }));
                }

                // If there's a stored creativeId, resume it (unless it's already completed)
                const storedId = localStorage.getItem(`creative_${client.slug}_${useCaseId}`);
                let resumed = false;
                if (storedId) {
                    const record = await creativeService.getCreative(storedId);
                    if (record && record.status !== 'completed') {
                        setCreativeId(storedId);
                        setCreative(record);
                        if (useCaseId === 'edit-image') {
                            // edit-image uses a flat object — merge all saved step data
                            const merged = Object.values(record.stepData || {}).reduce<Record<string, any>>(
                                (acc, val) => ({ ...acc, ...(val as Record<string, any>) }), {}
                            );
                            setStepData(merged);
                        } else {
                            const lastStepId = steps[record.currentStep]?.id;
                            setStepData(record.stepData[lastStepId] || {});
                        }
                        setCurrentStep(record.currentStep);
                        resumed = true;
                    } else if (record?.status === 'completed') {
                        // Project is done - clean up storage so we don't loop back to it
                        localStorage.removeItem(`creative_${client.slug}_${useCaseId}`);
                    }
                }

                if (!resumed) {
                    setShowHistory(false);
                    startNewProject();
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const clearActiveProject = () => {
        localStorage.removeItem(`creative_${client.slug}_${useCaseId}`);
        setCreativeId(null);
        setCreative(null);
        setStepData({});
        setCurrentStep(0);
        // If it's a standard flow, we might want to show history screen
        if (useCaseId !== 'video-cutdown') {
            setShowHistory(true);
        }
    };
    const startNewProject = async () => {
        if (!useCaseId) return;
        setIsLoading(true);
        try {
            const id = await creativeService.createCreative(client.slug, useCaseId);
            setCreativeId(id);
            const record = await creativeService.getCreative(id);
            if (record) {
                setCreative(record);
            }
            localStorage.setItem(`creative_${client.slug}_${useCaseId}`, id);
            setCurrentStep(0);
            setStepData({});
            setShowHistory(false);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const resumeProject = (record: CreativeRecord) => {
        setCreativeId(record.id);
        setCreative(record);
        localStorage.setItem(`creative_${client.slug}_${useCaseId}`, record.id);
        setCurrentStep(record.currentStep);
        const currentStepId = steps[record.currentStep]?.id;
        const currentStepData = record.stepData[currentStepId] || {};
        // For template-builder, always carry selectedWireframe + wireframeFile from context
        // so live previews work on all steps after the user selected a template.
        if (useCaseId === 'template-builder') {
            const contextData = record.stepData['context'] || {};
            setStepData({
                ...(contextData.selectedWireframe ? { selectedWireframe: contextData.selectedWireframe } : {}),
                ...(contextData.wireframeFile ? { wireframeFile: contextData.wireframeFile } : {}),
                ...currentStepData,
            });
        } else {
            setStepData(currentStepData);
        }
        setShowHistory(false);
    };

    const handleNext = async () => {
        let activeCreativeId = creativeId;

        // Safety: If no creativeId, try to create one now
        if (!activeCreativeId) {
            console.log('[handleNext] No creativeId found, creating one...');
            setIsLoading(true);
            try {
                activeCreativeId = await creativeService.createCreative(client.slug, useCaseId!);
                setCreativeId(activeCreativeId);
            } catch (err) {
                console.error('[handleNext] Error creating creative:', err);
                setIsLoading(false);
                return;
            }
        }

        if (!steps[currentStep]) return;

        setIsLoading(true);
        try {
            // For template-builder: if leaving 'context' with a wireframe selected,
            // skip 'intent' and jump directly to 'source' (Connect Data).
            // Also auto-populate requirements from the wireframe's minRequirements.
            let nextStep = currentStep + 1;
            if (useCaseId === 'template-builder' && steps[currentStep].id === 'context' && stepData.selectedWireframe) {
                const wireframeDef = SOCIAL_WIREFRAMES.find(w => w.id === stepData.selectedWireframe);
                if (wireframeDef?.minRequirements) {
                    const autoReqs = wireframeDef.minRequirements.map((req: string) => {
                        const lower = req.toLowerCase();
                        const isImage = lower.includes('image') || lower.includes('background');
                        const isCurrency = lower.includes('price') || lower.includes('cost');
                        const isBrand = lower.includes('logo');
                        return {
                            id: req.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
                            label: req,
                            category: isBrand ? 'Brand' : 'Dynamic',
                            source: isBrand ? 'Creative House' : 'Feed',
                            type: isImage ? 'image' : isCurrency ? 'currency' : 'text',
                        };
                    });
                    setRequirements(autoReqs);
                    setAreRequirementsApproved(true);
                }
                // Skip intent step — jump straight to source (index 2)
                const sourceStepIndex = steps.findIndex(s => s.id === 'source');
                if (sourceStepIndex !== -1) nextStep = sourceStepIndex;
            }

            // When a wireframe is selected, skip generate (step 4) and jump straight to refine (step 5).
            // When no wireframe, trigger candidate generation when moving into generate.
            if (useCaseId === 'template-builder' && steps[currentStep].id === 'mapping' && stepData.selectedWireframe) {
                const refineStepIndex = steps.findIndex(s => s.id === 'refine');
                if (refineStepIndex !== -1) nextStep = refineStepIndex;
            } else if (useCaseId === 'template-builder' && nextStep === 4 && !stepData.selectedWireframe) {
                generateCandidates();
            }

            // Snapshot stepData NOW before any setState calls wipe it.
            const currentStepData = useCaseId === 'edit-image'
                ? sanitizeForFirestore(stepData)
                : { ...stepData };

            // edit-image uses a flat object across all steps. Save it under
            // every step key so that stale downstream data (e.g. old
            // extractedImageUrl) is always overwritten on restore.
            let updatedStepData;
            if (useCaseId === 'edit-image') {
                updatedStepData = { ...creative?.stepData };
                steps.forEach(s => { updatedStepData[s.id] = currentStepData; });
            } else {
                updatedStepData = { ...creative?.stepData, [steps[currentStep].id]: currentStepData };
            }

            await creativeService.updateCreative(activeCreativeId!, {
                currentStep: nextStep,
                stepData: updatedStepData
            });

            // Refresh local creative state
            const fresh = await creativeService.getCreative(activeCreativeId!);
            if (fresh) setCreative(fresh);

            setCurrentStep(nextStep);
            // Always scroll back to top when advancing steps
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Sync stepData with whatever is in the next step already.
            // For template-builder, ALWAYS carry selectedWireframe + wireframeFile from the
            // context step so that downstream steps (source, mapping, generate, etc.)
            // can render the live preview regardless of whether they have prior saved data.
            const nextStepId = steps[nextStep]?.id;
            const nextStepSavedData = (nextStepId && updatedStepData[nextStepId]) ? updatedStepData[nextStepId] : {};
            if (useCaseId === 'template-builder') {
                const contextData = updatedStepData['context'] || {};
                setStepData({
                    ...(contextData.selectedWireframe ? { selectedWireframe: contextData.selectedWireframe } : {}),
                    ...(contextData.wireframeFile ? { wireframeFile: contextData.wireframeFile } : {}),
                    ...nextStepSavedData,
                });
            } else if (useCaseId === 'edit-image') {
                // edit-image: carry all step data forward (flat object across all steps)
                setStepData({ ...currentStepData, ...nextStepSavedData });
            } else {
                setStepData(nextStepSavedData || {});
            }

            // Special handling for video-cutdown
            if (useCaseId === 'video-cutdown') {
                const currentStepId = steps[currentStep].id;

                if (currentStepId === 'configure') {
                    // Moving TO ai-reccos: Trigger Gemini analysis
                    const lengths = currentStepData.lengths || [15, 30];
                    const videoUrl = updatedStepData.upload?.videoUrl || creative?.stepData?.upload?.videoUrl || currentStepData.videoUrl;

                    if (videoUrl) {
                        const technicalModel = currentStepData.model ? (MODEL_MAPPING[currentStepData.model] || currentStepData.model) : 'gemini-3-pro-preview';
                        triggerAIAnalysis(activeCreativeId!, videoUrl, lengths, updatedStepData, technicalModel);
                    }
                } else if (currentStepId === 'ai-reccos') {
                    // Moving TO process: Trigger FFmpeg stitching
                    // Use currentStepData (snapshotted before setState) so selections aren't lost
                    const videoUrl = updatedStepData.upload?.videoUrl || creative?.stepData?.upload?.videoUrl || currentStepData.videoUrl;
                    const lengths: number[] = currentStepData.lengths || creative?.stepData?.configure?.lengths || [];
                    const aiReccos = currentStepData.ai_reccos || creative?.stepData?.['ai-reccos']?.ai_reccos || [];

                    const selectedCuts = lengths.flatMap((len: number) => {
                        const selections = currentStepData[`selected_${len}`] || [];
                        const recco = aiReccos.find((r: any) => r.length === len);

                        const selectionIds = Array.isArray(selections) ? selections : [selections];
                        if (selectionIds.length === 0) return [];

                        return selectionIds.map((id: any) => {
                            const opt = recco?.options?.find((o: any) => o.id === id);
                            if (!opt) return null;

                            const uniqueId = `cut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                            // Return unified segments for joint A/V processing
                            return {
                                id: uniqueId,
                                length: len,
                                segments: opt.segments || opt.videoTrack || []
                            };
                        }).filter(Boolean);
                    }) as any[];

                    console.log('[Alli-Studio] lengths:', lengths, '| aiReccos count:', aiReccos.length, '| selectedCuts:', selectedCuts.length);

                    if (!videoUrl) {
                        console.error('[Alli-Studio] No video URL found for processing');
                        setCurrentStep(nextStep - 1);
                        return;
                    }
                    if (selectedCuts.length === 0) {
                        console.error('[Alli-Studio] No cuts selected — check that selections are being saved');
                        alert('Please select at least one storyboard option before continuing.');
                        setCurrentStep(nextStep - 1);
                        return;
                    }
                    setIsLoading(true);
                    // Visually move to the "process" step (the spinner indicator)
                    setCurrentStep(nextStep);

                    try {
                        const platform = updatedStepData.upload?.platform || creative?.stepData?.upload?.platform || stepData.platform;
                        console.log('[Alli-Studio] Starting video processing for', selectedCuts.length, 'cuts on', platform);
                        const results = await videoService.processCutdowns(videoUrl, selectedCuts, platform);
                        console.log('[Alli-Studio] Processing results received:', results.cutdowns?.length, 'assets');

                        const finalStepData = {
                            ...updatedStepData,
                            process: { ...stepData, final_cutdowns: results.cutdowns },
                            download: { final_cutdowns: results.cutdowns }
                        };

                        // Update database with the processed results and advance to the download step
                        await creativeService.updateCreative(activeCreativeId!, {
                            currentStep: nextStep + 1,
                            status: 'completed',
                            stepData: finalStepData
                        });

                        const finalRecord = await creativeService.getCreative(activeCreativeId!);
                        if (finalRecord) setCreative(finalRecord);

                        // Refresh history so it shows up in the "Board History" section immediately
                        await fetchHistory();

                        // Move to final download screen
                        setCurrentStep(nextStep + 1);
                        setStepData(finalStepData.download);
                    } catch (err) {
                        console.error('[Alli-Studio] Video processing failed:', err);
                        alert(`Video Processing Failed: ${err instanceof Error ? err.message : String(err)}`);
                        // Bounce back to reccos on failure
                        setCurrentStep(nextStep - 1);
                    } finally {
                        setIsLoading(false);
                    }
                }
            }

            // edit-image: mark completed on final step, skip simulation
            if (useCaseId === 'edit-image' && nextStep >= steps.length - 1) {
                await creativeService.updateCreative(activeCreativeId!, {
                    status: 'completed',
                    resultUrls: currentStepData.finalUrl ? [currentStepData.finalUrl] : [],
                });
                await fetchHistory();
            }

            // If finishing, trigger simulation (standard flows)
            if (nextStep === steps.length - 1 && useCaseId !== 'video-cutdown' && useCaseId !== 'edit-image') {
                setIsProcessing(true);
                await creativeService.simulateGeneration(activeCreativeId!);
                const updated = await creativeService.getCreative(activeCreativeId!);
                setCreative(updated);
                setIsProcessing(false);
            }
        } catch (err) {
            console.error('Failed to update progress:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const isReady = clientAssetHouseService.checkBrandStandards(assetHouse);

    if (!useCase || !useCaseId) {
        return (
            <div className="text-center py-12">
                <p className="text-blue-gray-600">Use case not found.</p>
                <Link to="/create" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-500">
                    ← Back to workflows
                </Link>
            </div>
        );
    }

    if (useCase?.requiresBrandStandards === true && !isReady && !isLoading) {
        return (
            <div className="max-w-2xl mx-auto py-12 text-center">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-12">
                    <h2 className="text-xl font-bold text-amber-900">Brand Standards Required</h2>
                    <p className="mt-4 text-amber-800">
                        This workflow requires defined brand standards (logos, colors, fonts) to ensure creative consistency.
                        Please set these up in the Asset House before proceeding.
                    </p>
                    <div className="mt-8 flex justify-center gap-4">
                        <Link
                            to="/create"
                            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                        >
                            ← Back
                        </Link>
                        <Link
                            to="/client-asset-house"
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
                        >
                            Go to Asset House →
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Back link + Title */}
            <div>
                <Link
                    to="/create"
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-gray-500 hover:text-blue-600"
                >
                    <ArrowLeftIcon className="h-4 w-4" />
                    Back to workflows
                </Link>
                <h1 className="mt-3 text-2xl font-semibold text-gray-900">{useCase.title}</h1>
                <p className="mt-1 text-sm text-blue-gray-600">{useCase.description}</p>
            </div>

            {/* Steps Progress Bar */}
            <nav>
                <ol className="flex w-full items-center">
                    {steps.map((step, index) => {
                        const status =
                            index < currentStep ? 'complete' :
                                index === currentStep ? 'current' : 'upcoming';

                        return (
                            <li key={step.id} className="relative flex w-full flex-1 flex-col items-center text-center">
                                {/* Connector line */}
                                <div className="absolute inset-x-0 top-4 flex h-[2px] items-center">
                                    <div className={cn(
                                        'h-full w-1/2 transition-all duration-500',
                                        index === 0 ? 'bg-transparent' : (index <= currentStep ? 'bg-blue-600' : 'bg-gray-300')
                                    )} />
                                    <div className={cn(
                                        'h-full w-1/2 transition-all duration-500',
                                        index === steps.length - 1 ? 'bg-transparent' : (index < currentStep ? 'bg-blue-600' : 'bg-gray-300')
                                    )} />
                                </div>

                                {/* Step circle */}
                                <button
                                    onClick={() => index <= currentStep && setCurrentStep(index)}
                                    className={cn(
                                        'relative z-10 flex h-8 w-8 items-center justify-center rounded-full',
                                        status === 'complete' && 'bg-blue-600 hover:bg-blue-700',
                                        status === 'current' && 'border-2 border-blue-600 bg-white',
                                        status === 'upcoming' && 'border-2 border-gray-300 bg-white',
                                    )}
                                >
                                    {status === 'complete' && <CheckIcon className="h-5 w-5 text-white" />}
                                    {status === 'current' && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                                    {status === 'upcoming' && <span className="h-2.5 w-2.5 rounded-full bg-transparent" />}
                                </button>

                                {/* Step name */}
                                <span className={cn(
                                    'mt-2 whitespace-nowrap text-xs font-medium',
                                    status === 'current' ? 'text-blue-600' : 'text-blue-gray-500',
                                )}>
                                    {step.name}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </nav>

            {/* Step Content Area */}
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-card">
                {showHistory ? (
                    <div className="text-center space-y-8 py-10">
                        <div className="space-y-2">
                            <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest italic">
                                Recent {useCase?.title || 'Creative'} Strategy Boards
                            </h2>
                            <p className="text-sm text-blue-gray-400">Continue a recent session or start a new high-impact cutdown board.</p>
                        </div>

                        <div className="mx-auto max-w-lg space-y-3">
                            {(history || []).slice(0, 5).map(record => (
                                <button
                                    key={record.id}
                                    onClick={() => resumeProject(record)}
                                    className="w-full flex items-center justify-between p-5 rounded-2xl border border-blue-50 bg-blue-50/20 hover:bg-white hover:border-blue-600 hover:shadow-lg transition-all group"
                                >
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-gray-900 tracking-tight italic">
                                            {record.stepData.upload?.videoName?.replace(/\.[^/.]+$/, "") || `Untitled Project`}
                                        </p>
                                        <p className="text-[10px] text-blue-gray-400 font-extrabold uppercase tracking-widest mt-1">
                                            Modified: {record.updatedAt?.seconds
                                                ? new Date(record.updatedAt.seconds * 1000).toLocaleDateString()
                                                : "Just now"}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-700 mb-1">
                                            STEP {record.currentStep + 1}
                                        </span>
                                        <span className="text-xs font-black text-blue-600 group-hover:translate-x-1 transition-transform tracking-widest">
                                            RESUME →
                                        </span>
                                    </div>
                                </button>
                            ))}

                            <button
                                onClick={startNewProject}
                                className="w-full mt-6 p-5 rounded-2xl border-2 border-dashed border-gray-100 text-gray-300 hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50/30 transition-all font-black text-xs uppercase tracking-[0.2em]"
                            >
                                + START NEW {useCaseId?.toUpperCase().replace('-', ' ')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {steps[currentStep]?.name}
                        </h2>

                        <div className="mt-8">
                            {/* NEW IMAGE WORKFLOW STEPS */}
                            {useCaseId === 'new-image' && (
                                <div className="mx-auto max-w-lg text-left">
                                    {steps[currentStep].id === 'brief' && (
                                        <div className="space-y-4">
                                            <label className="block text-sm font-medium text-gray-700">What are we creating today?</label>
                                            <textarea
                                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                                rows={4}
                                                placeholder="e.g., A vibrant summer scene featuring a cold beverage on a beach..."
                                                value={stepData.brief || ''}
                                                onChange={(e) => setStepData({ ...stepData, brief: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    {steps[currentStep].id === 'context' && (
                                        <div className="space-y-4">
                                            <p className="text-sm text-blue-gray-500 mb-4">
                                                We'll automatically apply the brand colors and fonts from the Asset House.
                                            </p>
                                            <label className="block text-sm font-medium text-gray-700">Additional Context (Optional)</label>
                                            <input
                                                type="text"
                                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                                placeholder="e.g., Target audience is Gen Z"
                                                value={stepData.context || ''}
                                                onChange={(e) => setStepData({ ...stepData, context: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    {steps[currentStep].id === 'model' && (
                                        <div className="grid grid-cols-1 gap-4">
                                            {['DALL-E 3', 'Imagen 2', 'Stable Diffusion XL'].map(model => (
                                                <button
                                                    key={model}
                                                    onClick={() => setStepData({ ...stepData, model })}
                                                    className={cn(
                                                        "flex items-center justify-between rounded-lg border p-4 text-left transition-colors",
                                                        stepData.model === model
                                                            ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
                                                            : "border-gray-200 hover:border-gray-300"
                                                    )}
                                                >
                                                    <span className="text-sm font-medium text-gray-900">{model}</span>
                                                    {stepData.model === model && <CheckIcon className="h-5 w-5 text-blue-600" />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {steps[currentStep].id === 'generate' && (
                                        <div className="text-center space-y-6">
                                            {isProcessing ? (
                                                <div className="flex h-64 flex-col items-center justify-center gap-4">
                                                    <ArrowPathIcon className="h-10 w-10 animate-spin text-blue-600" />
                                                    <p className="text-sm font-medium text-blue-gray-600">AI is generating your creative...</p>
                                                </div>
                                            ) : creative?.resultUrls?.[0] ? (
                                                <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                                                    <img
                                                        src={creative.resultUrls[0]}
                                                        alt="Generated result"
                                                        className="h-full w-full object-cover"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="py-12 border-2 border-dashed border-gray-200 rounded-lg">
                                                    <p className="text-sm text-blue-gray-400">Preparation complete. Click Next to generate.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {/* Approvation & Final Steps omitted for brevity in this pilot */}
                                    {['approve', 'sizes'].includes(steps[currentStep].id) && (
                                        <div className="text-center py-12">
                                            <SparklesIcon className="mx-auto h-12 w-12 text-blue-gray-300" />
                                            <p className="mt-4 text-sm text-blue-gray-500 text-center">Ready to finalize your asset.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* VIDEO CUTDOWN WORKFLOW STEPS */}
                            {useCaseId === 'video-cutdown' && (
                                <div className="space-y-6">
                                    {steps[currentStep].id === 'upload' && (
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                                            {/* LEFT COLUMN: Asset Library & Source Selection (8 cols) */}
                                            <div className="lg:col-span-8 space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex p-1 bg-gray-100 rounded-2xl w-fit">
                                                        <button
                                                            onClick={() => setVideoSource('alli')}
                                                            className={cn(
                                                                "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                                                videoSource === 'alli' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                                            )}
                                                        >
                                                            Alli Central
                                                        </button>
                                                        <button
                                                            onClick={() => setVideoSource('upload')}
                                                            className={cn(
                                                                "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                                                videoSource === 'upload' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                                            )}
                                                        >
                                                            Local Upload
                                                        </button>
                                                    </div>

                                                    {/* Compact Model Selector Moved Up */}
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Intelligence:</span>
                                                        <select
                                                            value={stepData.model || "Gemini 3 Flash Preview"}
                                                            onChange={(e) => setStepData({ ...stepData, model: e.target.value })}
                                                            className="text-[10px] font-black uppercase tracking-widest py-1.5 pl-3 pr-8 rounded-lg border-gray-200 bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
                                                        >
                                                            {['Gemini 3 Flash Preview'].map((m) => (
                                                                <option key={m} value={m}>{m}</option>
                                                            ))}                <option disabled>Claude 3.5 (Soon)</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {videoSource === 'alli' ? (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Select Asset from Alli</h3>
                                                            {platforms.length > 0 && (
                                                                <div className="flex gap-1">
                                                                    {['all', ...platforms].map(p => (
                                                                        <button
                                                                            key={p}
                                                                            onClick={() => setPlatformFilter(p)}
                                                                            className={cn(
                                                                                "px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter border transition-all",
                                                                                platformFilter === p ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-100"
                                                                            )}
                                                                        >
                                                                            {p === 'all' ? 'All' : p}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {isFetchingAssets ? (
                                                            <div className="py-20 text-center space-y-4 bg-gray-50 rounded-2xl border border-dashed border-gray-100">
                                                                <ArrowPathIcon className="h-8 w-8 mx-auto text-blue-600 animate-spin" />
                                                                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Querying API...</p>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                {/* Asset count */}
                                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                                    {filteredAssets.length} assets · Page {assetPage} of {totalPages}
                                                                </p>

                                                                {/* Grid — no clipping, pagination handles navigation */}
                                                                <div className="grid grid-cols-4 gap-2">
                                                                    {paginatedAssets.map((asset) => {
                                                                        const assetHistory = history.filter(h => h.stepData.upload?.videoUrl === asset.url);
                                                                        const runLengths = Array.from(new Set(assetHistory.flatMap(h => h.stepData.configure?.lengths || []))).sort((a, b) => a - b);

                                                                        return (
                                                                            <div
                                                                                key={asset.id}
                                                                                onClick={async () => {
                                                                                    const newStepData = {
                                                                                        ...stepData,
                                                                                        videoName: asset.name || `alli_${asset.id}`,
                                                                                        videoUrl: asset.url,
                                                                                        source: 'alli',
                                                                                        assetId: asset.id,
                                                                                        platform: asset.platform
                                                                                    };
                                                                                    setStepData(newStepData);
                                                                                    if (creativeId) {
                                                                                        await creativeService.updateCreative(creativeId, {
                                                                                            stepData: { ...creative?.stepData, upload: newStepData }
                                                                                        });
                                                                                    }
                                                                                }}
                                                                                onMouseEnter={(e) => {
                                                                                    const video = e.currentTarget.querySelector('video');
                                                                                    if (video) video.play().catch(() => { });
                                                                                }}
                                                                                onMouseLeave={(e) => {
                                                                                    const video = e.currentTarget.querySelector('video');
                                                                                    if (video) { video.pause(); video.currentTime = 0; }
                                                                                }}
                                                                                className={cn(
                                                                                    "group relative bg-black rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                                                                                    asset.platform?.toLowerCase().includes('youtube') ? "aspect-video" : "aspect-[9/16]",
                                                                                    stepData.videoUrl === asset.url ? "border-blue-600 ring-4 ring-blue-50" : "border-transparent hover:border-blue-400"
                                                                                )}
                                                                            >
                                                                                <video
                                                                                    src={asset.url}
                                                                                    muted
                                                                                    loop
                                                                                    playsInline
                                                                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                                                                                    onLoadedMetadata={(e) => {
                                                                                        const dur = (e.target as HTMLVideoElement).duration;
                                                                                        if (dur && isFinite(dur)) {
                                                                                            setAssetDurations(prev => ({ ...prev, [asset.id]: Math.round(dur) }));
                                                                                        }
                                                                                    }}
                                                                                />

                                                                                {/* History / cutdown badges */}
                                                                                <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1 max-w-[85%]">
                                                                                    {runLengths.map(len => (
                                                                                        <span key={len} className="bg-blue-600/95 backdrop-blur-sm text-[11px] font-black text-white px-2.5 py-1 rounded border border-white/20 shadow-sm uppercase tracking-wider">
                                                                                            {len}s
                                                                                        </span>
                                                                                    ))}
                                                                                </div>

                                                                                <div className="absolute inset-0 p-2 flex flex-col justify-end bg-gradient-to-t from-black via-black/30 to-transparent">
                                                                                    <div className="flex items-center justify-between gap-1">
                                                                                        <p className="text-[9px] font-black text-white truncate uppercase tracking-wide">{asset.platform || 'General'}</p>
                                                                                        {assetDurations[asset.id] !== undefined && (
                                                                                            <span className="shrink-0 text-[10px] font-black text-white bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded">
                                                                                                {assetDurations[asset.id]}s
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                {stepData.videoUrl === asset.url && (
                                                                                    <div className="absolute top-1 right-1 bg-blue-600 rounded-full p-0.5 shadow-lg border border-white">
                                                                                        <CheckIcon className="h-2 w-2 text-white" />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>

                                                                {/* Pagination bar */}
                                                                {totalPages > 1 && (
                                                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                                                        <button
                                                                            onClick={() => setAssetPage(p => Math.max(1, p - 1))}
                                                                            disabled={assetPage === 1}
                                                                            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-[9px] font-black uppercase tracking-widest text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-all"
                                                                        >
                                                                            ← Prev
                                                                        </button>
                                                                        <div className="flex items-center gap-1">
                                                                            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                                                                let page: number;
                                                                                if (totalPages <= 7) page = i + 1;
                                                                                else if (assetPage <= 4) page = i + 1;
                                                                                else if (assetPage >= totalPages - 3) page = totalPages - 6 + i;
                                                                                else page = assetPage - 3 + i;
                                                                                return (
                                                                                    <button
                                                                                        key={page}
                                                                                        onClick={() => setAssetPage(page)}
                                                                                        className={cn(
                                                                                            "w-7 h-7 rounded-lg text-[9px] font-black transition-all",
                                                                                            assetPage === page ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                                                                                        )}
                                                                                    >
                                                                                        {page}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setAssetPage(p => Math.min(totalPages, p + 1))}
                                                                            disabled={assetPage === totalPages}
                                                                            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-[9px] font-black uppercase tracking-widest text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-all"
                                                                        >
                                                                            Next →
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Upload Local Asset</h3>
                                                        <label className="flex flex-col items-center justify-center h-[200px] border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50 hover:bg-white hover:border-blue-400 transition-all cursor-pointer">
                                                            {isLoading ? (
                                                                <ArrowPathIcon className="h-8 w-8 text-blue-600 animate-spin" />
                                                            ) : (
                                                                <div className="text-center">
                                                                    <SparklesIcon className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none">Drop Primary File</p>
                                                                </div>
                                                            )}
                                                            <input type="file" className="sr-only" accept="video/*" onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    setIsLoading(true);
                                                                    try {
                                                                        const storageRef = ref(storage, `uploads/${client.slug}/${Date.now()}_${file.name}`);
                                                                        await uploadBytes(storageRef, file);
                                                                        const url = await getDownloadURL(storageRef);
                                                                        const newStepData = { ...stepData, videoName: file.name, videoUrl: url, source: 'local' };
                                                                        setStepData(newStepData);
                                                                        if (creativeId) {
                                                                            await creativeService.updateCreative(creativeId, {
                                                                                stepData: { ...creative?.stepData, upload: newStepData }
                                                                            });
                                                                        }
                                                                    } catch (err) { console.error(err); } finally { setIsLoading(false); }
                                                                }
                                                            }} />
                                                        </label>
                                                    </div>
                                                )}

                                                {/* Selected Asset Preview - Compact */}
                                                {stepData.videoUrl && (
                                                    <div className="flex items-center gap-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                                                        <div className="h-16 w-24 bg-black rounded-lg overflow-hidden shrink-0 border border-blue-200">
                                                            <video src={stepData.videoUrl} className="w-full h-full object-cover" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-1 truncate">{stepData.videoName}</p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[8px] font-black py-0.5 px-2 bg-blue-600 text-white rounded-full uppercase">Asset Locked</span>
                                                                {stepData.platform && (
                                                                    <span className="text-[8px] font-black py-0.5 px-2 bg-white text-blue-600 border border-blue-200 rounded-full uppercase">{stepData.platform}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={handleNext}
                                                            className="px-6 py-2.5 bg-blue-600 text-[10px] font-black text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all uppercase tracking-widest"
                                                        >
                                                            Continue →
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* RIGHT COLUMN: Historic Runs (4 cols) */}
                                            <div className="lg:col-span-4 space-y-4 border-l border-gray-50 pl-8">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Board History</h3>
                                                    <button
                                                        onClick={clearActiveProject}
                                                        className="text-[8px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-full"
                                                    >
                                                        + Start New Build
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 max-h-[750px] overflow-y-auto pr-2 custom-scrollbar">
                                                    {history.filter(h => h.status === 'completed').length > 0 ? (
                                                        history.filter(h => h.status === 'completed').map(record => (
                                                            <button
                                                                key={record.id}
                                                                onClick={() => resumeProject(record)}
                                                                className={cn(
                                                                    "group relative aspect-[9/16] rounded-2xl border-2 transition-all overflow-hidden bg-black",
                                                                    creativeId === record.id
                                                                        ? "border-blue-600 ring-4 ring-blue-50 shadow-lg"
                                                                        : "border-gray-100 hover:border-blue-400 hover:shadow-md"
                                                                )}
                                                            >
                                                                {/* Visual Preview */}
                                                                <div className="absolute inset-0">
                                                                    {record.stepData.upload?.videoUrl ? (
                                                                        <video
                                                                            src={record.stepData.upload.videoUrl}
                                                                            className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity duration-500"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center">
                                                                            <SparklesIcon className="h-6 w-6 text-gray-700" />
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Content Overlay */}
                                                                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/20 to-transparent">
                                                                    <p className="text-[10px] font-black text-white truncate uppercase tracking-[0.1em] mb-2 leading-tight drop-shadow-md">
                                                                        {record.stepData.upload?.videoName?.replace(/\.[^/.]+$/, "") || `Untitled Project`}
                                                                    </p>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {(record.stepData.configure?.lengths || []).map((l: number) => (
                                                                            <span key={l} className="text-[8px] font-black px-2 py-0.5 rounded bg-blue-600 text-white border border-white/20 uppercase tracking-tighter shadow-lg">
                                                                                {l}s
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                {/* Interactive Hover Indicator */}
                                                                <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                    <div className="bg-white/95 backdrop-blur-sm p-3 rounded-full shadow-2xl scale-75 group-hover:scale-100 transition-transform duration-300">
                                                                        <SparklesIcon className="h-4 w-4 text-blue-600" />
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="py-12 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                                                            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest italic leading-relaxed">
                                                                No creative boards<br />found for this client
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="pt-6 border-t border-gray-100">
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm("Are you sure you want to clear ALL test files? This cannot be undone.")) {
                                                                setIsLoading(true);
                                                                try {
                                                                    const res = await videoService.clearStorage();
                                                                    alert(`Success! Deleted ${res.deletedCount} files.`);
                                                                } catch (err) {
                                                                    console.error(err);
                                                                    alert("Failed to clear storage.");
                                                                } finally {
                                                                    setIsLoading(false);
                                                                }
                                                            }
                                                        }}
                                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-100 bg-red-50/30 text-red-600 text-[9px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
                                                    >
                                                        <TrashIcon className="h-3 w-3" />
                                                        Clear All Test Files
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'configure' && (
                                        <div className="space-y-8">
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Strategy Parameters</label>
                                                <h3 className="text-xl font-bold text-gray-900 italic">Select Target Run-Times</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {[6, 15, 30, 60].map(seconds => (
                                                    <button
                                                        key={seconds}
                                                        onClick={() => {
                                                            const current = stepData.lengths || [];
                                                            const next = current.includes(seconds)
                                                                ? current.filter((s: number) => s !== seconds)
                                                                : [...current, seconds];
                                                            setStepData({ ...stepData, lengths: next });
                                                        }}
                                                        className={cn(
                                                            "flex flex-col items-center justify-center rounded-2xl border-2 p-8 text-center transition-all",
                                                            (stepData.lengths || []).includes(seconds)
                                                                ? "border-blue-600 bg-blue-50 shadow-blue-100 shadow-xl scale-[1.02]"
                                                                : "border-gray-100 bg-gray-50/50 hover:border-blue-200"
                                                        )}
                                                    >
                                                        <span className="text-3xl font-black text-gray-900 tracking-tighter">{seconds}s</span>
                                                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-2">{seconds < 15 ? 'BUMPER' : 'STORY'}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'ai-reccos' && (
                                        <div className="space-y-6">
                                            {isLoading ? (
                                                <div className="py-20 text-center space-y-4">
                                                    <div className="flex justify-center">
                                                        <ArrowPathIcon className="h-10 w-10 text-blue-600 animate-spin" />
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-900 tracking-tight italic">{stepData.model || 'Gemini 3 Flash Preview'} is Analyzing Your Video Context...</p>
                                                    <p className="text-[10px] text-blue-gray-400 font-bold uppercase tracking-widest">Identifying hook hooks & optimal stitch points</p>
                                                </div>
                                            ) : (
                                                <Transition
                                                    show={!isLoading}
                                                    appear={true}
                                                    enter="transition-all duration-1000"
                                                    enterFrom="opacity-0 translate-y-4 scale-95"
                                                    enterTo="opacity-100 translate-y-0 scale-100"
                                                >
                                                    <div className="space-y-8 text-left">
                                                        <div className="flex items-center justify-between bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                                                                    <SparklesIcon className="h-4 w-4 text-white" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest leading-none mb-1">Analysis Matrix Complete</p>
                                                                    <p className="text-[9px] text-blue-700 font-bold uppercase tracking-widest leading-none">Insights synthesized by {stepData.model || creative?.stepData?.configure?.model || 'Gemini 3 Flash Preview'}</p>
                                                                </div>
                                                            </div>
                                                            <span className="text-[9px] font-black py-1 px-3 bg-blue-600 text-white rounded-full tracking-[0.2em] uppercase">Ready</span>
                                                        </div>

                                                        {/* Regenerate Action */}
                                                        <div className="flex justify-end">
                                                            <button
                                                                onClick={() => {
                                                                    const technicalModel = stepData.model ? (MODEL_MAPPING[stepData.model] || stepData.model) : 'gemini-3-flash-preview';
                                                                    const videoUrl = creative?.stepData?.upload?.videoUrl || stepData.videoUrl;
                                                                    const lengths = stepData.lengths || creative?.stepData?.configure?.lengths || [15];

                                                                    // Clear current reccos and re-trigger
                                                                    setStepData(prev => ({ ...prev, ai_reccos: null }));
                                                                    triggerAIAnalysis(creativeId!, videoUrl!, lengths, creative?.stepData, technicalModel);
                                                                }}
                                                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-[10px] font-black text-blue-gray-500 uppercase tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all bg-white shadow-sm"
                                                            >
                                                                <ArrowPathIcon className="h-3 w-3" />
                                                                RE-RUN ANALYSIS
                                                            </button>
                                                        </div>

                                                        {/* Use lengths from configure step or local state */}
                                                        {((stepData.lengths || creative?.stepData?.configure?.lengths) || []).map((len: number) => (
                                                            <div key={len} className="space-y-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="h-1.5 w-1.5 bg-blue-600 rounded-full" />
                                                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">{len}s Storyboard Options</h3>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    {((stepData.ai_reccos || []).find((r: any) => r.length === len)?.options || []).map((opt: any) => {
                                                                        const selections = Array.isArray(stepData[`selected_${len}`])
                                                                            ? stepData[`selected_${len}`]
                                                                            : (stepData[`selected_${len}`] ? [stepData[`selected_${len}`]] : []);
                                                                        const isSelected = selections.includes(opt.id);

                                                                        return (
                                                                            <button
                                                                                key={opt.id}
                                                                                onClick={() => {
                                                                                    const next = isSelected
                                                                                        ? selections.filter((id: any) => id !== opt.id)
                                                                                        : [...selections, opt.id];
                                                                                    setStepData({ ...stepData, [`selected_${len}`]: next });
                                                                                }}
                                                                                className={cn(
                                                                                    "w-full flex items-start justify-between p-4 rounded-xl border-2 text-left transition-all",
                                                                                    isSelected
                                                                                        ? "border-blue-600 bg-blue-50 shadow-md scale-[1.01]"
                                                                                        : "border-gray-50 bg-gray-50/30 hover:border-gray-200"
                                                                                )}
                                                                            >
                                                                                <div className="flex-1">
                                                                                    <p className="text-sm font-bold text-gray-900 italic mb-2">“{opt.reason}”</p>
                                                                                    <div className="space-y-2">
                                                                                        <div>
                                                                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Stitched Sequence</p>
                                                                                            <div className="flex flex-wrap gap-1">
                                                                                                {(opt.segments || opt.videoTrack || []).map((seg: any, idx: number) => (
                                                                                                    <span key={idx} className="inline-block px-1.5 py-0.5 bg-white border border-blue-100 text-blue-600 rounded text-[9px] font-black tracking-tighter">
                                                                                                        {seg.start} → {seg.end}
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div className={cn(
                                                                                    "ml-4 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                                                                                    isSelected ? "border-blue-600 bg-blue-600 shadow-inner" : "border-gray-300 bg-white"
                                                                                )}>
                                                                                    {isSelected && <CheckIcon className="h-3 w-3 text-white font-black" />}
                                                                                </div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Transition>
                                            )}
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'process' && (
                                        <div className="text-center py-24 space-y-6">
                                            <div className="flex justify-center relative">
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="h-24 w-24 rounded-full border-4 border-blue-600/10 border-t-blue-600 animate-spin" />
                                                </div>
                                                <SparklesIcon className="h-12 w-12 text-blue-600 animate-pulse" />
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-sm font-black text-gray-900 uppercase tracking-widest">Stitching Narrative Board...</p>
                                                <p className="text-[10px] text-blue-gray-400 font-bold uppercase tracking-widest">Executing FFmpeg Complex Filters on Studio Cloud</p>
                                            </div>
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'download' && (
                                        <div className="space-y-6">
                                            <div className="rounded-2xl border border-green-100 bg-green-50/50 p-5 flex items-center gap-4">
                                                <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                                                    <CheckIcon className="h-6 w-6 text-green-600" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-green-900 uppercase tracking-widest">Batch Generation Complete</p>
                                                    <p className="text-[10px] text-green-700 font-bold uppercase tracking-widest">{(stepData.final_cutdowns || []).length} ASSETS READY FOR EXPORT</p>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                {((stepData.final_cutdowns || creative?.stepData?.process?.final_cutdowns) || []).map((cut: any, idx: number) => (
                                                    <div key={idx} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                                                        {/* Video Preview Section */}
                                                        <div className="aspect-video bg-black relative group">
                                                            <video
                                                                src={cut.url}
                                                                controls
                                                                preload="metadata"
                                                                className="w-full h-full object-contain"
                                                            />
                                                            <div className="absolute top-3 left-3 flex gap-2">
                                                                <span className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-black text-white uppercase tracking-widest border border-white/20">
                                                                    {cut.length}s Cut
                                                                </span>
                                                                <span className="bg-blue-600 px-2 py-1 rounded text-[10px] font-black text-white uppercase tracking-widest border border-blue-400">
                                                                    Variation {idx + 1}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Info & Download Section */}
                                                        <div className="p-4 flex items-center justify-between bg-gray-50/50">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-black text-gray-900 tracking-tight italic">
                                                                    {cut.length}s_variation_{idx + 1}.mp4
                                                                </span>
                                                                <span className="text-[9px] text-blue-gray-400 uppercase font-black tracking-[0.15em] mt-1">
                                                                    AI Story-Stitched • High Resolution
                                                                </span>
                                                            </div>
                                                            <a
                                                                href={cut.url}
                                                                download
                                                                target="_blank"
                                                                className="rounded-xl bg-blue-600 px-6 py-2.5 text-[10px] font-black text-white hover:bg-blue-700 hover:shadow-lg transition-all uppercase tracking-widest"
                                                            >
                                                                Download MP4
                                                            </a>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {useCaseId === 'template-builder' && (
                                <div className="space-y-12">
                                    {steps[currentStep].id === 'context' && (
                                        <div className="space-y-10">
                                            {/* Header */}
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Strategy Parameters</label>
                                                <h3 className="text-xl font-bold text-gray-900 italic">Define Your Template Context</h3>
                                            </div>

                                            {isLibraryOpen ? (
                                                <div className="bg-white rounded-3xl border-2 border-blue-100 p-8 shadow-xl shadow-blue-50/50 animate-in fade-in zoom-in-95 duration-500">
                                                    <div className="flex items-center justify-between mb-8 border-b border-gray-100 pb-6">
                                                        <div className="flex items-center gap-4">
                                                            <button
                                                                onClick={() => setIsLibraryOpen(false)}
                                                                className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors border border-gray-200 shadow-sm"
                                                            >
                                                                <ChevronLeftIcon className="h-6 w-6 text-gray-900" />
                                                            </button>
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <div className="h-2 w-2 bg-blue-600 rounded-full animate-pulse" />
                                                                    <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none">Scaffold Marketplace</label>
                                                                </div>
                                                                <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tight italic">Standard Wireframe Library</h3>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-right">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Preview Mode</p>
                                                                <p className="text-xs font-bold text-gray-900">PMG Baseline Branding</p>
                                                            </div>
                                                            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                                                                <SparklesIcon className="h-6 w-6 text-white" />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-h-[600px] overflow-y-auto pr-4 scrollbar-hide pb-8">
                                                        {SOCIAL_WIREFRAMES.map(template => (
                                                            <div
                                                                key={template.id}
                                                                className={cn(
                                                                    "group relative bg-gray-50 border-2 rounded-2xl overflow-hidden transition-all hover:shadow-2xl hover:shadow-blue-100/50 flex flex-col",
                                                                    stepData.selectedWireframe === template.id ? "border-blue-600 bg-blue-50/30 ring-4 ring-blue-50" : "border-gray-200/60"
                                                                )}
                                                            >
                                                                <div className="aspect-square bg-white relative overflow-hidden m-2 rounded-xl shadow-inner border border-gray-100 flex items-center justify-center">
                                                                    <TemplatePreview
                                                                        templateFile={template.file}
                                                                        name={template.name}
                                                                        scale={0.20}
                                                                        adSize={template.adSize || 1024}
                                                                    />
                                                                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-gray-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 scale-105 group-hover:scale-100">
                                                                        <button
                                                                            onClick={() => {
                                                                                setSelectedWireframe(template);
                                                                                setStepData({
                                                                                    ...stepData,
                                                                                    selectedWireframe: template.id,
                                                                                    wireframeFile: template.file,
                                                                                    jobTitle: stepData.jobTitle || `${template.name} - ${client.name}`,
                                                                                    ...BASELINE_ASSETS,
                                                                                    headline: BASELINE_ASSETS.headline1,
                                                                                    image_url: BASELINE_ASSETS.image1,
                                                                                    logo: BASELINE_ASSETS.logo
                                                                                });
                                                                                setIsLibraryOpen(false);
                                                                            }}
                                                                            className="w-full py-4 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-400/20 transition-all transform translate-y-2 group-hover:translate-y-0"
                                                                        >
                                                                            Use this Scaffold
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <div className="px-5 py-4 flex-1 flex flex-col">
                                                                    <div className="flex items-start justify-between mb-3">
                                                                        <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-tighter leading-tight pr-2">{template.name}</h4>
                                                                        {stepData.selectedWireframe === template.id && (
                                                                            <CheckCircleIcon className="h-4 w-4 text-blue-600 shrink-0" />
                                                                        )}
                                                                    </div>
                                                                    <div className="mt-auto pt-3 border-t border-gray-200/50">
                                                                        <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-2">Requirements</label>
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {template.minRequirements?.map((req: string) => (
                                                                                <span key={req} className="px-1.5 py-0.5 bg-white border border-gray-100 rounded text-[6px] font-bold text-gray-600 uppercase tracking-tighter">
                                                                                    {req}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                                    <div className="space-y-6">
                                                        {/* Job Title */}
                                                        <div>
                                                            <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Job Title / Project Name</label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. Q4 Global Branding - Feed Opt"
                                                                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-gray-900"
                                                                value={stepData.jobTitle || ''}
                                                                onChange={(e) => setStepData({ ...stepData, jobTitle: e.target.value })}
                                                            />
                                                        </div>

                                                        {/* Channel Selection */}
                                                        <div>
                                                            <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3">Target Channel</label>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {['Social', 'Programmatic', 'Print', 'Digital Signage'].map(channel => (
                                                                    <button
                                                                        key={channel}
                                                                        onClick={() => setStepData({ ...stepData, channel })}
                                                                        className={cn(
                                                                            "px-4 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                                                            stepData.channel === channel
                                                                                ? "border-blue-600 bg-blue-50 text-blue-600 font-black"
                                                                                : "border-gray-100 text-gray-400 hover:border-blue-200"
                                                                        )}
                                                                    >
                                                                        {channel}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Aspect Ratios based on Channel */}
                                                        <div>
                                                            <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3">Aspect Ratio / Size</label>
                                                            <div className="grid grid-cols-3 gap-3">
                                                                {stepData.channel ? (
                                                                    (stepData.channel === 'Social' ? ['1:1', '9:16', '2:3'] :
                                                                        stepData.channel === 'Programmatic' ? ['300x250', '160x600', '728x90', '300x600'] :
                                                                            ['8.5x11', '4x6', 'Custom']).map(ratio => {
                                                                                const isSelected = selectedRatios.includes(ratio);
                                                                                return (
                                                                                    <button
                                                                                        key={ratio}
                                                                                        onClick={() => {
                                                                                            const newRatios = isSelected
                                                                                                ? selectedRatios.filter(r => r !== ratio)
                                                                                                : [...selectedRatios, ratio];
                                                                                            setSelectedRatios(newRatios);
                                                                                            setStepData({ ...stepData, ratios: newRatios });
                                                                                        }}
                                                                                        className={cn(
                                                                                            "px-4 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                                                                            isSelected
                                                                                                ? "border-blue-600 bg-blue-50 text-blue-600 font-black shadow-md shadow-blue-50"
                                                                                                : "border-gray-100 text-gray-400 hover:border-blue-200"
                                                                                        )}
                                                                                    >
                                                                                        {ratio}
                                                                                    </button>
                                                                                );
                                                                            })
                                                                ) : (
                                                                    <div className="col-span-3 py-10 border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center bg-gray-50/50">
                                                                        <PhotoIcon className="h-6 w-6 text-gray-200 mb-2" />
                                                                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest italic">Select a channel first</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Official Wireframes & Historical Grid */}
                                                    <div className="space-y-6">
                                                        <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 shadow-sm overflow-hidden">
                                                            <div className="flex items-center justify-between mb-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="h-2 w-2 bg-blue-600 rounded-full" />
                                                                    <label className="block text-[10px] font-black text-gray-900 uppercase tracking-widest leading-none">Official Standard Wireframes</label>
                                                                </div>
                                                                {stepData.channel === 'Social' && (
                                                                    <div className="flex items-center gap-3">
                                                                        {stepData.selectedWireframe && (
                                                                            <span
                                                                                onClick={() => {
                                                                                    setSelectedWireframe(null);
                                                                                    setStepData({ ...stepData, selectedWireframe: undefined, wireframeFile: undefined });
                                                                                }}
                                                                                className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter cursor-pointer hover:text-red-500 transition-colors"
                                                                            >
                                                                                ✕ Change
                                                                            </span>
                                                                        )}
                                                                        <span
                                                                            onClick={() => setIsLibraryOpen(true)}
                                                                            className="text-[9px] font-bold text-blue-600 uppercase tracking-tighter cursor-pointer hover:underline"
                                                                        >
                                                                            View Library
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {stepData.channel === 'Social' ? (
                                                                stepData.selectedWireframe ? (
                                                                    // ── After selection: show only the selected scaffold ──
                                                                    (() => {
                                                                        const sel = SOCIAL_WIREFRAMES.find(w => w.id === stepData.selectedWireframe);
                                                                        if (!sel) return null;
                                                                        return (
                                                                            <div className="flex flex-col items-center gap-3 p-4 bg-blue-50 rounded-2xl border-2 border-blue-200">
                                                                                <div className="relative overflow-hidden rounded-xl" style={{ width: 160, height: 160 }}>
                                                                                    <TemplatePreview
                                                                                        templateFile={sel.file}
                                                                                        name={sel.name}
                                                                                        scale={0.156}
                                                                                        adSize={sel.adSize || 1024}
                                                                                    />
                                                                                    <div className="absolute top-2 right-2">
                                                                                        <CheckCircleIcon className="h-5 w-5 text-blue-600 drop-shadow" />
                                                                                    </div>
                                                                                </div>
                                                                                <div className="text-center">
                                                                                    <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">{sel.name}</p>
                                                                                    <p className="text-[8px] font-bold text-blue-500 uppercase tracking-tighter mt-0.5">Scaffold Selected</p>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()
                                                                ) : (
                                                                    // ── No selection yet: show 4-card grid with hover CTA ──
                                                                    <div className="grid grid-cols-2 gap-3">
                                                                        {SOCIAL_WIREFRAMES.slice(0, 4).map(template => (
                                                                            <button
                                                                                key={template.id}
                                                                                onClick={() => {
                                                                                    setSelectedWireframe(template);
                                                                                    setStepData({
                                                                                        ...stepData,
                                                                                        selectedWireframe: template.id,
                                                                                        wireframeFile: template.file,
                                                                                        jobTitle: stepData.jobTitle || `${template.name} - ${client.name}`,
                                                                                        ...BASELINE_ASSETS,
                                                                                        headline: BASELINE_ASSETS.headline1,
                                                                                        image_url: BASELINE_ASSETS.image1,
                                                                                        logo: BASELINE_ASSETS.logo
                                                                                    });
                                                                                }}
                                                                                className="aspect-square bg-white border-2 border-gray-100 rounded-xl transition-all hover:border-blue-400 group relative overflow-hidden"
                                                                            >
                                                                                {/* Preview — clipped inside the rounded card */}
                                                                                <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl">
                                                                                    <TemplatePreview
                                                                                        templateFile={template.file}
                                                                                        name={template.name}
                                                                                        scale={0.165}
                                                                                        adSize={template.adSize || 1024}
                                                                                    />
                                                                                </div>
                                                                                {/* Hover overlay with CTA */}
                                                                                <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/70 transition-all flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 rounded-xl">
                                                                                    <CheckCircleIcon className="h-6 w-6 text-white mb-1" />
                                                                                    <span className="text-[8px] font-black text-white uppercase tracking-widest leading-tight text-center px-2">Use This Scaffold</span>
                                                                                </div>
                                                                                {/* Name label always visible at bottom */}
                                                                                <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-2 py-1.5">
                                                                                    <span className="text-[7px] font-black uppercase tracking-widest text-gray-500 line-clamp-1 block">
                                                                                        {template.name}
                                                                                    </span>
                                                                                </div>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )
                                                            ) : (
                                                                <div className="py-10 border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center bg-gray-50/30 text-center px-6">
                                                                    <RectangleGroupIcon className="h-7 w-7 text-gray-200 mb-3" />
                                                                    <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest leading-relaxed">
                                                                        {stepData.channel ? `No templates available for ${stepData.channel}` : 'Select a channel to browse templates'}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Historical Templates */}
                                                        <div className="bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 p-6">
                                                            <div className="flex items-center justify-between mb-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="h-2 w-2 bg-gray-300 rounded-full" />
                                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Historical Saved Templates</label>
                                                                </div>
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Newest First</span>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3 opacity-60">
                                                                {savedTemplates.length > 0 ? (
                                                                    savedTemplates.slice(0, 2).map(t => (
                                                                        <button key={t.id} className="aspect-square bg-white border-2 border-gray-100 rounded-xl hover:border-blue-400 transition-all p-2 flex flex-col items-center justify-center gap-2">
                                                                            <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
                                                                                <CircleStackIcon className="h-5 w-5 text-blue-300" />
                                                                            </div>
                                                                            <span className="text-[7px] font-black uppercase tracking-widest truncate w-full px-1">{t.name}</span>
                                                                        </button>
                                                                    ))
                                                                ) : (
                                                                    <div className="col-span-2 py-8 text-center flex flex-col items-center justify-center">
                                                                        <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest italic">No saved history yet</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'intent' && (
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">Step 2 of 7</label>
                                                    <h3 className="text-lg font-bold text-gray-900 italic">
                                                        {selectedWireframe ? `Configure Wireframe: ${selectedWireframe.name}` : 'Synthesize Design Requirements'}
                                                    </h3>
                                                </div>
                                                <div className="flex gap-2">
                                                    {requirements.length > 0 && (
                                                        <div className="px-3 py-1 bg-green-50 rounded-full border border-green-100 flex items-center gap-2">
                                                            <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
                                                            <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">Live Optimization Active</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                                {/* Prompt Input Area */}
                                                <div className="bg-white rounded-3xl border-2 border-gray-100 p-6 space-y-4 shadow-sm h-full flex flex-col">
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none">Creative Intent & Guidelines</label>
                                                            {stepData.selectedWireframe && (
                                                                <span className="text-[8px] font-black text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 uppercase tracking-widest animate-pulse">Wireframe Lock Active</span>
                                                            )}
                                                        </div>
                                                        <textarea
                                                            placeholder={stepData.selectedWireframe ? "Guidelines pre-loaded from wireframe. Add custom overrides if needed..." : "Describe the aesthetic and functional requirements... e.g. 'A minimalist layout for Facebook highlighting the product price and a clear Shop Now CTA.'"}
                                                            className="w-full flex-1 min-h-[140px] px-6 py-4 rounded-2xl border-2 border-gray-50 focus:border-blue-600 focus:ring-8 focus:ring-blue-50 outline-none transition-all font-medium text-gray-900 text-sm shadow-inner bg-gray-50/20 resize-none"
                                                            value={stepData.prompt || ''}
                                                            onChange={(e) => setStepData({ ...stepData, prompt: e.target.value })}
                                                        />
                                                    </div>

                                                    <button
                                                        onClick={analyzeCreativeIntent}
                                                        disabled={!stepData.prompt || isAnalyzingIntent}
                                                        className={cn(
                                                            "w-full py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3",
                                                            isAnalyzingIntent
                                                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                                                : "bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-100 active:scale-95"
                                                        )}
                                                    >
                                                        {isAnalyzingIntent ? (
                                                            <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                                        ) : (
                                                            <SparklesIcon className="h-5 w-5" />
                                                        )}
                                                        {isAnalyzingIntent ? "Synthesizing Requirements..." : "Synthesize Field Requirements"}
                                                    </button>
                                                </div>

                                                {/* AI Requirement Recommendations */}
                                                <div className="h-full">
                                                    <div className="bg-white rounded-3xl p-6 border-2 border-dashed border-gray-200 flex flex-col h-[400px] shadow-sm overflow-hidden">
                                                        <div className="flex items-center justify-between mb-4 shrink-0">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                                                                <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Requirement Synthesis</h4>
                                                            </div>
                                                            {requirements.length > 0 && (
                                                                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-md">{requirements.length} FIELDS IDENTIFIED</span>
                                                            )}
                                                        </div>

                                                        {requirements.length > 0 ? (
                                                            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-1">
                                                                <table className="w-full text-left">
                                                                    <thead className="sticky top-0 bg-white z-10">
                                                                        <tr>
                                                                            <th className="py-2 text-[8px] font-black text-gray-400 uppercase tracking-widest px-2">Source</th>
                                                                            <th className="py-2 text-[8px] font-black text-gray-400 uppercase tracking-widest">Requirement Label</th>
                                                                            <th className="py-2 text-[8px] font-black text-gray-400 uppercase tracking-widest text-right px-2">Type</th>
                                                                            <th className="py-2 w-8"></th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y-2 divide-gray-200">
                                                                        {requirements.map((req) => (
                                                                            <tr key={req.id} className="group hover:bg-blue-50/30 transition-colors">
                                                                                <td className="py-3 px-2">
                                                                                    <div className={cn(
                                                                                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter",
                                                                                        req.source === 'Creative House' ? "bg-purple-50 text-purple-600 border border-purple-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                                                                                    )}>
                                                                                        {req.source === 'Creative House' ? <PhotoIcon className="h-2.5 w-2.5" /> : <CircleStackIcon className="h-2.5 w-2.5" />}
                                                                                        {req.source === 'Creative House' ? 'House' : 'Feed'}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="py-3">
                                                                                    <p className="text-[11px] font-bold text-gray-900 leading-none">{req.label}</p>
                                                                                </td>
                                                                                <td className="py-3 text-right px-2">
                                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{req.type}</span>
                                                                                </td>
                                                                                <td className="py-3 text-right pr-2">
                                                                                    <button
                                                                                        onClick={() => handleRemoveRequirement(req.id)}
                                                                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-500 text-gray-300"
                                                                                    >
                                                                                        <TrashIcon className="h-3.5 w-3.5" />
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>

                                                                <button
                                                                    onClick={handleAddCustomRequirement}
                                                                    className="w-full py-2 hover:bg-gray-50 rounded-xl border-2 border-dashed border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-widest transition-all mt-4 flex items-center justify-center gap-2"
                                                                >
                                                                    <span className="text-sm">+</span> Add Custom Field
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 flex flex-col items-start justify-center text-left px-2">
                                                                <div className="h-16 w-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-6">
                                                                    <SparklesIcon className="h-8 w-8 text-gray-200" />
                                                                </div>
                                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">Enter your creative intent and click<br />"Synthesize" to identify dynamic fields.</p>
                                                            </div>
                                                        )}

                                                        {requirements.length > 0 && (
                                                            <div className="pt-8 border-t border-gray-100 mt-8 flex flex-col items-start gap-5">
                                                                <div className="text-left">
                                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-relaxed">System identified {requirements.filter(r => r.category === 'Dynamic').length} dynamic, {requirements.filter(r => r.category === 'Brand').length} brand assets.</p>
                                                                    <p className="text-[8px] font-medium text-gray-400 uppercase tracking-widest mt-0.5 italic">Human approval required to lock structure</p>
                                                                </div>
                                                                <button
                                                                    onClick={() => setAreRequirementsApproved(!areRequirementsApproved)}
                                                                    className={cn(
                                                                        "w-fit px-8 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 outline-none",
                                                                        areRequirementsApproved
                                                                            ? "bg-green-50 text-green-600 border border-green-200"
                                                                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100"
                                                                    )}
                                                                >
                                                                    {areRequirementsApproved ? (
                                                                        <><CheckCircleIcon className="h-4 w-4" /> Approved</>
                                                                    ) : (
                                                                        "Approve & Continue"
                                                                    )}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'source' && (
                                        <div className="space-y-10">
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Step 3 of 7</label>
                                                <h3 className="text-xl font-bold text-gray-900 italic">Connect Dynamic Feed</h3>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                                {/* Feed List or Selected Feed */}
                                                <div className="lg:col-span-1 space-y-6">
                                                    {!selectedFeed ? (
                                                        <div className="grid grid-cols-1 gap-4">
                                                            {isFetchingFeeds ? (
                                                                Array.from({ length: 4 }).map((_, i) => (
                                                                    <div key={i} className="h-24 bg-gray-50 rounded-2xl animate-pulse" />
                                                                ))
                                                            ) : (
                                                                dataSources.length > 0 ? (
                                                                    dataSources.map(feed => (
                                                                        <button
                                                                            key={feed.id}
                                                                            onClick={() => {
                                                                                setSelectedFeed(feed);
                                                                                setIsLoading(true); // Immediate trigger
                                                                                fetchFeedSample(feed);
                                                                            }}
                                                                            className="group p-5 bg-white border-2 border-gray-100 rounded-2xl hover:border-blue-600 transition-all text-left shadow-sm hover:shadow-xl"
                                                                        >
                                                                            <div className="flex items-center gap-4">
                                                                                <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-600 transition-all">
                                                                                    <CircleStackIcon className="h-5 w-5 text-blue-600 group-hover:text-white" />
                                                                                </div>
                                                                                <div className="flex-1 truncate">
                                                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{feed.type || 'Data Source'}</p>
                                                                                    <p className="text-sm font-bold text-gray-900 truncate">{feed.name.replace(/^[a-zA-Z0-9]+__/g, '')}</p>
                                                                                </div>
                                                                            </div>
                                                                        </button>
                                                                    ))
                                                                ) : (
                                                                    <div className="p-12 text-center border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center gap-4">
                                                                        <div className="h-12 w-12 bg-gray-50 rounded-2xl flex items-center justify-center">
                                                                            <ExclamationTriangleIcon className="h-6 w-6 text-gray-400" />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">{feedListError || 'No feeds found for this client'}</p>
                                                                            <p className="text-[9px] text-gray-500 font-medium">Verify you have access to Alli Data Explorer for this client.</p>
                                                                        </div>
                                                                        <button
                                                                            onClick={fetchDataSources}
                                                                            className="mt-4 px-6 py-2 bg-white border border-gray-200 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2"
                                                                        >
                                                                            <ArrowPathIcon className="h-3 w-3" /> Refresh Feeds
                                                                        </button>
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-white rounded-3xl p-8 border-2 border-blue-100 space-y-8 shadow-sm relative overflow-hidden">
                                                            <div className="relative z-10 flex items-center gap-6">
                                                                <div className="h-16 w-16 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                                                                    <CircleStackIcon className="h-8 w-8 text-blue-600" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Active Connection</p>
                                                                    <h4 className="text-2xl font-black italic text-gray-900">{selectedFeed.name.replace(/^[a-zA-Z0-9]+__/g, '')}</h4>
                                                                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mt-1">Ready for mapping</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => setSelectedFeed(null)}
                                                                className="relative z-10 w-full py-3 bg-gray-50 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-gray-100 hover:border-blue-200"
                                                            >
                                                                Change Feed Source
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Field Overview */}
                                                <div className="lg:col-span-2">
                                                    {isLoading ? (
                                                        <div className="bg-white rounded-3xl border-2 border-gray-100 p-8 space-y-8 h-[550px] flex flex-col items-center justify-center">
                                                            <div className="relative">
                                                                <div className="h-16 w-16 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
                                                                <CircleStackIcon className="h-6 w-6 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                                            </div>
                                                            <div className="text-center space-y-2">
                                                                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">Analyzing Source Schema...</p>
                                                                <p className="text-[9px] font-medium text-gray-400">Discovering metrics, dimensions, and data types</p>
                                                            </div>
                                                        </div>
                                                    ) : selectedFeed ? (
                                                        <div className="bg-white rounded-3xl border-2 border-gray-100 flex flex-col h-[550px] shadow-sm overflow-hidden">
                                                            {/* Header */}
                                                            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
                                                                        <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Feed Schema Discovery</h4>
                                                                    </div>
                                                                    <p className="text-[9px] font-medium text-gray-400 ml-3.5">Active validation of available data fields</p>
                                                                </div>
                                                                <div className="flex items-center gap-4">
                                                                    <div className="text-right">
                                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Total Fields</p>
                                                                        <p className="text-sm font-black text-blue-600">{(feedMetadata?.dimensions?.length || 0) + (feedMetadata?.measures?.length || 0)}</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Scrollable Content */}
                                                            <div className="flex-1 overflow-auto p-6 scrollbar-hide">
                                                                {isLoading ? (
                                                                    <div className="h-full flex flex-col items-center justify-center space-y-4">
                                                                        <div className="h-8 w-8 border-2 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
                                                                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Hydrating Sample Rows...</p>
                                                                    </div>
                                                                ) : feedMetadata?.error ? (
                                                                    <div className="h-full flex flex-col items-center justify-center p-8 bg-red-50/30">
                                                                        <div className="h-16 w-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 border border-red-100 italic shadow-sm">
                                                                            <ExclamationTriangleIcon className="h-8 w-8" />
                                                                        </div>

                                                                        <div className="text-center max-w-md space-y-4">
                                                                            <div>
                                                                                <p className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em] mb-1">Critical Connection Failure</p>
                                                                                <h4 className="text-lg font-black text-gray-900 leading-tight">Source Query Failed</h4>
                                                                            </div>

                                                                            <div className="bg-white/80 backdrop-blur-sm border border-red-100 rounded-2xl p-5 text-left shadow-sm space-y-3">
                                                                                <div className="flex items-center gap-2 pb-2 border-b border-red-50">
                                                                                    <div className="h-2 w-2 rounded-full bg-red-500" />
                                                                                    <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Debug Diagnostic</p>
                                                                                </div>

                                                                                <div className="space-y-2 overflow-hidden">
                                                                                    <p className="text-[11px] font-bold text-red-700 bg-red-50/50 p-2 rounded-lg break-words leading-relaxed">
                                                                                        {typeof feedMetadata.error === 'object' ? feedMetadata.error.error : feedMetadata.error}
                                                                                    </p>

                                                                                    {typeof feedMetadata.error === 'object' && (
                                                                                        <div className="grid grid-cols-1 gap-1.5 pt-2 text-[9px] font-medium text-gray-500">
                                                                                            <div className="flex justify-between py-1 border-b border-gray-100">
                                                                                                <span className="uppercase font-bold tracking-widest text-gray-400">Target Model</span>
                                                                                                <span className="font-mono text-gray-900">{feedMetadata.error.modelName}</span>
                                                                                            </div>
                                                                                            <div className="flex justify-between py-1 border-b border-gray-100">
                                                                                                <span className="uppercase font-bold tracking-widest text-gray-400">Client Slug</span>
                                                                                                <span className="font-mono text-gray-900">{feedMetadata.error.clientSlug}</span>
                                                                                            </div>
                                                                                            <div className="flex justify-between py-1 border-b border-gray-100">
                                                                                                <span className="uppercase font-bold tracking-widest text-gray-400">Error Category</span>
                                                                                                <span className="font-bold text-red-600">{feedMetadata.error.category}</span>
                                                                                            </div>
                                                                                            <div className="flex justify-between py-1 border-b border-gray-100">
                                                                                                <span className="uppercase font-bold tracking-widest text-gray-400">Proxy Status</span>
                                                                                                <span className={cn(
                                                                                                    "font-bold",
                                                                                                    feedMetadata.error.proxyStatus === 'Reachable' ? "text-green-600" : "text-red-600"
                                                                                                )}>{feedMetadata.error.proxyStatus}</span>
                                                                                            </div>
                                                                                            <div className="pt-3">
                                                                                                <p className="uppercase font-bold tracking-widest text-gray-400 mb-1.5">Recommended Fix</p>
                                                                                                <p className="text-gray-700 leading-relaxed bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                                                                                                    {feedMetadata.error.recommendation}
                                                                                                </p>
                                                                                            </div>

                                                                                            <div className="mt-4 opacity-50">
                                                                                                <p className="uppercase font-bold tracking-widest text-[8px] text-gray-400 mb-1">Technical Stack</p>
                                                                                                <div className="bg-gray-50 p-2 rounded max-h-24 overflow-y-auto font-mono text-[8px] break-all">
                                                                                                    {feedMetadata.error.stack}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            <button
                                                                                onClick={() => fetchFeedSample(selectedFeed)}
                                                                                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
                                                                            >
                                                                                Force Retry Sync
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : feedSampleData.length > 0 ? (
                                                                    <div className="space-y-6">
                                                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                                                            <table className="w-full border-separate border-spacing-y-2 min-w-[800px]">
                                                                                <thead className="sticky top-0 bg-white z-10">
                                                                                    <tr className="text-left">
                                                                                        {Object.keys(feedSampleData[0] || {}).map(col => (
                                                                                            <th key={col} className="pb-4 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 whitespace-nowrap">{col.replace(/^[a-zA-Z0-9]+__/g, '')}</th>
                                                                                        ))}
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {feedSampleData.slice(0, 10).map((row, idx) => (
                                                                                        <tr key={idx} className="group hover:bg-blue-50/30 transition-all">
                                                                                            {Object.keys(row).map(col => {
                                                                                                const val = String(row[col]);
                                                                                                const isUrl = val.startsWith('http') && (val.includes('.jpg') || val.includes('.png') || val.includes('.webp') || val.includes('picsum'));

                                                                                                return (
                                                                                                    <td key={col} className="p-3 bg-gray-50/50 group-hover:bg-blue-50/50 first:rounded-l-xl last:rounded-r-xl border-y border-gray-100 whitespace-nowrap">
                                                                                                        {isUrl ? (
                                                                                                            <div className="relative h-10 w-16 rounded-lg overflow-hidden border-2 border-white shadow-sm group-hover:border-blue-400 transition-all">
                                                                                                                <img src={val} className="h-full w-full object-cover" alt="preview" />
                                                                                                            </div>
                                                                                                        ) : (
                                                                                                            <span className="text-[10px] font-medium text-gray-900 truncate max-w-[120px] block">{val}</span>
                                                                                                        )}
                                                                                                    </td>
                                                                                                );
                                                                                            })}
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>

                                                                        <div className="pt-4 flex items-center gap-3">
                                                                            <div className="h-8 w-8 bg-green-50 rounded-lg flex items-center justify-center">
                                                                                <CheckCircleIcon className="h-5 w-5 text-green-600" />
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest leading-none mb-1">Data Health & Structure Validated</p>
                                                                                <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest leading-none">Ready for schema mapping and generation</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="h-full flex flex-col items-center justify-center text-center px-12">
                                                                        <div className="h-16 w-16 bg-amber-50 text-amber-400 rounded-2xl flex items-center justify-center mb-4">
                                                                            <CircleStackIcon className="h-8 w-8" />
                                                                        </div>
                                                                        <p className="text-xs font-bold text-gray-900 mb-1">No Sample Data Returned</p>
                                                                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-tight leading-relaxed">The source connected, but returned no rows for the selected dimensions. Please verify the feed source contents.</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 h-[500px] flex flex-col items-center justify-center text-center px-20">
                                                            <CloudArrowUpIcon className="h-12 w-12 text-gray-200 mb-6" />
                                                            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">No Feed Selected</h4>
                                                            <p className="text-xs font-medium text-gray-300">Select a validated data source from the left to explore its available fields for mapping.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'mapping' && (() => {
                                        const activeWireframe = SOCIAL_WIREFRAMES.find(w => w.id === stepData.selectedWireframe);
                                        return (
                                            <div className="space-y-10">
                                                <div className="space-y-1">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Step 4 of 7</label>
                                                    <h3 className="text-xl font-bold text-gray-900 italic">Field Mapping &amp; Validation</h3>
                                                    {activeWireframe && (
                                                        <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">
                                                            Mapping fields for: {activeWireframe.name}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                                    {/* Left: Mapping Controls */}
                                                    <div className="lg:col-span-1 space-y-6">
                                                        <div className="bg-white rounded-3xl border-2 border-gray-100 p-8 space-y-8 shadow-sm">
                                                            <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                                                                {activeWireframe ? `${activeWireframe.name} — Required Fields` : 'Requirements Mapping'}
                                                            </h4>

                                                            <div className="space-y-5">
                                                                {requirements.map(field => {
                                                                    const isLogo = field.label?.toLowerCase() === 'logo' || field.id?.toLowerCase() === 'logo';
                                                                    // Logo is always brand-house — skip feed/upload tabs for it
                                                                    if (isLogo) {
                                                                        const variantKey = `${field.id}__logoVariant`;
                                                                        const activeVariant = (stepData[variantKey] as string) || 'primary';
                                                                        return (
                                                                            <div key={field.id} className="space-y-2 pb-4 border-b border-gray-50 last:border-0">
                                                                                <div className="flex items-center justify-between">
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <CircleStackIcon className="h-3 w-3 text-purple-500" />
                                                                                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-tighter">Logo</span>
                                                                                    </div>
                                                                                    <span className="text-[8px] font-bold px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full border border-purple-100">Brand House</span>
                                                                                </div>
                                                                                {assetHouse?.logoPrimary ? (
                                                                                    <div className="flex gap-2">
                                                                                        {[
                                                                                            { key: 'primary', src: assetHouse.logoPrimary, label: 'Primary' },
                                                                                            ...(assetHouse.logoInverse ? [{ key: 'inverse', src: assetHouse.logoInverse, label: 'Inverse' }] : []),
                                                                                            ...(assetHouse.logoFavicon ? [{ key: 'favicon', src: assetHouse.logoFavicon, label: 'Icon' }] : []),
                                                                                        ].map(opt => {
                                                                                            const active = activeVariant === opt.key;
                                                                                            return (
                                                                                                <button
                                                                                                    key={opt.key}
                                                                                                    onClick={() => setStepData({ ...stepData, [variantKey]: opt.key })}
                                                                                                    className={cn(
                                                                                                        'flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all bg-white',
                                                                                                        active ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-gray-100 hover:border-gray-200'
                                                                                                    )}
                                                                                                >
                                                                                                    <img src={opt.src} className="h-5 object-contain" alt={opt.label} />
                                                                                                    <span className="text-[7px] font-black uppercase tracking-widest text-gray-500">{opt.label}</span>
                                                                                                </button>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                ) : (
                                                                                    <p className="text-[9px] text-gray-400 italic px-2">No logo found in Asset House</p>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    }

                                                                    // All other fields
                                                                    const modeKey = `${field.id}__mode`;
                                                                    const mode: string = (stepData[modeKey] as string) || (field.category === 'Brand' ? 'brand' : 'feed');
                                                                    const uploadKey = `${field.id}__upload`;
                                                                    const isImage = field.type === 'image';
                                                                    const isBackground = field.id?.toLowerCase().includes('background') || field.label?.toLowerCase().includes('background');

                                                                    const sourceTabs = [
                                                                        { key: 'feed', label: 'Feed' },
                                                                        { key: 'upload', label: isBackground ? 'URL / Upload' : 'Upload' },
                                                                    ];

                                                                    return (
                                                                        <div key={field.id} className="space-y-2 pb-4 border-b border-gray-50 last:border-0">
                                                                            <div className="flex items-center justify-between">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <CircleStackIcon className="h-3 w-3 text-blue-600" />
                                                                                    <span className="text-[10px] font-black text-gray-700 uppercase tracking-tighter">{field.label}</span>
                                                                                </div>
                                                                                <span className="text-[8px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">{field.type}</span>
                                                                            </div>

                                                                            <div className="flex p-0.5 bg-gray-100 rounded-lg w-full">
                                                                                {sourceTabs.map(({ key, label }) => (
                                                                                    <button
                                                                                        key={key}
                                                                                        onClick={() => setStepData({ ...stepData, [modeKey]: key })}
                                                                                        className={cn(
                                                                                            'flex-1 py-1.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all',
                                                                                            mode === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                                                                                        )}
                                                                                    >
                                                                                        {label}
                                                                                    </button>
                                                                                ))}
                                                                            </div>

                                                                            {mode === 'feed' && (
                                                                                <select
                                                                                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white outline-none text-[11px] font-bold text-gray-900 transition-all appearance-none cursor-pointer"
                                                                                    value={feedMappings[field.id] || ''}
                                                                                    onChange={(e) => setFeedMappings({ ...feedMappings, [field.id]: e.target.value })}
                                                                                >
                                                                                    <option value="">(Select Data Column)</option>
                                                                                    {Object.keys(feedSampleData[0] || {}).map(col => (
                                                                                        <option key={col} value={col}>{col.replace(/^[a-zA-Z0-9]+__/g, '')}</option>
                                                                                    ))}
                                                                                </select>
                                                                            )}

                                                                            {mode === 'upload' && (
                                                                                <div className="space-y-2">
                                                                                    {isImage ? (
                                                                                        <>
                                                                                            {/* URL paste input for images (especially useful for background images) */}
                                                                                            <input
                                                                                                type="text"
                                                                                                placeholder="Paste image URL…"
                                                                                                className="w-full px-3 py-2 rounded-xl bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white outline-none text-[10px] font-medium text-gray-900 transition-all"
                                                                                                value={typeof stepData[uploadKey] === 'string' && (stepData[uploadKey] as string).startsWith('http') ? (stepData[uploadKey] as string) : ''}
                                                                                                onChange={(e) => {
                                                                                                    const url = e.target.value;
                                                                                                    setStepData({ ...stepData, [uploadKey]: url });
                                                                                                    setFeedMappings({ ...feedMappings, [field.id]: `__upload__${field.id}` });
                                                                                                }}
                                                                                            />
                                                                                            <label className="flex items-center justify-center gap-2 w-full py-2 px-3 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                                                                                                <CloudArrowUpIcon className="h-4 w-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
                                                                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-500">
                                                                                                    {stepData[uploadKey] ? 'Replace file' : 'Upload file'}
                                                                                                </span>
                                                                                                <input
                                                                                                    type="file"
                                                                                                    accept="image/*"
                                                                                                    className="hidden"
                                                                                                    onChange={(e) => {
                                                                                                        const file = e.target.files?.[0];
                                                                                                        if (!file) return;
                                                                                                        const reader = new FileReader();
                                                                                                        reader.onload = (ev) => {
                                                                                                            const dataUrl = ev.target?.result as string;
                                                                                                            setStepData({ ...stepData, [uploadKey]: dataUrl });
                                                                                                            setFeedMappings({ ...feedMappings, [field.id]: `__upload__${field.id}` });
                                                                                                        };
                                                                                                        reader.readAsDataURL(file);
                                                                                                    }}
                                                                                                />
                                                                                            </label>
                                                                                            {stepData[uploadKey] && (
                                                                                                <div className="relative">
                                                                                                    <img src={stepData[uploadKey] as string} className="w-full h-16 object-cover rounded-lg border border-gray-100" alt="preview" />
                                                                                                    <button
                                                                                                        onClick={() => {
                                                                                                            setStepData({ ...stepData, [uploadKey]: undefined });
                                                                                                            const { [field.id]: _, ...rest } = feedMappings;
                                                                                                            setFeedMappings(rest);
                                                                                                        }}
                                                                                                        className="absolute top-1 right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center"
                                                                                                    >
                                                                                                        <span className="text-white text-[8px] font-black">✕</span>
                                                                                                    </button>
                                                                                                </div>
                                                                                            )}
                                                                                        </>
                                                                                    ) : (
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder={`Enter ${field.label}…`}
                                                                                            className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white outline-none text-[11px] font-bold text-gray-900 transition-all"
                                                                                            value={(stepData[uploadKey] as string) || ''}
                                                                                            onChange={(e) => {
                                                                                                setStepData({ ...stepData, [uploadKey]: e.target.value });
                                                                                                setFeedMappings({ ...feedMappings, [field.id]: `__upload__${field.id}` });
                                                                                            }}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Right: Live Template Preview */}
                                                    {(() => {
                                                        // Only show live template preview if a wireframe was selected
                                                        if (!stepData.selectedWireframe) return null;
                                                        const liveWf = SOCIAL_WIREFRAMES.find(w => w.id === stepData.selectedWireframe);
                                                        if (!liveWf) return null;

                                                        const previewRow = feedSampleData[0] || null;

                                                        // Build live injections from current mapping state
                                                        const liveModeFor = (fieldId: string, category?: string) =>
                                                            (stepData[`${fieldId}__mode`] as string) || (category === 'Brand' ? 'brand' : 'feed');

                                                        const liveInjections: Record<string, { type: 'image' | 'text'; value: string }> = {};
                                                        for (const field of requirements) {
                                                            const mode = liveModeFor(field.id, field.category);
                                                            let val = '';
                                                            if (mode === 'upload') {
                                                                val = (stepData[`${field.id}__upload`] as string) || '';
                                                            } else if (mode === 'brand') {
                                                                if (field.label === 'Logo') {
                                                                    const logoVariant = (stepData[`${field.id}__logoVariant`] as string) || 'primary';
                                                                    val = logoVariant === 'inverse'
                                                                        ? (assetHouse?.logoInverse || assetHouse?.logoPrimary || '')
                                                                        : (assetHouse?.logoPrimary || '');
                                                                }
                                                            } else if (mode === 'feed' && previewRow) {
                                                                const col = feedMappings[field.id];
                                                                if (col && !col.startsWith('__upload__')) {
                                                                    val = previewRow[col] || '';
                                                                } else if (col?.startsWith('__upload__')) {
                                                                    val = (stepData[`${field.id}__upload`] as string) || '';
                                                                }
                                                            }
                                                            if (val) {
                                                                liveInjections[field.id] = {
                                                                    type: field.type === 'image' ? 'image' : 'text',
                                                                    value: val,
                                                                };
                                                            }
                                                        }

                                                        // Always inject logo — respect variant selection from the left panel
                                                        const logoReq = requirements.find(r => r.label?.toLowerCase() === 'logo' || r.id?.toLowerCase() === 'logo');
                                                        const logoVariantKey = logoReq ? `${logoReq.id}__logoVariant` : '';
                                                        const logoVariantVal = logoVariantKey ? ((stepData[logoVariantKey] as string) || 'primary') : 'primary';
                                                        const resolvedLogo = logoVariantVal === 'inverse'
                                                            ? (assetHouse?.logoInverse || assetHouse?.logoPrimary || '')
                                                            : logoVariantVal === 'favicon'
                                                                ? (assetHouse?.logoFavicon || assetHouse?.logoPrimary || '')
                                                                : (assetHouse?.logoPrimary || '');
                                                        if (resolvedLogo) {
                                                            liveInjections['logo'] = { type: 'image', value: resolvedLogo };
                                                        }

                                                        // CSS overrides from brand selections
                                                        const liveCss: Record<string, string> = {
                                                            ...(stepData['__css_background_color'] ? { background_color: stepData['__css_background_color'] as string } : {}),
                                                            ...(stepData['__css_accent_color'] ? { accent_color: stepData['__css_accent_color'] as string } : {}),
                                                            ...(stepData['__css_text_color'] ? { text_color: stepData['__css_text_color'] as string } : {}),
                                                            ...(stepData['__css_font_family'] ? { font_family: stepData['__css_font_family'] as string } : {}),
                                                        };

                                                        const adSize = liveWf.adSize || 1024;
                                                        // Scale to fill ~500px wide area
                                                        const targetWidth = 480;
                                                        const liveScale = targetWidth / adSize;

                                                        return (
                                                            <div className="lg:col-span-2 space-y-4 sticky top-4">
                                                                {/* Header */}
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Preview — {liveWf.name}</p>
                                                                    </div>
                                                                    <div className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-widest">
                                                                        {Object.keys(liveInjections).length} / {requirements.length} fields active
                                                                    </div>
                                                                </div>

                                                                {/* Live template iframe */}
                                                                <div className="rounded-3xl overflow-hidden border-2 border-gray-100 shadow-2xl bg-white"
                                                                    style={{ width: `${Math.round(adSize * liveScale)}px`, height: `${Math.round(adSize * liveScale)}px` }}
                                                                >
                                                                    <FilledTemplatePreview
                                                                        templateFile={liveWf.file}
                                                                        name={liveWf.name}
                                                                        scale={liveScale}
                                                                        adSize={adSize}
                                                                        injections={liveInjections}
                                                                        cssOverrides={liveCss}
                                                                    />
                                                                </div>

                                                                {/* Brand Asset Overrides panel — colors, font */}
                                                                <div className="bg-white rounded-3xl border-2 border-gray-100 p-6 shadow-sm space-y-5">
                                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Brand Overrides</p>

                                                                    {/* Background color — from brand house colours */}
                                                                    <div className="space-y-2">
                                                                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">Background Color</p>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {[
                                                                                ...(assetHouse?.primaryColor ? [{ label: 'Primary', value: assetHouse.primaryColor }] : []),
                                                                                ...(assetHouse?.variables?.filter(v => v.type === 'color').map(v => ({ label: v.name, value: v.value })) || []),
                                                                                { label: 'White', value: '#ffffff' },
                                                                                { label: 'Black', value: '#000000' },
                                                                                { label: 'None', value: '' },
                                                                            ].map(opt => {
                                                                                const active = (stepData['__css_background_color'] as string || '') === opt.value;
                                                                                return (
                                                                                    <button
                                                                                        key={opt.label}
                                                                                        title={opt.label}
                                                                                        onClick={() => setStepData({ ...stepData, '__css_background_color': opt.value })}
                                                                                        className={cn(
                                                                                            'h-7 w-7 rounded-full border-2 transition-all shadow-sm',
                                                                                            active ? 'border-blue-600 scale-110 ring-2 ring-blue-200' : 'border-gray-200 hover:scale-105'
                                                                                        )}
                                                                                        style={{ background: opt.value || 'linear-gradient(135deg,#e5e7eb 50%,#fff 50%)' }}
                                                                                    />
                                                                                );
                                                                            })}
                                                                            <input type="color" title="Custom" className="h-7 w-7 rounded-full border-2 border-gray-200 cursor-pointer" value={(stepData['__css_background_color'] as string) || '#ffffff'} onChange={e => setStepData({ ...stepData, '__css_background_color': e.target.value })} />
                                                                        </div>
                                                                    </div>

                                                                    {/* Accent color — from brand house */}
                                                                    <div className="space-y-2">
                                                                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">Accent Color (badges, banners)</p>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {[
                                                                                ...(assetHouse?.primaryColor ? [{ label: 'Primary', value: assetHouse.primaryColor }] : []),
                                                                                ...(assetHouse?.variables?.filter(v => v.type === 'color').map(v => ({ label: v.name, value: v.value })) || []),
                                                                                { label: 'White', value: '#ffffff' },
                                                                                { label: 'Black', value: '#000000' },
                                                                                { label: 'None', value: '' },
                                                                            ].map(opt => {
                                                                                const active = (stepData['__css_accent_color'] as string || '') === opt.value;
                                                                                return (
                                                                                    <button
                                                                                        key={opt.label}
                                                                                        title={opt.label}
                                                                                        onClick={() => setStepData({ ...stepData, '__css_accent_color': opt.value })}
                                                                                        className={cn(
                                                                                            'h-7 w-7 rounded-full border-2 transition-all shadow-sm',
                                                                                            active ? 'border-blue-600 scale-110 ring-2 ring-blue-200' : 'border-gray-200 hover:scale-105'
                                                                                        )}
                                                                                        style={{ background: opt.value || 'linear-gradient(135deg,#e5e7eb 50%,#fff 50%)' }}
                                                                                    />
                                                                                );
                                                                            })}
                                                                            <input type="color" title="Custom" className="h-7 w-7 rounded-full border-2 border-gray-200 cursor-pointer" value={(stepData['__css_accent_color'] as string) || '#ffffff'} onChange={e => setStepData({ ...stepData, '__css_accent_color': e.target.value })} />
                                                                        </div>
                                                                    </div>

                                                                    {/* Text color — from brand house */}
                                                                    <div className="space-y-2">
                                                                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">Text Color</p>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {[
                                                                                ...(assetHouse?.primaryColor ? [{ label: 'Primary', value: assetHouse.primaryColor }] : []),
                                                                                ...(assetHouse?.variables?.filter(v => v.type === 'color').map(v => ({ label: v.name, value: v.value })) || []),
                                                                                { label: 'White', value: '#ffffff' },
                                                                                { label: 'Black', value: '#000000' },
                                                                                { label: 'None', value: '' },
                                                                            ].map(opt => {
                                                                                const active = (stepData['__css_text_color'] as string || '') === opt.value;
                                                                                return (
                                                                                    <button
                                                                                        key={opt.label}
                                                                                        title={opt.label}
                                                                                        onClick={() => setStepData({ ...stepData, '__css_text_color': opt.value })}
                                                                                        className={cn(
                                                                                            'h-7 w-7 rounded-full border-2 transition-all shadow-sm',
                                                                                            active ? 'border-blue-600 scale-110 ring-2 ring-blue-200' : 'border-gray-200 hover:scale-105'
                                                                                        )}
                                                                                        style={{ background: opt.value || 'linear-gradient(135deg,#e5e7eb 50%,#fff 50%)' }}
                                                                                    />
                                                                                );
                                                                            })}
                                                                            <input type="color" title="Custom" className="h-7 w-7 rounded-full border-2 border-gray-200 cursor-pointer" value={(stepData['__css_text_color'] as string) || '#000000'} onChange={e => setStepData({ ...stepData, '__css_text_color': e.target.value })} />
                                                                        </div>
                                                                    </div>

                                                                    {/* Font selector — from brand house */}
                                                                    {(assetHouse?.fontPrimary || (assetHouse?.variables?.some(v => v.type === 'font'))) && (
                                                                        <div className="space-y-2">
                                                                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">Font</p>
                                                                            <div className="flex flex-col gap-1.5">
                                                                                {[
                                                                                    ...(assetHouse?.fontPrimary ? [{ label: 'Primary — ' + assetHouse.fontPrimary, value: assetHouse.fontPrimary }] : []),
                                                                                    ...(assetHouse?.variables?.filter(v => v.type === 'font').map(v => ({ label: v.name + ' — ' + v.value, value: v.value })) || []),
                                                                                ].map(opt => {
                                                                                    const active = (stepData['__css_font_family'] as string || '') === opt.value;
                                                                                    return (
                                                                                        <button
                                                                                            key={opt.value}
                                                                                            onClick={() => setStepData({ ...stepData, '__css_font_family': opt.value })}
                                                                                            className={cn(
                                                                                                'w-full px-3 py-2 rounded-xl border-2 text-left text-[9px] font-bold uppercase tracking-widest transition-all',
                                                                                                active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'
                                                                                            )}
                                                                                        >
                                                                                            {opt.label}
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Mapped fields badge bar */}
                                                                    {Object.keys(feedMappings).length > 0 && (
                                                                        <div className="pt-4 border-t border-gray-50 flex flex-wrap gap-1.5">
                                                                            {Object.entries(feedMappings).map(([slot, col]) => (
                                                                                <div key={slot} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 border border-gray-800 rounded-lg">
                                                                                    <CircleStackIcon className="h-2.5 w-2.5 text-blue-400" />
                                                                                    <span className="text-[8px] font-black text-white uppercase tracking-widest">{slot}</span>
                                                                                    <ArrowRightIcon className="h-1.5 w-1.5 text-white/40" />
                                                                                    <span className="text-[8px] font-bold text-blue-300 truncate max-w-[80px]">{col.replace(/^[a-zA-Z0-9]+__/g, '')}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Fallback: show Generative Asset Constructor when no wireframe selected */}
                                                    {!stepData.selectedWireframe && (
                                                        <div className="lg:col-span-2 space-y-6">
                                                            <div className="bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-sm relative overflow-hidden flex flex-col min-h-[600px]">
                                                                <div className="flex items-center justify-between mb-8 z-10">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-2 w-2 bg-blue-600 rounded-full animate-pulse" />
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Generative Asset Constructor</p>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <div className="text-[9px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-md">
                                                                            {Object.keys(feedMappings).length} Fields Mapped
                                                                        </div>
                                                                        <div className="text-[9px] font-bold text-purple-600 uppercase tracking-widest bg-purple-50 px-2 py-1 rounded-md">
                                                                            {requirements.filter(r => r.category === 'Brand').length} Brand Anchors
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1 space-y-6">
                                                                    {feedSampleData.slice(0, 3).map((row, idx) => {
                                                                        const resolveValue = (fieldId: string): string => {
                                                                            const mapping = feedMappings[fieldId];
                                                                            if (!mapping) return '';
                                                                            if (mapping.startsWith('__upload__')) return (stepData[`${fieldId}__upload`] as string) || '';
                                                                            return row[mapping] || '';
                                                                        };
                                                                        return (
                                                                            <div key={idx} className="group relative bg-gray-50/50 rounded-2xl border-2 border-gray-100 p-6 hover:border-blue-200 transition-all">
                                                                                <div className="absolute -top-3 -left-3 h-6 w-12 bg-gray-900 text-white text-[10px] font-black flex items-center justify-center rounded-lg shadow-lg">#{idx + 1}</div>
                                                                                <div className="flex gap-6">
                                                                                    <div className="w-1/3 aspect-[4/5] bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm relative">
                                                                                        {(() => {
                                                                                            const imgField = requirements.find(r => r.type === 'image');
                                                                                            const imgSrc = imgField ? resolveValue(imgField.id) : '';
                                                                                            return imgSrc ? (
                                                                                                <img src={imgSrc} className="h-full w-full object-cover" alt="dynamic-product" />
                                                                                            ) : (
                                                                                                <div className="h-full w-full flex flex-col items-center justify-center text-center p-4 bg-gray-100/50">
                                                                                                    <PhotoIcon className="h-6 w-6 text-gray-300 mb-2" />
                                                                                                    <p className="text-[8px] font-bold text-gray-400 uppercase leading-tight italic">
                                                                                                        {requirements.some(r => r.type === 'image') ? 'Waiting for Image Mapping' : 'No Image Required'}
                                                                                                    </p>
                                                                                                </div>
                                                                                            );
                                                                                        })()}
                                                                                        <div className="absolute top-3 left-3 h-8 w-8 bg-white/90 backdrop-blur rounded-lg shadow-sm p-1.5 border border-white/20">
                                                                                            {assetHouse?.logoPrimary ? (
                                                                                                <img src={assetHouse.logoPrimary} className="h-full w-full object-contain" alt="brand" />
                                                                                            ) : (
                                                                                                <div className="h-full w-full bg-gray-100 rounded-md" />
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex-1 space-y-3">
                                                                                        {requirements.filter(r => r.type !== 'image').map(field => {
                                                                                            const val = resolveValue(field.id);
                                                                                            return (
                                                                                                <div key={field.id} className="min-h-[60px] p-4 bg-white rounded-xl border border-gray-100 shadow-sm border-l-4 border-l-blue-600 mb-4">
                                                                                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mb-1">{field.label}</p>
                                                                                                    <p className={cn('font-bold text-gray-900 leading-tight', field.label === 'Headline' ? 'text-[14px]' : 'text-[11px]')}>
                                                                                                        {val || <span className="text-gray-300 italic font-normal">Column Empty</span>}
                                                                                                    </p>
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="mt-8 pt-8 border-t border-gray-100 flex flex-wrap gap-2">
                                                                    {Object.entries(feedMappings).map(([slot, col]) => (
                                                                        <div key={slot} className="flex items-center gap-2.5 px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl shadow-lg ring-1 ring-white/10">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <CircleStackIcon className="h-3 w-3 text-blue-400" />
                                                                                <span className="text-[9px] font-black text-white uppercase tracking-widest">{slot}</span>
                                                                            </div>
                                                                            <ArrowRightIcon className="h-2 w-2 text-white/40" />
                                                                            <span className="text-[9px] font-bold text-blue-300 truncate max-w-[120px]">{col.replace(/^[a-zA-Z0-9]+__/g, '')}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Data Source Modal */}
                                    <Transition show={isFeedModalOpen} as={Fragment}>
                                        <Dialog as="div" className="relative z-50" onClose={() => setIsFeedModalOpen(false)}>
                                            <TransitionChild
                                                as={Fragment}
                                                enter="ease-out duration-300"
                                                enterFrom="opacity-0"
                                                enterTo="opacity-100"
                                                leave="ease-in duration-200"
                                                leaveFrom="opacity-100"
                                                leaveTo="opacity-0"
                                            >
                                                <div className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity" />
                                            </TransitionChild>

                                            <div className="fixed inset-0 z-10 overflow-y-auto">
                                                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                                                    <TransitionChild
                                                        as={Fragment}
                                                        enter="ease-out duration-300"
                                                        enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                                                        enterTo="opacity-100 translate-y-0 sm:scale-100"
                                                        leave="ease-in duration-200"
                                                        leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                                                        leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                                                    >
                                                        <DialogPanel className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                                                            <div className="bg-white px-8 py-8">
                                                                <div className="sm:flex sm:items-start">
                                                                    <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                                                                        <div className="flex items-center justify-between mb-6">
                                                                            <DialogTitle as="h3" className="text-lg font-black text-gray-900 uppercase tracking-widest">
                                                                                Select Dynamic Source
                                                                            </DialogTitle>
                                                                            <div className="relative">
                                                                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="Search sources..."
                                                                                    className="pl-9 pr-4 py-2 rounded-full bg-gray-50 border border-gray-100 text-[10px] font-bold outline-none focus:border-blue-600 focus:bg-white transition-all"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className="max-h-96 overflow-y-auto pr-2 space-y-3">
                                                                            {isFetchingFeeds ? (
                                                                                <div className="py-20 text-center space-y-4">
                                                                                    <ArrowPathIcon className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
                                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Polling Alli Data Explorer...</p>
                                                                                </div>
                                                                            ) : dataSources.length > 0 ? (
                                                                                dataSources.map((source: any) => (
                                                                                    <button
                                                                                        key={source.id}
                                                                                        onClick={() => {
                                                                                            setSelectedFeed(source);
                                                                                            setIsFeedModalOpen(false);
                                                                                            fetchFeedSample(source.name);
                                                                                        }}
                                                                                        className="w-full text-left p-4 rounded-2xl border border-gray-100 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex items-center justify-between group"
                                                                                    >
                                                                                        <div className="flex items-center gap-4">
                                                                                            <div className="h-10 w-10 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-white group-hover:shadow-md transition-all">
                                                                                                <CircleStackIcon className="h-5 w-5 text-gray-400 group-hover:text-blue-600" />
                                                                                            </div>
                                                                                            <div>
                                                                                                <p className="text-sm font-black text-gray-900 leading-none mb-1">{source.name}</p>
                                                                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate max-w-sm">
                                                                                                    {source.description || 'No description provided'}
                                                                                                </p>
                                                                                            </div>
                                                                                        </div>
                                                                                        <ArrowRightIcon className="h-4 w-4 text-gray-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                                                                                    </button>
                                                                                ))
                                                                            ) : (
                                                                                <div className="py-20 text-center flex flex-col items-center">
                                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">No data sources found matching "feed"</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="bg-gray-50 px-8 py-4 flex justify-end gap-3">
                                                                <button
                                                                    type="button"
                                                                    className="px-6 py-2 rounded-xl text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-all"
                                                                    onClick={() => setIsFeedModalOpen(false)}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </DialogPanel>
                                                    </TransitionChild>
                                                </div>
                                            </div>
                                        </Dialog>
                                    </Transition>

                                    {steps[currentStep].id === 'generate' && (
                                        <div className="space-y-10">
                                            {/* Header */}
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                                    {stepData.selectedWireframe ? 'Wireframe Integration' : 'Candidate Selection'}
                                                </label>
                                                <h3 className="text-xl font-bold text-gray-900 italic">
                                                    {stepData.selectedWireframe ? 'Confirm Your Integration' : 'Review AI-Generated Scaffolds'}
                                                </h3>
                                            </div>

                                            {isGeneratingCandidates ? (
                                                <div className="py-20 flex flex-col items-center justify-center space-y-6">
                                                    <div className="relative">
                                                        <div className="h-20 w-20 border-4 border-blue-50 rounded-full animate-spin border-t-blue-600" />
                                                        <SparklesIcon className="h-8 w-8 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                                                    </div>
                                                    <div className="text-center space-y-1">
                                                        <p className="text-sm font-black text-gray-900 uppercase tracking-widest">Synthesizing Brands Standards...</p>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mapping data feeds to visual hierarchy (1/3)</p>
                                                    </div>
                                                </div>
                                            ) : (() => {
                                                // --- TEMPLATE-SELECTED PATH ---
                                                const activeWf = SOCIAL_WIREFRAMES.find(w => w.id === (stepData.selectedWireframe || selectedWireframe?.id));
                                                const wireframeFile = stepData.wireframeFile || selectedWireframe?.file;

                                                if (activeWf && wireframeFile) {
                                                    const resolveFieldValue = (fieldId: string, row: Record<string, any> | null): string => {
                                                        const mapping = feedMappings[fieldId];
                                                        if (!mapping) return '';
                                                        if (mapping.startsWith('__upload__')) return (stepData[`${fieldId}__upload`] as string) || '';
                                                        if (!row) return '';
                                                        return row[mapping] || '';
                                                    };

                                                    const rowsToShow: (Record<string, any> | null)[] = feedSampleData.length > 0 ? feedSampleData.slice(0, 3) : [null];

                                                    // Build per-row injections for FilledTemplatePreview
                                                    const buildInjections = (row: Record<string, any> | null) => {
                                                        const inj: Record<string, { type: 'image' | 'text'; value: string }> = {};
                                                        for (const field of requirements) {
                                                            const mode = (stepData[`${field.id}__mode`] as string) || (field.category === 'Brand' ? 'brand' : 'feed');
                                                            let finalVal = resolveFieldValue(field.id, row);
                                                            if (mode === 'brand' && field.label === 'Logo' && assetHouse?.logoPrimary) {
                                                                finalVal = assetHouse.logoPrimary;
                                                            }
                                                            if (finalVal) {
                                                                inj[field.id] = { type: (field.type === 'image' ? 'image' : 'text') as 'image' | 'text', value: finalVal };
                                                            }
                                                        }
                                                        if (!inj['logo'] && assetHouse?.logoPrimary) {
                                                            inj['logo'] = { type: 'image', value: assetHouse.logoPrimary };
                                                        }
                                                        return inj;
                                                    };

                                                    return (
                                                        <div className="space-y-8">
                                                            {/* Wireframe header banner */}
                                                            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                                                <div className="h-8 w-8 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                                                                    <CheckCircleIcon className="h-5 w-5 text-white" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-[11px] font-black text-blue-900 uppercase tracking-widest">{activeWf.name}</p>
                                                                    <p className="text-[9px] font-bold text-blue-500 uppercase tracking-tighter">{rowsToShow.length} variation{rowsToShow.length !== 1 ? 's' : ''} · {Object.keys(feedMappings).length} fields mapped</p>
                                                                </div>
                                                            </div>

                                                            {/* One filled preview per feed row */}
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                                                {rowsToShow.map((row, idx) => {
                                                                    const injections = buildInjections(row);
                                                                    const previewSize = Math.round((activeWf.adSize || 1024) * 0.30);
                                                                    return (
                                                                        <div key={idx} className="space-y-3">
                                                                            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Variation #{idx + 1}</div>

                                                                            {/* FilledTemplatePreview — real mapped data injected into HTML */}
                                                                            <div className="rounded-2xl overflow-hidden border-2 border-gray-100 shadow-xl"
                                                                                style={{ width: `${previewSize}px`, height: `${previewSize}px` }}
                                                                            >
                                                                                <FilledTemplatePreview
                                                                                    templateFile={wireframeFile}
                                                                                    name={activeWf.name}
                                                                                    scale={0.30}
                                                                                    adSize={activeWf.adSize || 1024}
                                                                                    injections={injections}
                                                                                />
                                                                            </div>

                                                                            {/* Field value pills */}
                                                                            <div className="space-y-1.5">
                                                                                {requirements.filter(r => r.type !== 'image').map(field => {
                                                                                    const val = resolveFieldValue(field.id, row);
                                                                                    return val ? (
                                                                                        <div key={field.id} className="flex items-start gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                                                                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter shrink-0 pt-0.5 w-16 truncate">{field.label}</span>
                                                                                            <span className="text-[10px] font-bold text-gray-900 leading-tight flex-1 truncate">{val}</span>
                                                                                        </div>
                                                                                    ) : null;
                                                                                })}
                                                                                {requirements.filter(r => r.type === 'image').map(field => {
                                                                                    const val = resolveFieldValue(field.id, row);
                                                                                    return val ? (
                                                                                        <div key={field.id} className="rounded-xl overflow-hidden border border-gray-100">
                                                                                            <img src={val} className="w-full h-16 object-cover" alt={field.label} />
                                                                                        </div>
                                                                                    ) : null;
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                // --- AI CANDIDATES PATH (no wireframe selected) ---
                                                return (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                                        {candidates.map((candidate: any, idx: number) => {
                                                            const isSelected = selectedCandidateIndex === idx;
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    onClick={() => setSelectedCandidateIndex(idx)}
                                                                    className={cn(
                                                                        "relative group cursor-pointer rounded-2xl border-4 transition-all overflow-hidden",
                                                                        isSelected
                                                                            ? "border-blue-600 shadow-2xl scale-[1.02]"
                                                                            : "border-transparent hover:border-blue-200"
                                                                    )}
                                                                >
                                                                    {/* Preview Card */}
                                                                    <div className="group relative bg-white overflow-hidden" style={{ fontFamily: candidate.styles?.fontFamily || 'Inter' }}>
                                                                        {/* Candidate Preview Card */}
                                                                        <div className="aspect-[3/4] relative border-b border-gray-100">
                                                                            {/* Logo Slot */}
                                                                            {candidate.elements?.logo && (
                                                                                <div className="absolute top-4 left-4 h-6 w-20">
                                                                                    {candidate.styles?.logo ? (
                                                                                        <img src={candidate.styles.logo} className="h-full w-full object-contain object-left" alt="brand" />
                                                                                    ) : (
                                                                                        <div className="h-full w-full bg-gray-100 rounded animate-pulse" />
                                                                                    )}
                                                                                </div>
                                                                            )}

                                                                            {/* Main Image Slot */}
                                                                            <div className={cn(
                                                                                "absolute overflow-hidden flex items-center justify-center transition-all duration-500",
                                                                                candidate.variant === 'wide' ? "inset-0" : "inset-x-4 top-14 bottom-24 rounded-xl bg-gray-50 shadow-inner"
                                                                            )}>
                                                                                {feedSampleData[0] && feedMappings.image_url && feedSampleData[0][feedMappings.image_url] ? (
                                                                                    <img src={feedSampleData[0][feedMappings.image_url]} className={cn("h-full w-full object-cover", candidate.variant === 'wide' && "opacity-40")} />
                                                                                ) : (
                                                                                    <PhotoIcon className="h-12 w-12 text-gray-100" />
                                                                                )}
                                                                            </div>

                                                                            {/* Text Overlays */}
                                                                            <div className={cn(
                                                                                "absolute transition-all duration-500 w-full",
                                                                                candidate.variant === 'stacked' ? "px-6 top-1/2 -translate-y-1/2 text-left" :
                                                                                    candidate.variant === 'wide' ? "inset-0 flex flex-col items-center justify-center p-8 text-center" :
                                                                                        "bottom-6 px-6 space-y-2"
                                                                            )}>
                                                                                {candidate.elements?.headline && feedMappings.headline && (
                                                                                    <div className={cn(
                                                                                        "px-3 py-1.5 backdrop-blur-sm rounded shadow-lg transition-all w-max max-w-[90%]",
                                                                                        candidate.variant === 'stacked' ? "bg-white text-gray-900 mb-2 border-l-4 border-blue-600" :
                                                                                            candidate.variant === 'wide' ? "bg-transparent text-white scale-125 mb-4" :
                                                                                                "bg-black/90 text-white transform rotate-[-1deg]"
                                                                                    )}
                                                                                        style={{
                                                                                            transform: candidate.styles?.accentRotation ? `rotate(${candidate.styles.accentRotation})` : undefined
                                                                                        }}>
                                                                                        <p className={cn(
                                                                                            "font-black uppercase italic truncate",
                                                                                            candidate.variant === 'wide' ? "text-lg" : "text-[9px]"
                                                                                        )}>
                                                                                            {feedSampleData[0]?.[feedMappings.headline] || 'Preview Headline'}
                                                                                        </p>
                                                                                    </div>
                                                                                )}
                                                                                {candidate.elements?.price && feedMappings.price && (
                                                                                    <div
                                                                                        className={cn(
                                                                                            "rounded px-3 flex items-center justify-center shadow-md transition-all",
                                                                                            candidate.variant === 'stacked' ? "h-7 w-max min-w-[80px]" :
                                                                                                candidate.variant === 'wide' ? "h-10 w-max min-w-[100px] bg-white text-gray-900" :
                                                                                                    "h-6 w-20 transform rotate-[1deg]"
                                                                                        )}
                                                                                        style={{
                                                                                            backgroundColor: candidate.variant === 'wide' ? 'white' : (candidate.styles?.primaryColor || '#2563eb'),
                                                                                            color: candidate.variant === 'wide' ? '#111827' : 'white'
                                                                                        }}
                                                                                    >
                                                                                        <p className={cn(
                                                                                            "font-black uppercase italic",
                                                                                            candidate.variant === 'wide' ? "text-sm" : "text-[8px]"
                                                                                        )}>
                                                                                            {feedSampleData[0]?.[feedMappings.price] || 'Offer'}
                                                                                        </p>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Descriptor */}
                                                                        <div className="p-5 space-y-2">
                                                                            <div className="flex items-center justify-between">
                                                                                <p className="text-[11px] font-black text-gray-900 uppercase tracking-widest">{candidate.name}</p>
                                                                                <span className="text-[8px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded uppercase">{candidate.variant}</span>
                                                                            </div>
                                                                            <p className="text-[9px] text-gray-400 font-medium leading-relaxed">{candidate.description}</p>
                                                                        </div>
                                                                    </div>

                                                                    {isSelected && (
                                                                        <div className="absolute top-4 right-4 bg-blue-600 text-white p-1 rounded-full">
                                                                            <CheckIcon className="h-4 w-4" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'refine' && (
                                        <div className="space-y-12 pb-24">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Refinement & Styling</label>
                                                    <h3 className="text-xl font-bold text-gray-900 italic">Premium Studio Refinement</h3>
                                                </div>
                                                <div className="flex gap-4">
                                                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
                                                        <button
                                                            onClick={() => setTextStressTest('normal')}
                                                            className={cn("px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all", textStressTest === 'normal' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400")}
                                                        >Standard</button>
                                                        <button
                                                            onClick={() => setTextStressTest('shortest')}
                                                            className={cn("px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all", textStressTest === 'shortest' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400")}
                                                        >Min-Char</button>
                                                        <button
                                                            onClick={() => setTextStressTest('longest')}
                                                            className={cn("px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all", textStressTest === 'longest' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400")}
                                                        >Max-Char</button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                                                {/* Left: Multi-Size Preview Carousel (8 cols) */}
                                                <div className="lg:col-span-8 space-y-8">
                                                    <div className="flex items-center justify-center p-12 bg-gray-50/50 rounded-[40px] border-2 border-dashed border-gray-100 min-h-[700px] gap-12 overflow-x-auto scrollbar-hide">
                                                        {stepData.selectedWireframe ? (
                                                            (() => {
                                                                const refineWf = SOCIAL_WIREFRAMES.find(w => w.id === stepData.selectedWireframe);
                                                                if (!refineWf) return null;
                                                                const mappingData = creative?.stepData?.mapping || stepData;
                                                                const previewRow = feedSampleData[0] || null;
                                                                const refineInjections: Record<string, { type: 'image' | 'text'; value: string }> = {};
                                                                for (const field of requirements) {
                                                                    const mode: string = (mappingData[`${field.id}__mode`] as string) || (field.category === 'Brand' ? 'brand' : 'feed');
                                                                    let val = '';
                                                                    if (mode === 'upload') {
                                                                        val = (mappingData[`${field.id}__upload`] as string) || '';
                                                                    } else if (mode === 'feed' && previewRow) {
                                                                        const col = feedMappings[field.id];
                                                                        if (col && !col.startsWith('__upload__')) val = previewRow[col] || '';
                                                                        else if (col?.startsWith('__upload__')) val = (mappingData[`${field.id}__upload`] as string) || '';
                                                                    }
                                                                    if (val) refineInjections[field.id] = { type: field.type === 'image' ? 'image' : 'text', value: val };
                                                                }
                                                                const refineLogoReq = requirements.find(r => r.label?.toLowerCase() === 'logo' || r.id?.toLowerCase() === 'logo');
                                                                const refineLogoVariant = refineLogoReq ? ((mappingData[`${refineLogoReq.id}__logoVariant`] as string) || 'primary') : 'primary';
                                                                const refineLogo = refineLogoVariant === 'inverse'
                                                                    ? (assetHouse?.logoInverse || assetHouse?.logoPrimary || '')
                                                                    : refineLogoVariant === 'favicon'
                                                                        ? (assetHouse?.logoFavicon || assetHouse?.logoPrimary || '')
                                                                        : (assetHouse?.logoPrimary || '');
                                                                if (refineLogo) refineInjections['logo'] = { type: 'image', value: refineLogo };
                                                                const refineCss: Record<string, string> = {
                                                                    ...(mappingData['__css_background_color'] ? { background_color: mappingData['__css_background_color'] as string } : {}),
                                                                    ...(mappingData['__css_accent_color'] ? { accent_color: mappingData['__css_accent_color'] as string } : {}),
                                                                    ...(mappingData['__css_text_color'] ? { text_color: mappingData['__css_text_color'] as string } : {}),
                                                                    ...(mappingData['__css_font_family'] ? { font_family: mappingData['__css_font_family'] as string } : {}),
                                                                };
                                                                const refineAdSize = refineWf.adSize || 1024;
                                                                const refineScale = 420 / refineAdSize;
                                                                return (
                                                                    <div className="flex flex-col items-center gap-4">
                                                                        <div className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 flex items-center justify-center overflow-hidden" style={{ width: '450px', height: '450px' }}>
                                                                            <FilledTemplatePreview
                                                                                templateFile={refineWf.file}
                                                                                name={refineWf.name}
                                                                                scale={refineScale}
                                                                                adSize={refineAdSize}
                                                                                injections={refineInjections}
                                                                                cssOverrides={refineCss}
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-3 bg-white px-5 py-2 rounded-full border border-gray-200 shadow-lg">
                                                                            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                                                                            <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest italic">{refineWf.name} — Live Mapped Preview</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()
                                                        ) : (
                                                            (selectedRatios.length > 0 ? selectedRatios : ['1:1']).map((ratio) => {
                                                                const [width, height] = ratio.includes(':') ? ratio.split(':').map(Number) : [1, 1];
                                                                const baseWidth = 320;
                                                                const scale = width > height ? 1.2 : 0.8;
                                                                return (
                                                                    <div key={ratio} className="flex flex-col items-center gap-6 shrink-0 transform hover:scale-[1.02] transition-all duration-500">
                                                                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
                                                                            <span className="text-[10px] font-black text-gray-900 tracking-tighter italic">{ratio}</span>
                                                                            <div className="h-1 w-1 bg-gray-200 rounded-full" />
                                                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{width > height ? 'Landscape' : 'Vertical'}</span>
                                                                        </div>

                                                                        <div
                                                                            className="relative shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] overflow-hidden transition-all duration-700"
                                                                            style={{
                                                                                width: `${baseWidth * scale}px`,
                                                                                aspectRatio: `${width}/${height}`,
                                                                                backgroundColor: stepData.backgroundColor || '#ffffff',
                                                                                fontFamily: stepData.activeFont || candidates[selectedCandidateIndex || 0]?.styles?.fontFamily || 'Inter',
                                                                                borderRadius: candidates[selectedCandidateIndex || 0]?.styles?.borderRadius || '0px',
                                                                                boxShadow: candidates[selectedCandidateIndex || 0]?.styles?.shadow
                                                                            }}
                                                                        >
                                                                            {/* Gradient Overlay from Candidate Style */}
                                                                            {candidates[selectedCandidateIndex || 0]?.styles?.gradient && (
                                                                                <div className="absolute inset-0 pointer-events-none opacity-40 mix-blend-multiply" style={{ background: candidates[selectedCandidateIndex || 0].styles.gradient }} />
                                                                            )}

                                                                            {/* Logo Layer */}
                                                                            {candidates[selectedCandidateIndex || 0]?.elements?.logo && stepData.showLogo !== false && (
                                                                                <div className="absolute top-6 left-6 z-20" style={{ transform: `scale(${logoScale})`, transformOrigin: 'top left' }}>
                                                                                    <img
                                                                                        src={logoVariant === 'primary' ? (assetHouse?.logoPrimary || fallbackLogo) : (assetHouse?.logoInverse || fallbackLogo)}
                                                                                        className="h-10 w-auto object-contain"
                                                                                    />
                                                                                </div>
                                                                            )}

                                                                            {/* Core Image Layer */}
                                                                            <div className={cn(
                                                                                "absolute overflow-hidden transition-all duration-700",
                                                                                candidates[selectedCandidateIndex || 0]?.variant === 'wide' ? "inset-0" : "inset-x-6 top-20 bottom-36 rounded-2xl"
                                                                            )}>
                                                                                <img
                                                                                    src={getDeepValue(feedMappings.image_url)}
                                                                                    className={cn("h-full w-full object-cover", candidates[selectedCandidateIndex || 0]?.variant === 'wide' && "opacity-50 blur-[2px] scale-110")}
                                                                                />
                                                                            </div>

                                                                            {/* Text/CTA Composite Layer */}
                                                                            <div className={cn(
                                                                                "absolute inset-x-6 bottom-6 flex flex-col gap-4 z-10 transition-all duration-500",
                                                                                candidates[selectedCandidateIndex || 0]?.variant === 'stacked' ? "justify-center h-full top-0" : "justify-end"
                                                                            )}>
                                                                                {candidates[selectedCandidateIndex || 0]?.elements?.headline && (
                                                                                    <div
                                                                                        className={cn(
                                                                                            "bg-white/95 backdrop-blur-xl p-4 shadow-2xl transition-all border-l-[6px]",
                                                                                            candidates[selectedCandidateIndex || 0]?.variant === 'stacked' ? "bg-gray-900 border-white" : ""
                                                                                        )}
                                                                                        style={{
                                                                                            borderColor: stepData.accentColor || candidates[selectedCandidateIndex || 0]?.styles?.primaryColor,
                                                                                            transform: `rotate(${candidates[selectedCandidateIndex || 0]?.styles?.accentRotation || '0deg'}) scale(${headlineSize})`,
                                                                                            transformOrigin: 'left center'
                                                                                        }}
                                                                                    >
                                                                                        <h2 className={cn("text-xs font-black uppercase italic leading-none tracking-tight", candidates[selectedCandidateIndex || 0]?.variant === 'stacked' ? "text-white" : "text-gray-900")}>
                                                                                            {stepData.overrideHeadline || getDeepValue(feedMappings.headline) || 'No Headline Value'}
                                                                                        </h2>
                                                                                    </div>
                                                                                )}

                                                                                <div className="flex items-center justify-between gap-4">
                                                                                    {candidates[selectedCandidateIndex || 0]?.elements?.price && stepData.showPrice !== false && (
                                                                                        <div
                                                                                            className="h-10 px-5 flex items-center justify-center shadow-lg"
                                                                                            style={{
                                                                                                backgroundColor: stepData.accentColor || candidates[selectedCandidateIndex || 0]?.styles?.primaryColor || '#000',
                                                                                                transform: `scale(${priceSize})`,
                                                                                                transformOrigin: 'left center'
                                                                                            }}
                                                                                        >
                                                                                            <span className="text-[11px] font-black text-white uppercase italic">{getDeepValue(feedMappings.price) || 'N/A'}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {candidates[selectedCandidateIndex || 0]?.elements?.cta && stepData.showCTA !== false && (
                                                                                        <div className="h-10 px-6 bg-white border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all cursor-pointer">
                                                                                            <span className="text-[9px] font-black uppercase tracking-widest">SHOP NOW →</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })
                                                        )}
                                                    </div>

                                                    {/* Feed Quick-Nav */}
                                                    <div className="bg-white rounded-[32px] border-2 border-gray-100 p-6 flex items-center justify-between shadow-sm">
                                                        <div className="flex items-center gap-6">
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => setCurrentFeedIndex(Math.max(0, currentFeedIndex - 1))}
                                                                    className="h-10 w-10 flex items-center justify-center rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all"
                                                                ><ChevronLeftIcon className="h-5 w-5 text-gray-900" /></button>
                                                                <button
                                                                    onClick={() => setCurrentFeedIndex(Math.min((feedSampleData.length || 1) - 1, currentFeedIndex + 1))}
                                                                    className="h-10 w-10 flex items-center justify-center rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all"
                                                                ><ChevronRightIcon className="h-5 w-5 text-gray-900" /></button>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Testing Record {currentFeedIndex + 1} of {feedSampleData.length}</p>
                                                                <p className="text-xs font-bold text-gray-900 truncate max-w-[240px] italic">“{feedSampleData[currentFeedIndex]?.[feedMappings.headline] || 'Previewing dynamic content'}”</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest py-1 px-3 bg-blue-50 rounded-full border border-blue-100 italic">Live Feed Connected</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right: Premium Controls (4 cols) */}
                                                <div className="lg:col-span-4 space-y-8">
                                                    {/* Branding Surface */}
                                                    <div className="bg-white rounded-[32px] border-2 border-gray-100 p-8 space-y-8 shadow-sm">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.2em]">Brand Identity</h4>
                                                            <SparklesIcon className="h-4 w-4 text-blue-600" />
                                                        </div>

                                                        {/* Color Palettes from House */}
                                                        <div className="space-y-4">
                                                            <div className="flex items-center justify-between">
                                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Global Accent Color</label>
                                                                <span className="text-[8px] font-bold text-blue-600 uppercase">From House</span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {[assetHouse?.primaryColor, '#000000', '#FFFFFF', '#DC2626', '#16A34A', '#2563EB'].filter(Boolean).map(c => (
                                                                    <button
                                                                        key={c}
                                                                        onClick={() => setStepData({ ...stepData, accentColor: c })}
                                                                        className={cn("h-8 w-8 rounded-full border-2 transition-all", stepData.accentColor === c ? "border-blue-600 scale-125 shadow-xl" : "border-gray-100")}
                                                                        style={{ backgroundColor: c }}
                                                                    />
                                                                ))}
                                                                <input type="color" className="h-8 w-8 rounded-full border-2 border-gray-100 cursor-pointer overflow-hidden p-0" onChange={(e) => setStepData({ ...stepData, accentColor: e.target.value })} />
                                                            </div>
                                                        </div>

                                                        {/* Logo Management */}
                                                        <div className="space-y-4">
                                                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Logo Configuration</label>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <button
                                                                    onClick={() => setLogoVariant('primary')}
                                                                    className={cn("flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all", logoVariant === 'primary' ? "border-blue-600 bg-blue-50" : "border-gray-50")}
                                                                >
                                                                    <div className="h-4 w-12 bg-gray-900 rounded mb-2" />
                                                                    <span className="text-[8px] font-black uppercase">Primary</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => setLogoVariant('inverse')}
                                                                    className={cn("flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all", logoVariant === 'inverse' ? "border-blue-600 bg-blue-50" : "border-gray-50")}
                                                                >
                                                                    <div className="h-4 w-12 bg-gray-200 border border-gray-100 rounded mb-2" />
                                                                    <span className="text-[8px] font-black uppercase">Inverse</span>
                                                                </button>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Logo Scale</label>
                                                                    <span className="text-[9px] font-bold text-gray-900">{Math.round(logoScale * 100)}%</span>
                                                                </div>
                                                                <input
                                                                    type="range" min="0.5" max="2" step="0.1" value={logoScale}
                                                                    onChange={(e) => setLogoScale(parseFloat(e.target.value))}
                                                                    className="w-full accent-blue-600 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Typography Refinement */}
                                                    <div className="bg-white rounded-[32px] border-2 border-gray-100 p-8 space-y-8 shadow-sm">
                                                        <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.2em]">Typography Refinement</h4>

                                                        {/* Font Selection from House */}
                                                        <div className="space-y-4">
                                                            <div className="flex items-center justify-between">
                                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Brand Typeface</label>
                                                                <span className="text-[8px] font-bold text-blue-600 uppercase">From House</span>
                                                            </div>
                                                            <div className="flex flex-col gap-2">
                                                                {[
                                                                    { name: assetHouse?.fontPrimary || 'Inter' },
                                                                    ...(assetHouse?.assets?.filter(a => a.type === 'font') || [])
                                                                ].map(font => (
                                                                    <button
                                                                        key={font.name}
                                                                        onClick={() => setStepData({ ...stepData, activeFont: font.name })}
                                                                        className={cn(
                                                                            "w-full px-4 py-3 rounded-xl border-2 text-left transition-all",
                                                                            (stepData.activeFont || assetHouse?.fontPrimary || 'Inter') === font.name ? "border-blue-600 bg-blue-50" : "border-gray-50"
                                                                        )}
                                                                    >
                                                                        <span className="text-[11px] font-black uppercase italic" style={{ fontFamily: font.name }}>{font.name}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Dynamic Sizing Controls */}
                                                        <div className="space-y-6">
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Headline Size</label>
                                                                    <span className="text-[9px] font-bold text-gray-900">{Math.round(headlineSize * 100)}%</span>
                                                                </div>
                                                                <input
                                                                    type="range" min="0.5" max="2" step="0.05" value={headlineSize}
                                                                    onChange={(e) => setHeadlineSize(parseFloat(e.target.value))}
                                                                    className="w-full accent-blue-600 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                                                                />
                                                            </div>

                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Price Slot Size</label>
                                                                    <span className="text-[9px] font-bold text-gray-900">{Math.round(priceSize * 100)}%</span>
                                                                </div>
                                                                <input
                                                                    type="range" min="0.2" max="1.5" step="0.05" value={priceSize}
                                                                    onChange={(e) => setPriceSize(parseFloat(e.target.value))}
                                                                    className="w-full accent-blue-600 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                                                                />
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={handleSaveTemplate}
                                                            className="w-full py-5 bg-gray-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-[0.98]"
                                                        >
                                                            Finalize Template Preset
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {steps[currentStep].id === 'export' && (
                                        <div className="space-y-10">
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Batch Orchestration</label>
                                                <h3 className="text-xl font-bold text-gray-900 italic">Configure Final Output</h3>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                                {/* Left: Summary */}
                                                <div className="space-y-6">
                                                    <div className="bg-white rounded-3xl border-2 border-gray-100 p-8 space-y-8 shadow-sm">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                                                                <CloudArrowUpIcon className="h-7 w-7 text-blue-600" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Target Feed</p>
                                                                <p className="text-lg font-black text-gray-900 italic leading-none">{selectedFeed?.name || 'No feed selected'}</p>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-4">
                                                            <div className="flex items-center justify-between py-4 border-b border-gray-50 text-[11px]">
                                                                <span className="font-bold text-gray-400 uppercase tracking-widest">Total Assets</span>
                                                                <span className="font-black text-gray-900">{feedSampleData.length || 45} Variations</span>
                                                            </div>
                                                            <div className="flex items-center justify-between py-4 border-b border-gray-50 text-[11px]">
                                                                <span className="font-bold text-gray-400 uppercase tracking-widest">Aspect Ratio</span>
                                                                <span className="font-black text-gray-900">{stepData.ratio || '1:1'}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between py-4 border-b border-gray-50 text-[11px]">
                                                                <span className="font-bold text-gray-400 uppercase tracking-widest">Design Scaffold</span>
                                                                <span className="font-black text-gray-900">{candidates[selectedCandidateIndex || 0]?.name}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right: Export Settings */}
                                                <div className="space-y-6">
                                                    <div className="bg-white rounded-3xl border-2 border-gray-100 p-8 shadow-sm space-y-8">
                                                        <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Execute Generation</h4>
                                                        <button
                                                            className="w-full py-5 bg-black rounded-2xl text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-gray-900 transition-all flex items-center justify-center gap-3 active:scale-95"
                                                            onClick={handleExecuteBatch}
                                                        >
                                                            <SparklesIcon className="h-5 w-5" />
                                                            Execute Batch Deployment
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}


                            {/* EDIT IMAGE WIZARD */}
                            {useCaseId === 'edit-image' && (
                                <EditImageWizard
                                    currentStepId={steps[currentStep]?.id}
                                    stepData={stepData}
                                    onStepDataChange={(updates) => setStepData(updates)}
                                    clientSlug={client.slug}
                                    assetHouse={assetHouse}
                                    isLoading={isLoading}
                                    setIsLoading={setIsLoading}
                                />
                            )}

                            {/* FALLBACK FOR OTHER CORES */}
                            {useCaseId !== 'new-image' && useCaseId !== 'video-cutdown' && useCaseId !== 'template-builder' && useCaseId !== 'edit-image' && (
                                <div className="mx-auto mt-8 flex h-64 max-w-lg items-center justify-center rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/30">
                                    <div className="text-center">
                                        <p className="text-xs font-black text-gray-300 uppercase tracking-[0.2em]">
                                            {useCase?.title || 'Strategy'} Strategy Block
                                        </p>
                                        <p className="mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                            Phase {currentStep + 1} of {steps.length || 0}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
                }

                {
                    !showHistory && (() => {
                        // Context step validation checklist
                        const isContextStep = useCaseId === 'template-builder' && steps[currentStep]?.id === 'context';
                        const hasTitle = !!(stepData.jobTitle?.trim());
                        const hasChannel = !!(stepData.channel);
                        const hasSizes = selectedRatios.length > 0;
                        const contextValid = hasTitle && hasChannel && hasSizes;

                        const isNextDisabled =
                            isLoading ||
                            (isContextStep && !contextValid) ||
                            (useCaseId === 'video-cutdown' && steps[currentStep]?.id === 'upload' && !stepData.videoUrl) ||
                            (useCaseId === 'video-cutdown' && steps[currentStep]?.id === 'configure' && (!stepData.lengths || stepData.lengths.length === 0)) ||
                            (useCaseId === 'video-cutdown' && steps[currentStep]?.id === 'ai-reccos' && (!stepData.lengths?.every((l: number) => stepData[`selected_${l}`]))) ||
                            (useCaseId === 'template-builder' && (
                                (steps[currentStep]?.id === 'intent' && (!stepData.prompt || requirements.length === 0 || isAnalyzingIntent || !areRequirementsApproved)) ||
                                (steps[currentStep]?.id === 'source' && !selectedFeed) ||
                                (steps[currentStep]?.id === 'mapping' && (requirements.filter(r => r.category === 'Dynamic').some(r => !feedMappings[r.id])))
                            )) ||
                            (useCaseId === 'edit-image' && (
                                (steps[currentStep]?.id === 'select' && !stepData.imageUrl) ||
                                (steps[currentStep]?.id === 'edit-type' && !stepData.editType) ||
                                (steps[currentStep]?.id === 'canvas' && !stepData.extractedImageUrl) ||
                                (steps[currentStep]?.id === 'new-background' && !stepData.selectedBackground) ||
                                (steps[currentStep]?.id === 'preview' && !stepData.previewReady)
                            ));

                        return (
                            <div className="mt-12 pt-8 border-t border-gray-100 space-y-4">
                                {/* Context step inline validation checklist */}
                                {isContextStep && !contextValid && (
                                    <div className="flex items-center justify-end gap-6">
                                        {([
                                            { label: 'Project Title', met: hasTitle },
                                            { label: 'Channel', met: hasChannel },
                                            { label: 'Size Selected', met: hasSizes },
                                        ] as { label: string; met: boolean }[]).map(({ label, met }) => (
                                            <div key={label} className={cn(
                                                'flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-colors',
                                                met ? 'text-green-600' : 'text-gray-300'
                                            )}>
                                                <div className={cn(
                                                    'h-4 w-4 rounded-full flex items-center justify-center border transition-all',
                                                    met ? 'bg-green-500 border-green-500' : 'border-gray-200 bg-white'
                                                )}>
                                                    {met && <CheckIcon className="h-2.5 w-2.5 text-white" />}
                                                </div>
                                                {label}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={() => {
                                            const prev = currentStep - 1;
                                            setCurrentStep(Math.max(0, prev));
                                            if (useCaseId === 'edit-image') {
                                                // edit-image uses a flat object — keep current stepData
                                                // so downstream selections stay in sync
                                            } else {
                                                const prevStepId = steps[prev]?.id;
                                                if (creative?.stepData && prevStepId) {
                                                    setStepData(creative.stepData[prevStepId] || {});
                                                }
                                            }
                                        }}
                                        disabled={currentStep === 0 || isLoading}
                                        className={cn(
                                            'rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all',
                                            (currentStep === 0 || isLoading)
                                                ? 'cursor-not-allowed text-gray-200'
                                                : 'text-blue-gray-400 border border-gray-100 hover:bg-gray-50'
                                        )}
                                    >
                                        ← Previous Step
                                    </button>

                                    <div className="flex items-center gap-4">
                                        {currentStep < steps.length - 1 && (
                                            <button
                                                onClick={handleNext}
                                                disabled={isNextDisabled}
                                                className={cn(
                                                    'rounded-xl bg-blue-600 px-8 py-3 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center gap-2',
                                                    isNextDisabled
                                                        ? 'opacity-20 cursor-not-allowed grayscale bg-gray-400 shadow-none'
                                                        : 'hover:bg-blue-700 hover:shadow-blue-200'
                                                )}
                                            >
                                                {isLoading && <ArrowPathIcon className="h-3 w-3 animate-spin" />}
                                                {isLoading ? 'Synchronizing...' : 'Continue Upstream →'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()
                }
            </div >
        </div >
    );
}
