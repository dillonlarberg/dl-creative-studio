import { Link } from 'react-router-dom';
import {
    SparklesIcon,
    ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { USE_CASES } from '../constants/useCases';
import {
    ArrowsPointingOutIcon,
    PaintBrushIcon,
    FilmIcon,
    VideoCameraIcon,
    RectangleGroupIcon,
    CpuChipIcon,
} from '@heroicons/react/24/outline';


const iconMap: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
    ArrowsPointingOutIcon,
    PaintBrushIcon,
    SparklesIcon,
    FilmIcon,
    VideoCameraIcon,
    RectangleGroupIcon,
    CpuChipIcon,
};

export default function DashboardPage() {
    return (
        <div className="space-y-10">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Creative Studio</h1>
                <p className="mt-2 text-sm text-blue-gray-600">
                    Create, edit, and optimize creative assets for your campaigns. Choose a path below to get started.
                </p>
            </div>

            {/* Entry Path */}
            <div className="flex justify-center">
                {/* Path 1: Create New */}
                <Link
                    to="/create"
                    className="group relative max-w-2xl flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white p-8 shadow-card hover:shadow-elevated hover:border-blue-200"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100" />
                    <div className="relative">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                            <SparklesIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <h2 className="mt-4 text-lg font-semibold text-gray-900">Create New Creative</h2>
                        <p className="mt-2 text-sm text-blue-gray-600">
                            New campaign? New idea? Start here to generate, resize, or build creative assets from scratch.
                        </p>
                        <div className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600">
                            Get started
                            <ArrowRightIcon className="h-4 w-4 group-hover:translate-x-1" />
                        </div>
                    </div>
                </Link>
            </div>

            {/* Quick Actions - All Use Cases */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
                <p className="mt-1 text-sm text-blue-gray-500">Jump directly into a specific creative workflow.</p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {USE_CASES.map((uc) => {
                        const Icon = iconMap[uc.icon] || SparklesIcon;
                        return (
                            <Link
                                key={uc.id}
                                to={`/create/${uc.id}`}
                                className="group flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-card hover:shadow-elevated hover:border-blue-200"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-gray-50 group-hover:bg-blue-50">
                                    <Icon className="h-5 w-5 text-blue-gray-500 group-hover:text-blue-600" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-medium text-gray-900">{uc.title}</h3>
                                    <p className="mt-1 text-xs text-blue-gray-500 line-clamp-2">{uc.description}</p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
