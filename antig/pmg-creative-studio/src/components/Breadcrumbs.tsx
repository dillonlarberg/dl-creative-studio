import { useLocation } from 'react-router-dom';
import { ChevronRightIcon, HomeIcon, UserIcon, Squares2X2Icon } from '@heroicons/react/20/solid';
import { cn } from '../utils/cn';

export default function Breadcrumbs() {
    const location = useLocation();
    const path = location.pathname;

    const steps = [
        {
            id: 'auth',
            name: '1. Authenticate',
            href: '/login',
            icon: UserIcon,
            current: path === '/login',
            completed: path !== '/login'
        },
        {
            id: 'client',
            name: '2. Select Client',
            href: '/select-client',
            icon: Squares2X2Icon,
            current: path === '/select-client',
            completed: path !== '/login' && path !== '/select-client'
        },
        {
            id: 'studio',
            name: '3. Creative Studio',
            href: '/',
            icon: HomeIcon,
            current: path !== '/login' && path !== '/select-client',
            completed: false
        },
    ];

    return (
        <nav className="flex items-center space-x-4 px-4 py-3 bg-white/50 backdrop-blur-sm border-b border-gray-100 mb-6" aria-label="Breadcrumb">
            <ol role="list" className="flex items-center space-x-4">
                {steps.map((step, stepIdx) => (
                    <li key={step.id} className="flex items-center">
                        <div className="flex items-center">
                            {stepIdx > 0 && (
                                <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-gray-300 mr-4" aria-hidden="true" />
                            )}
                            <div
                                className={cn(
                                    "flex items-center gap-2 text-sm font-medium transition-colors",
                                    step.current
                                        ? "text-blue-600"
                                        : step.completed
                                            ? "text-gray-500 hover:text-gray-700"
                                            : "text-gray-400 pointer-events-none"
                                )}
                            >
                                <step.icon className={cn(
                                    "h-4 w-4",
                                    step.current ? "text-blue-600" : "text-gray-400"
                                )} />
                                <span>{step.name}</span>
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
