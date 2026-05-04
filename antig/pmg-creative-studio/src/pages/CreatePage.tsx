import { Link } from 'react-router-dom';
import { USE_CASES } from '../constants/useCases';
import { getRegistry } from '../apps/_registry';
import { cn } from '../utils/cn';
import {
    ArrowsPointingOutIcon,
    PaintBrushIcon,
    SparklesIcon,
    FilmIcon,
    VideoCameraIcon,
    RectangleGroupIcon,
    CpuChipIcon,
    ArrowRightIcon,
    HomeModernIcon,
    ExclamationTriangleIcon,
    ScissorsIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { clientAssetHouseService } from '../services/clientAssetHouse';
import type { ClientAssetHouse } from '../services/clientAssetHouse';
import { alliService } from '../services/alli';

const iconMap: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
    ArrowsPointingOutIcon,
    PaintBrushIcon,
    SparklesIcon,
    FilmIcon,
    VideoCameraIcon,
    RectangleGroupIcon,
    CpuChipIcon,
    ScissorsIcon,
};

export default function CreatePage() {
    const [assetHouse, setAssetHouse] = useState<ClientAssetHouse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const client = JSON.parse(localStorage.getItem('selectedClient') || '{}');

    useEffect(() => {
        if (client.slug) {
            fetchStatus();
        } else {
            setIsLoading(false);
        }
    }, [client.slug]);

    const fetchStatus = async () => {
        setIsLoading(true);
        try {
            const data = await clientAssetHouseService.getAssetHouse(client.slug);
            setAssetHouse(data);

            // Proactively ping Alli to warm the cache for video cutdowns
            console.log(`[CreatePage] Proactively warming Alli cache for ${client.slug}`);
            alliService.getCreativeAssets(client.slug).catch(err => console.error('[CreatePage] Cache warming failed:', err));
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const isReady = clientAssetHouseService.checkBrandStandards(assetHouse);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Alli Studio</h1>
                    <p className="mt-2 text-sm text-blue-gray-600">
                        A unified workspace to create, edit, and optimize your creative assets.
                    </p>
                </div>

                {/* Evergreen Entrance */}
                <Link
                    to="/client-asset-house"
                    className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                    <HomeModernIcon className="h-5 w-5" />
                    Client Asset House
                    {isReady ? (
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                    ) : (
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                </Link>
            </div>

            {!isReady && !isLoading && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                        <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-bold text-amber-800">Full Brand Integration Available Soon</h3>
                            <p className="mt-1 text-sm text-amber-700">
                                Some features (Dynamic Versioning and AI Generation) are restricted until <span className="font-semibold underline">Mandatory Brand Standards</span> (logos, colors, fonts) are defined. Editing and resizing features are still available.
                            </p>
                            <Link to="/client-asset-house" className="mt-3 inline-block text-sm font-bold text-blue-600 hover:text-blue-500">
                                Update Asset House &rarr;
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Section */}
            <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-gray-400">Images</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {USE_CASES.filter(uc => ['image-resize', 'edit-image', 'new-image'].includes(uc.id)).map((uc) => (
                        <UseCaseCard key={uc.id} useCase={uc} disabled={uc.requiresBrandStandards && !isReady} />
                    ))}
                </div>
            </div>

            {/* Video Section */}
            <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-gray-400">Video</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {USE_CASES.filter(uc => ['edit-video', 'new-video', 'video-cutdown'].includes(uc.id)).map((uc) => (
                        <UseCaseCard key={uc.id} useCase={uc} disabled={uc.requiresBrandStandards && !isReady} />
                    ))}
                </div>
            </div>

            {/* Dynamic Versioning Section */}
            <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-gray-400">Dynamic Versioning</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {USE_CASES.filter(uc => ['template-builder', 'feed-processing', 'static-creative'].includes(uc.id)).map((uc) => (
                        <UseCaseCard key={uc.id} useCase={uc} disabled={uc.requiresBrandStandards && !isReady} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function UseCaseCard({ useCase, disabled }: { useCase: typeof USE_CASES[number], disabled?: boolean }) {
    const Icon = iconMap[useCase.icon] || SparklesIcon;
    // Registry-driven nav: tiles for apps that have been extracted into the new
    // framework (currently template-builder; PRs 4-9 add the rest) route to
    // /:clientSlug/${manifest.basePath}. Other tiles fall through to the
    // legacy /create/:useCaseId route until their app is extracted.
    const manifest = getRegistry().find((m) => m.id === useCase.id);
    const tileClient = JSON.parse(localStorage.getItem('selectedClient') || '{}') as { slug?: string };
    const target = manifest && tileClient.slug
        ? `/${tileClient.slug}/${manifest.basePath}`
        : `/create/${useCase.id}`;
    const content = (
        <>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100" />
            <div className="relative flex-1">
                <div className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-lg bg-blue-gray-50",
                    !disabled && "group-hover:bg-blue-100"
                )}>
                    <Icon className={cn(
                        "h-5 w-5 text-blue-gray-500",
                        !disabled && "group-hover:text-blue-600"
                    )} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{useCase.title}</h3>
                <p className="mt-2 text-sm text-blue-gray-500">{useCase.description}</p>
            </div>
            <div className="relative mt-4 flex items-center gap-1 text-sm font-medium text-blue-600">
                {disabled ? 'Standards required' : 'Start workflow'}
                {!disabled && <ArrowRightIcon className="h-4 w-4 group-hover:translate-x-1" />}
            </div>
        </>
    );

    if (disabled) {
        return (
            <div className="relative flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-gray-50/50 p-6 opacity-60 grayscale cursor-not-allowed">
                {content}
            </div>
        );
    }

    return (
        <Link
            to={target}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-card hover:shadow-elevated hover:border-blue-300"
        >
            {content}
        </Link>
    );
}
