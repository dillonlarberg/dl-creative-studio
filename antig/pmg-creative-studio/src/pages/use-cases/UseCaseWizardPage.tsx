import { useParams, Link } from 'react-router-dom';
import { USE_CASES } from '../../constants/useCases';
import { cn } from '../../utils/cn';
import { CheckIcon, ArrowLeftIcon, ArrowPathIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Transition } from '@headlessui/react';
import { useState, useEffect, useRef } from 'react';
import type { UseCaseId, CreativeAsset } from '../../types';
import { clientAssetHouseService } from '../../services/clientAssetHouse';
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import { creativeService } from '../../services/creative';
import type { CreativeRecord } from '../../services/creative';
import { videoService } from '../../services/videoService';
import { alliService } from '../../services/alli';
import { storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
        { id: 'describe', name: 'Describe Edit' },
        { id: 'model', name: 'Choose AI Model' },
        { id: 'review', name: 'Review Variations' },
        { id: 'approve', name: 'Approve & Download' },
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
        { id: 'action', name: 'Choose Action' },
        { id: 'design', name: 'Design Template' },
        { id: 'connect', name: 'Connect Feed' },
        { id: 'preview', name: 'Preview with Data' },
        { id: 'save', name: 'Save Template' },
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
    const ITEMS_PER_PAGE = 16; // 4 columns × 4 rows

    const client = JSON.parse(localStorage.getItem('selectedClient') || '{}');

    // Move steps definition up so handleNext can use it
    const steps = WIZARD_STEPS[useCaseId as UseCaseId] || [];

    useEffect(() => {
        if (client.slug) {
            fetchStatus();
        }
    }, [client.slug]);

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

    const filteredAssets = platformFilter === 'all'
        ? alliAssets
        : alliAssets.filter(a => a.platform === platformFilter);

    const totalPages = Math.ceil(filteredAssets.length / ITEMS_PER_PAGE);
    const paginatedAssets = filteredAssets.slice((assetPage - 1) * ITEMS_PER_PAGE, assetPage * ITEMS_PER_PAGE);

    // Reset pagination when filter changes
    useEffect(() => {
        setAssetPage(1);
    }, [platformFilter]);

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
            if (steps[currentStep]?.id === 'ai-reccos') {
                alert(`AI Analysis Failed: ${err instanceof Error ? err.message : String(err)}`);
            }
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
                        const lastStepId = steps[record.currentStep]?.id;
                        setStepData(record.stepData[lastStepId] || {});
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
        setStepData(record.stepData[currentStepId] || {});
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
            const nextStep = currentStep + 1;
            // Snapshot stepData NOW before any setState calls wipe it
            const currentStepData = { ...stepData };
            const updatedStepData = { ...creative?.stepData, [steps[currentStep].id]: currentStepData };

            await creativeService.updateCreative(activeCreativeId!, {
                currentStep: nextStep,
                stepData: updatedStepData
            });

            // Refresh local creative state
            const fresh = await creativeService.getCreative(activeCreativeId!);
            if (fresh) setCreative(fresh);

            setCurrentStep(nextStep);

            // Sync stepData with whatever is in the next step already
            const nextStepId = steps[nextStep]?.id;
            if (nextStepId && updatedStepData[nextStepId]) {
                setStepData(updatedStepData[nextStepId]);
            } else {
                setStepData({});
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

            // If finishing, trigger simulation (standard flows)
            if (nextStep === steps.length - 1 && useCaseId !== 'video-cutdown') {
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

    if (!isReady && !isLoading) {
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

                            {/* FALLBACK FOR OTHER CORES */}
                            {useCaseId !== 'new-image' && useCaseId !== 'video-cutdown' && (
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
                )}

                {!showHistory && (
                    <div className="flex items-center justify-between mt-12 pt-8 border-t border-gray-100">
                        <button
                            onClick={() => {
                                const prev = currentStep - 1;
                                setCurrentStep(Math.max(0, prev));
                                const prevStepId = steps[prev]?.id;
                                if (creative?.stepData && prevStepId) {
                                    setStepData(creative.stepData[prevStepId] || {});
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
                                    disabled={
                                        isLoading ||
                                        (steps[currentStep]?.id === 'upload' && !stepData.videoUrl) ||
                                        (steps[currentStep]?.id === 'configure' && (!stepData.lengths || stepData.lengths.length === 0)) ||
                                        (steps[currentStep]?.id === 'ai-reccos' && (!stepData.lengths?.every((l: number) => stepData[`selected_${l}`])))
                                    }
                                    className={cn(
                                        'rounded-xl bg-blue-600 px-8 py-3 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center gap-2',
                                        (isLoading ||
                                            (steps[currentStep]?.id === 'upload' && !stepData.videoUrl) ||
                                            (steps[currentStep]?.id === 'configure' && (!stepData.lengths || stepData.lengths.length === 0)) ||
                                            (steps[currentStep]?.id === 'ai-reccos' && (!stepData.lengths?.every((l: number) => stepData[`selected_${l}`])))
                                        ) ? 'opacity-20 cursor-not-allowed grayscale bg-gray-400 shadow-none' : 'hover:bg-blue-700 hover:shadow-blue-200'
                                    )}
                                >
                                    {isLoading && <ArrowPathIcon className="h-3 w-3 animate-spin" />}
                                    {isLoading ? 'Synchronizing...' : 'Continue Upstream →'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
