import { useParams, Link } from 'react-router-dom';
import { USE_CASES } from '../../constants/useCases';
import { cn } from '../../utils/cn';
import { CheckIcon, ArrowLeftIcon, ArrowPathIcon, SparklesIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { useState, useEffect } from 'react';
import type { UseCaseId } from '../../types';
import { clientAssetHouseService } from '../../services/clientAssetHouse';
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import { creativeService } from '../../services/creative';
import type { CreativeRecord } from '../../services/creative';
import { videoService } from '../../services/videoService';
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
    'Gemini 3 Pro Preview': 'gemini-3-pro-preview',
    'Gemini 1.5 Pro': 'gemini-1.5-pro',
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

    const client = JSON.parse(localStorage.getItem('selectedClient') || '{}');

    // Move steps definition up so handleNext can use it
    const steps = WIZARD_STEPS[useCaseId as UseCaseId] || [];

    useEffect(() => {
        if (client.slug) {
            fetchStatus();
        }
    }, [client.slug]);

    // Auto-trigger analysis if we land on AI reccos without results
    useEffect(() => {
        const step = steps[currentStep];
        if (useCaseId === 'video-cutdown' && step?.id === 'ai-reccos' && !stepData.ai_reccos && !isLoading) {
            const videoUrl = creative?.stepData?.upload?.videoUrl || creative?.stepData?.configure?.videoUrl;
            const lengths = creative?.stepData?.configure?.lengths || [15];

            if (videoUrl && creativeId) {
                console.log('[Auto-Trigger] Starting missing AI analysis...');
                const technicalModel = stepData.model ? (MODEL_MAPPING[stepData.model] || stepData.model) : 'gemini-3-pro-preview';
                triggerAIAnalysis(creativeId, videoUrl, lengths, creative.stepData, technicalModel);
            }
        }
    }, [currentStep, stepData.ai_reccos, creativeId, creative?.stepData, stepData.model]);

    const triggerAIAnalysis = async (id: string, videoUrl: string, lengths: number[], existingStepData: any, modelName?: string) => {
        const activeModel = modelName || 'Gemini 3 Pro Preview';
        console.log(`[AI-Analysis] Triggering with URL: ${videoUrl}, Lengths: ${lengths}, Model: ${activeModel}`);
        setIsLoading(true);
        try {
            const reccos = await videoService.getCutdownRecommendations(videoUrl, lengths, activeModel);
            const newAIReccoData = { lengths, videoUrl, ai_reccos: reccos, model: activeModel };

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
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStatus = async () => {
        setIsLoading(true);
        try {
            const data = await clientAssetHouseService.getAssetHouse(client.slug);
            setAssetHouse(data);

            if (useCaseId) {
                // Fetch recent projects for this use case
                const items = await creativeService.getClientCreatives(client.slug);
                const relevant = items.filter(i => i.useCaseId === useCaseId);
                setHistory(relevant);

                // Set default model for video-cutdown if not already set
                if (useCaseId === 'video-cutdown' && !stepData.model) {
                    setStepData(prev => ({ ...prev, model: 'Gemini 3 Pro Preview' }));
                }

                // If there's a stored creativeId, resume it
                const storedId = localStorage.getItem(`creative_${client.slug}_${useCaseId}`);
                if (storedId) {
                    const record = await creativeService.getCreative(storedId);
                    if (record) {
                        setCreativeId(storedId);
                        setCreative(record);
                        const lastStepId = steps[record.currentStep]?.id;
                        setStepData(record.stepData[lastStepId] || {});
                        setCurrentStep(record.currentStep);
                        return;
                    }
                }

                // If no stored session but we have history, show history screen first
                if (relevant.length > 0) {
                    setShowHistory(true);
                } else {
                    // Automatically start a new one if brand new
                    startNewProject();
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
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
            const updatedStepData = { ...creative?.stepData, [steps[currentStep].id]: stepData };

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
                    const lengths = stepData.lengths || [15, 30];
                    const videoUrl = updatedStepData.upload?.videoUrl || creative?.stepData?.upload?.videoUrl || stepData.videoUrl;

                    if (videoUrl) {
                        const technicalModel = stepData.model ? (MODEL_MAPPING[stepData.model] || stepData.model) : 'gemini-3-pro-preview';
                        triggerAIAnalysis(activeCreativeId!, videoUrl, lengths, updatedStepData, technicalModel);
                    }
                } else if (currentStepId === 'ai-reccos') {
                    // Moving TO process: Trigger FFmpeg stitching
                    const videoUrl = updatedStepData.upload?.videoUrl || creative?.stepData?.upload?.videoUrl || stepData.videoUrl;
                    const selectedCuts = (stepData.lengths || []).flatMap((len: number) => {
                        const selections = stepData[`selected_${len}`] || [];
                        const recco = (stepData.ai_reccos || []).find((r: any) => r.length === len);

                        // Handle multiple selections (array)
                        if (Array.isArray(selections)) {
                            if (selections.length === 0) return []; // Skip if nothing selected for this length
                            return selections.map(id => {
                                const opt = recco?.options?.find((o: any) => o.id === id);
                                return {
                                    id: crypto.randomUUID(),
                                    length: len,
                                    segments: opt?.segments || []
                                };
                            }).filter(cut => cut.segments.length > 0);
                        }

                        // Fallback for transition/legacy single selection
                        const opt = recco?.options?.find((o: any) => o.id === selections) || recco?.options?.[0];
                        return [{
                            id: crypto.randomUUID(),
                            length: len,
                            segments: opt?.segments || []
                        }];
                    });

                    if (videoUrl && !stepData.final_cutdowns) {
                        setIsLoading(true);
                        try {
                            const results = await videoService.processCutdowns(videoUrl, selectedCuts);
                            setStepData(prev => ({ ...prev, final_cutdowns: results.cutdowns }));
                        } catch (err) {
                            console.error('Processing failure:', err);
                        } finally {
                            setIsLoading(false);
                        }
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
                                Recent {useCase.title} Strategy Boards
                            </h2>
                            <p className="text-sm text-blue-gray-400">Continue a recent session or start a new high-impact cutdown board.</p>
                        </div>

                        <div className="mx-auto max-w-lg space-y-3">
                            {history.slice(0, 5).map(record => (
                                <button
                                    key={record.id}
                                    onClick={() => resumeProject(record)}
                                    className="w-full flex items-center justify-between p-5 rounded-2xl border border-blue-50 bg-blue-50/20 hover:bg-white hover:border-blue-600 hover:shadow-lg transition-all group"
                                >
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-gray-900 tracking-tight italic">
                                            {record.stepData.upload?.videoName || `Project ${record.id.slice(-6).toUpperCase()}`}
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
                                <div className="mx-auto max-w-lg text-left">
                                    {steps[currentStep].id === 'upload' && (
                                        <div className="space-y-4">
                                            <label className="block text-sm font-black text-gray-900 uppercase tracking-widest mb-4">Upload Base Video</label>
                                            <label
                                                htmlFor="video-upload"
                                                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-100 border-dashed rounded-2xl bg-gray-50 hover:bg-white hover:border-blue-400 transition-all cursor-pointer relative"
                                            >
                                                {isLoading ? (
                                                    <div className="space-y-3 text-center py-4">
                                                        <ArrowPathIcon className="mx-auto h-10 w-10 text-blue-600 animate-spin" />
                                                        <p className="text-xs font-black text-blue-600 uppercase tracking-widest">Uploading to Studio Cloud...</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1 text-center py-4">
                                                        <SparklesIcon className="mx-auto h-12 w-12 text-gray-300" />
                                                        <div className="flex text-sm text-gray-600 justify-center">
                                                            <div className="relative font-black text-blue-600 hover:text-blue-500">
                                                                <span>UPLOAD PRIMARY ASSET</span>
                                                                <input
                                                                    id="video-upload"
                                                                    name="video-upload"
                                                                    type="file"
                                                                    className="sr-only"
                                                                    accept="video/*"
                                                                    onChange={async (e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (file) {
                                                                            console.log(`[Upload] Starting for: ${file.name} (${file.size} bytes)`);
                                                                            setIsLoading(true);
                                                                            try {
                                                                                const path = `uploads/${client.slug || 'anonymous'}/${Date.now()}_${file.name}`;
                                                                                const storageRef = ref(storage, path);

                                                                                console.log(`[Upload] Path: ${path}`);
                                                                                await uploadBytes(storageRef, file);
                                                                                console.log(`[Upload] Bytes written.`);

                                                                                const url = await getDownloadURL(storageRef);
                                                                                console.log(`[Upload] URL generated: ${url}`);

                                                                                const newStepData = {
                                                                                    ...stepData,
                                                                                    videoName: file.name,
                                                                                    videoSize: file.size,
                                                                                    videoUrl: url
                                                                                };

                                                                                setStepData(newStepData);

                                                                                // Immediate sync to Firestore
                                                                                if (creativeId) {
                                                                                    console.log(`[Upload] Syncing videoUrl to creative ${creativeId}`);
                                                                                    await creativeService.updateCreative(creativeId, {
                                                                                        stepData: {
                                                                                            ...creative?.stepData,
                                                                                            upload: newStepData
                                                                                        }
                                                                                    });
                                                                                    const updated = await creativeService.getCreative(creativeId);
                                                                                    if (updated) {
                                                                                        setCreative(updated);
                                                                                        console.log(`[Upload] Firestore sync complete.`);
                                                                                    }
                                                                                }
                                                                            } catch (err: any) {
                                                                                console.error('[Upload] CRITICAL FAILURE:', err);
                                                                                alert(`Upload failed: ${err.message || 'Unknown error'}`);
                                                                            } finally {
                                                                                setIsLoading(false);
                                                                            }
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">MP4, MOV • MAX 100MB</p>
                                                    </div>
                                                )}
                                            </label>
                                            {stepData.videoUrl && (
                                                <div className="mt-6 space-y-4">
                                                    <div className="flex items-center gap-2 text-green-600">
                                                        <CheckIcon className="h-5 w-5" />
                                                        <p className="text-xs font-black uppercase tracking-widest animate-bounce">Asset Ready: {stepData.videoName}</p>
                                                    </div>
                                                    <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black shadow-xl ring-4 ring-blue-50/50">
                                                        <video
                                                            src={stepData.videoUrl}
                                                            controls
                                                            className="w-full h-auto max-h-[500px] object-contain"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mt-10 pt-8 border-t border-gray-100">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">AI Intelligence Engine</label>
                                                <Listbox
                                                    value={stepData.model || "Gemini 3 Pro Preview"}
                                                    onChange={(val) => setStepData({ ...stepData, model: val })}
                                                >
                                                    <div className="relative mt-1">
                                                        <ListboxButton className="relative w-full cursor-default rounded-xl bg-gray-50 py-4 pl-4 pr-10 text-left border border-gray-100 focus:outline-none sm:text-sm">
                                                            <span className="block truncate font-bold text-gray-900">{stepData.model || "Gemini 3 Pro Preview"}</span>
                                                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                                                            </span>
                                                        </ListboxButton>
                                                        <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                                                            <ListboxOptions className="absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 text-base shadow-2xl ring-1 ring-black/5 focus:outline-none sm:text-sm">
                                                                {[
                                                                    { name: 'Gemini 3 Pro Preview', available: true },
                                                                    { name: 'Gemini 1.5 Pro', available: true },
                                                                    { name: 'OpenAI GPT-4o', available: false },
                                                                    { name: 'Anthropic Claude 3.5', available: false }
                                                                ].map((mod, i) => (
                                                                    <ListboxOption
                                                                        key={i}
                                                                        disabled={!mod.available}
                                                                        className={({ active, disabled }) =>
                                                                            `relative cursor-default select-none py-3 pl-10 pr-4 ${active ? 'bg-blue-50 text-blue-900' : 'text-gray-900'} ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : ''}`
                                                                        }
                                                                        value={mod.name}
                                                                    >
                                                                        {({ selected }) => (
                                                                            <>
                                                                                <span className={`block truncate ${selected ? 'font-black' : 'font-medium'}`}>
                                                                                    {mod.name} {!mod.available && '(Coming Soon)'}
                                                                                </span>
                                                                                {selected ? (
                                                                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                                                                                        <CheckIcon className="h-4 w-4" aria-hidden="true" />
                                                                                    </span>
                                                                                ) : null}
                                                                            </>
                                                                        )}
                                                                    </ListboxOption>
                                                                ))}
                                                            </ListboxOptions>
                                                        </Transition>
                                                    </div>
                                                </Listbox>
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
                                                    <p className="text-sm font-bold text-gray-900 tracking-tight italic">{stepData.model || 'Gemini 3 Pro Preview'} is Analyzing Your Video Context...</p>
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
                                                                    <p className="text-[9px] text-blue-700 font-bold uppercase tracking-widest leading-none">Insights synthesized by Gemini 1.5 Pro</p>
                                                                </div>
                                                            </div>
                                                            <span className="text-[9px] font-black py-1 px-3 bg-blue-600 text-white rounded-full tracking-[0.2em] uppercase">Ready</span>
                                                        </div>

                                                        {/* Regenerate Action */}
                                                        <div className="flex justify-end">
                                                            <button
                                                                onClick={() => {
                                                                    const technicalModel = stepData.model ? (MODEL_MAPPING[stepData.model] || stepData.model) : 'gemini-3-pro-preview';
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
                                                                                    <div className="flex flex-wrap gap-1">
                                                                                        {opt.segments.map((seg: any, idx: number) => (
                                                                                            <span key={idx} className="inline-block px-1.5 py-0.5 bg-white border border-blue-100 text-blue-600 rounded text-[9px] font-black tracking-tighter">
                                                                                                {seg.start} → {seg.end}
                                                                                            </span>
                                                                                        ))}
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
                                            <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-xl">
                                                {(stepData.final_cutdowns || []).map((cut: any, idx: number) => (
                                                    <div key={idx} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-gray-900 tracking-tight italic">{cut.length}s_variation_{idx + 1}.mp4</span>
                                                            <span className="text-[9px] text-blue-gray-400 uppercase font-black tracking-[0.15em] mt-1">AI Story-Stitched • High Resolution</span>
                                                        </div>
                                                        <a
                                                            href={cut.url}
                                                            download
                                                            target="_blank"
                                                            className="rounded-xl bg-blue-50 px-5 py-2 text-[10px] font-black text-blue-600 border border-blue-100 hover:bg-blue-600 hover:text-white hover:shadow-lg transition-all"
                                                        >
                                                            DOWNLOAD MP4
                                                        </a>
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
                                            {useCase.title} Strategy Block
                                        </p>
                                        <p className="mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                            Phase {currentStep + 1} of {steps.length}
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
