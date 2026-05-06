import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../utils/cn';
import { useEffect, useState } from 'react';
import { authService } from '../services/auth';
import {
    SparklesIcon,
    ArrowRightStartOnRectangleIcon,
    BookOpenIcon,
    XMarkIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Fragment } from 'react';
import { alliService } from '../services/alli';
import type { Client } from '../types';
import Breadcrumbs from './Breadcrumbs';
import { clientAssetHouseService } from '../services/clientAssetHouse';
import WaveAnimation from './WaveAnimation';

const navigation = [
    { name: 'Alli Studio', href: '/', icon: SparklesIcon },
    { name: 'Client Asset House', href: '/client-asset-house', icon: BookOpenIcon },
];

/**
 * Extract a clientSlug from the pathname for routes that carry one in the URL.
 * Recognized shapes (Step 0 of AdLabs v1 plan):
 *   - /adlabs/:clientSlug/...
 *   - /:clientSlug/template-builder/... (legacy per-app mount)
 *   - /:clientSlug/<future-app-basePath>/... (post-Step-1)
 *
 * Returns null when no clientSlug is present (e.g. /, /select-client, /login,
 * /create, /create/:useCaseId, /client-asset-house). Reserved top-level paths
 * are excluded explicitly so they don't get treated as slugs.
 */
const RESERVED_TOP_LEVEL = new Set([
    '',
    'login',
    'select-client',
    'create',
    'client-asset-house',
    'adlabs',
]);

export function extractClientSlugFromPath(pathname: string): string | null {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const [first, second] = segments;
    if (first === 'adlabs') {
        // /adlabs/:clientSlug/...
        return second && !RESERVED_TOP_LEVEL.has(second) ? second : null;
    }
    if (RESERVED_TOP_LEVEL.has(first)) return null;
    // Legacy /:clientSlug/<app>/... — only accept when the second segment is
    // a known app basePath. Hardcoded to template-builder for now; expand as
    // apps land.
    if (second === 'template-builder') return first;
    return null;
}

function nameFromEmail(email?: string): string {
    if (!email || typeof email !== 'string') return '';
    const local = email.split('@')[0];
    if (!local) return '';
    return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

export default function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [search, setSearch] = useState('');
    const [loadingClients, setLoadingClients] = useState(false);
    const [clientError, setClientError] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>('');

    useEffect(() => {
        let cancelled = false;
        alliService
            .getMe()
            .then((me) => {
                if (cancelled) return;
                const u = me?.user ?? me ?? {};
                const explicit =
                    u.name ||
                    u.fullName ||
                    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
                    [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
                    u.displayName ||
                    '';
                setUserName(explicit || nameFromEmail(u.email) || u.email || '');
            })
            .catch((err) => {
                console.error('Failed to load user profile from /me:', err);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const userInitials = userName
        ? userName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? '')
              .join('')
        : '';

    useEffect(() => {
        // Step 0 of AdLabs v1 plan: reconcile URL :clientSlug with localStorage.
        // If the URL carries a clientSlug (e.g. /adlabs/ralph_lauren/... or
        // /ralph_lauren/template-builder/...), prefer it over localStorage and
        // write it back so a hard refresh on a deep route doesn't bounce the
        // user to /select-client. URL param wins; if both missing, redirect.
        const urlSlug = extractClientSlugFromPath(location.pathname);
        const clientStr = localStorage.getItem('selectedClient');

        if (urlSlug) {
            // Resolve client from URL. If localStorage already matches, just
            // hydrate. If it doesn't match, fetch the canonical client record
            // from the slug; until that lands, write a stub so the guard passes.
            try {
                const stored = clientStr ? JSON.parse(clientStr) : null;
                if (stored?.slug === urlSlug) {
                    setSelectedClient(stored);
                    loadClientFonts(stored.slug);
                } else {
                    const stub: Client = { slug: urlSlug, name: urlSlug } as Client;
                    localStorage.setItem('selectedClient', JSON.stringify(stub));
                    setSelectedClient(stub);
                    loadClientFonts(urlSlug);
                }
            } catch {
                const stub: Client = { slug: urlSlug, name: urlSlug } as Client;
                localStorage.setItem('selectedClient', JSON.stringify(stub));
                setSelectedClient(stub);
                loadClientFonts(urlSlug);
            }
            return;
        }

        if (!clientStr && location.pathname !== '/select-client' && location.pathname !== '/login') {
            navigate('/select-client');
        } else if (clientStr) {
            const client = JSON.parse(clientStr);
            setSelectedClient(client);
            loadClientFonts(client.slug);
        }
    }, [location.pathname, navigate]);

    const loadClientFonts = async (slug: string) => {
        try {
            const house = await clientAssetHouseService.getAssetHouse(slug);
            if (house) {
                // Ensure arrays exist
                const assets = house.assets || [];
                const variables = house.variables || [];

                // Load Primary Font if it's specialized
                if (house.fontPrimary && assets.find(a => a.name === house.fontPrimary)?.url) {
                    const font = assets.find(a => a.name === house.fontPrimary);
                    if (font) clientAssetHouseService.loadCustomFont(house.fontPrimary, font.url);
                }

                // Load all fonts from dynamic variables
                variables.forEach(v => {
                    if (v.type === 'font' && v.value) {
                        const fontAsset = assets.find(a => a.name === v.value);
                        if (fontAsset) clientAssetHouseService.loadCustomFont(v.value, fontAsset.url);
                    }
                });
            }
        } catch (err) {
            console.error('Failed to load client fonts:', err);
        }
    };

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        setLoadingClients(true);
        setClientError(null);
        try {
            const data = await alliService.getClients();
            setClients(data);
        } catch (err: any) {
            console.error('Failed to load clients:', err);
            setClientError(err.message || 'Failed to load clients');
        } finally {
            setLoadingClients(false);
        }
    };

    const handleSelectClient = (client: Client) => {
        localStorage.setItem('selectedClient', JSON.stringify(client));
        setSelectedClient(client);
        setIsDrawerOpen(false);
        // Refresh page or trigger context update if needed
        navigate(0);
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* Sidebar */}
            <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white">
                {/* Logo & Client Selector */}
                <div className="relative flex flex-col justify-center overflow-hidden border-b border-gray-200 px-6 py-4">
                    {/* TODO(pre-main-cutover): remove this DEV ribbon before merging to main.
                        Tracked in PR #6 (feat/wizard-chrome-parity). It's gated on
                        import.meta.env.DEV so it won't ship in production builds, but the
                        team agreed to strip the source before the cutover deploy. */}
                    {import.meta.env.DEV && (
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -left-8 top-2 -rotate-45 bg-red-600 px-10 py-0.5 text-[10px] font-black uppercase tracking-[0.3em] text-white shadow-md"
                        >
                            Dev
                        </span>
                    )}
                    <span className="text-xl font-bold text-gray-900">Alli Studio</span>
                    <div className="mt-1.5 flex items-center justify-between gap-2 min-w-0 font-bold uppercase tracking-widest text-[10px]">
                        <span className="truncate text-blue-gray-400">
                            {selectedClient?.name || '...'}
                        </span>
                        <button
                            onClick={() => setIsDrawerOpen(true)}
                            className="shrink-0 text-blue-600 hover:text-blue-500"
                        >
                            Change
                        </button>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 space-y-1 px-3 py-4">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href ||
                            (item.href !== '/' && location.pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={cn(
                                    'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                                    isActive
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'text-blue-gray-700 hover:bg-gray-100 hover:text-gray-900'
                                )}
                            >
                                <item.icon
                                    className={cn(
                                        'h-5 w-5 shrink-0',
                                        isActive ? 'text-blue-600' : 'text-blue-gray-400 group-hover:text-gray-600'
                                    )}
                                />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                {/* User / Client selector */}
                <div className="border-t border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
                            {userInitials || '...'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{userName || 'Loading...'}</p>
                            <button
                                onClick={() => setIsDrawerOpen(true)}
                                className="truncate text-xs text-blue-600 hover:text-blue-500 font-medium text-left w-full"
                            >
                                {selectedClient?.name || 'Select Client'}
                            </button>
                        </div>
                        <button
                            onClick={async () => {
                                await authService.logout();
                                navigate('/login');
                            }}
                            className="text-blue-gray-400 hover:text-gray-600"
                        >
                            <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 pl-64">
                <div className="brand-gradient relative min-h-screen overflow-hidden">
                    {/* Background Waves */}
                    <div className="absolute inset-x-0 bottom-0 z-0 opacity-30">
                        <WaveAnimation height="200px" waveNumber={2} />
                    </div>

                    <div className="relative z-10">
                        <Breadcrumbs />
                        <div className="mx-auto max-w-7xl px-6 py-4 sm:px-8">
                            <Outlet />
                        </div>
                    </div>
                </div>
            </main>

            {/* Client Selection Drawer */}
            <Transition show={isDrawerOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setIsDrawerOpen(false)}>
                    <TransitionChild
                        as={Fragment}
                        enter="ease-in-out duration-500"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in-out duration-500"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                    </TransitionChild>

                    <div className="fixed inset-0 overflow-hidden">
                        <div className="absolute inset-0 overflow-hidden">
                            <div className="pointer-events-none fixed inset-y-0 left-0 flex max-w-full pr-10">
                                <TransitionChild
                                    as={Fragment}
                                    enter="transform transition ease-in-out duration-500 sm:duration-700"
                                    enterFrom="-translate-x-full"
                                    enterTo="translate-x-0"
                                    leave="transform transition ease-in-out duration-500 sm:duration-700"
                                    leaveFrom="translate-x-0"
                                    leaveTo="-translate-x-full"
                                >
                                    <DialogPanel className="pointer-events-auto w-screen max-w-md">
                                        <div className="flex h-full flex-col overflow-y-scroll bg-white py-6 shadow-xl">
                                            <div className="px-4 sm:px-6">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Manage</p>
                                                        <DialogTitle className="text-xl font-bold text-gray-900">Select Client</DialogTitle>
                                                    </div>
                                                    <div className="ml-3 flex h-7 items-center">
                                                        <button
                                                            type="button"
                                                            className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                                                            onClick={() => setIsDrawerOpen(false)}
                                                        >
                                                            <span className="sr-only">Close panel</span>
                                                            <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="relative mt-6 flex-1 px-4 sm:px-6">
                                                {/* Search */}
                                                <div className="relative">
                                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        className="block w-full rounded-md border-0 py-1.5 pl-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                                                        placeholder="Search"
                                                        value={search}
                                                        onChange={(e) => setSearch(e.target.value)}
                                                    />
                                                </div>

                                                {/* Client List */}
                                                <div className="mt-8 space-y-1">
                                                    {loadingClients ? (
                                                        <div className="flex h-32 items-center justify-center">
                                                            <ArrowPathIcon className="h-6 w-6 animate-spin text-blue-600" />
                                                        </div>
                                                    ) : clientError ? (
                                                        <div className="px-4 py-8 text-center text-sm">
                                                            <ExclamationTriangleIcon className="mx-auto h-8 w-8 text-amber-500" />
                                                            <p className="mt-2 text-gray-600">{clientError}</p>
                                                            <button
                                                                onClick={fetchClients}
                                                                className="mt-4 font-semibold text-blue-600 hover:text-blue-500"
                                                            >
                                                                Try Again
                                                            </button>
                                                        </div>
                                                    ) : filteredClients.length > 0 ? (
                                                        filteredClients.map((client) => (
                                                            <button
                                                                key={client.slug}
                                                                onClick={() => handleSelectClient(client)}
                                                                className={cn(
                                                                    "flex w-full items-center px-4 py-3 text-sm font-medium rounded-md transition-colors",
                                                                    selectedClient?.slug === client.slug
                                                                        ? "bg-blue-50 text-blue-600"
                                                                        : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                                                )}
                                                            >
                                                                {client.name}
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="px-4 py-8 text-center text-sm text-gray-500">
                                                            No clients found.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </DialogPanel>
                                </TransitionChild>
                            </div>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
}
