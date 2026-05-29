import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../utils/cn';
import { useEffect, useState } from 'react';
import { authService } from '../services/auth';
import { Input as AlliInputBase } from '@agencypmg/alli-design-system';
import {
    XMarkIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    QuestionMarkCircleIcon,
    BellIcon,
} from '@heroicons/react/24/outline';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild, Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { Fragment } from 'react';
import { alliService } from '../services/alli';
import type { Client } from '../types';
import { clientAssetHouseService } from '../services/clientAssetHouse';
import { notifySelectedClientChanged } from '../hooks/useSelectedClient';

const AlliInput = AlliInputBase as unknown as React.FC<{
    name: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    leadingIcon?: React.ReactNode;
}>;

/**
 * Extract a clientSlug from the pathname for routes that carry one in the URL.
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
        return second && !RESERVED_TOP_LEVEL.has(second) ? second : null;
    }
    if (RESERVED_TOP_LEVEL.has(first)) return null;
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
    const [userEmail, setUserEmail] = useState<string>('');

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
                setUserEmail(u.email || '');
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
        const urlSlug = extractClientSlugFromPath(location.pathname);
        const clientStr = localStorage.getItem('selectedClient');

        if (urlSlug) {
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

        if (!clientStr && location.pathname !== '/select-client' && location.pathname !== '/login' && location.pathname !== '/') {
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
                const assets = house.assets || [];
                const variables = house.variables || [];
                if (house.fontPrimary && assets.find(a => a.name === house.fontPrimary)?.url) {
                    const font = assets.find(a => a.name === house.fontPrimary);
                    if (font) clientAssetHouseService.loadCustomFont(house.fontPrimary, font.url);
                }
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
        notifySelectedClientChanged();
        setSelectedClient(client);
        setIsDrawerOpen(false);

        // Always redirect to the new client's AdLabs home rather than
        // swapping the slug in place. Why: an in-place slug swap leaves
        // mid-workflow components mounted with stale per-client state
        // (e.g. ad-resizing's feedCreatives + jobs from the prior client),
        // while their data hooks rebind instantly to the new slug — the
        // UI shows old-client data but writes land under the new client
        // (issue #30). Routing to /adlabs/{slug}/ unmounts the workflow
        // and matches the user-facing intent in issue #20.
        navigate(`/adlabs/${client.slug}/`);
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );


    return (
        <div className="min-h-screen" style={{ backgroundColor: '#EEF1F7' }}>
            {/* Persistent platform header banner */}
            <header className="fixed inset-x-0 top-0 z-30 flex h-[60px] items-center overflow-hidden border-b border-gray-200 bg-white">
                {/* DEV ribbon — top-left corner diagonal banner */}
                {import.meta.env.DEV && (
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 top-0 z-40 -translate-x-8 translate-y-2 -rotate-45 bg-red-600 px-10 py-0.5 text-[9px] font-black uppercase tracking-[0.3em] text-white shadow-md"
                    >
                        Dev
                    </span>
                )}

                {/* Logo slot — centered in collapsed sidebar width */}
                <div className="flex h-[60px] w-28 shrink-0 items-center justify-center">
                    <img src="/PMG_Alli_AllBlack_Logo.png" alt="alli" className="h-[22px] w-auto" />
                </div>
                <div className="h-7 w-px bg-gray-200" />

                {/* Client name + change */}
                <div className="ml-6 flex items-center gap-3">
                    <span className="text-[13px] font-medium text-gray-900">
                        {selectedClient?.name || '...'}
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsDrawerOpen(true)}
                        className="text-[13px] font-medium text-[#0C69EA] hover:text-blue-700"
                    >
                        Change
                    </button>
                </div>

                {/* Right cluster */}
                <div className="ml-auto flex items-center gap-1 pr-6">
                    <button type="button" aria-label="Help" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
                        <QuestionMarkCircleIcon className="h-5 w-5" />
                    </button>
                    <button type="button" aria-label="Notifications" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
                        <BellIcon className="h-5 w-5" />
                    </button>
                    <Menu as="div" className="relative">
                        <MenuButton className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[12px] font-semibold text-white">
                            {userInitials || '...'}
                        </MenuButton>
                        <Transition
                            as={Fragment}
                            enter="transition ease-out duration-100"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="transition ease-in duration-75"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <MenuItems anchor="bottom end" className="z-50 mt-2 w-64 origin-top-right rounded-lg border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none">
                                <div className="border-b border-gray-100 px-4 py-3">
                                    <p className="truncate text-sm font-medium text-gray-900">{userName || 'Loading...'}</p>
                                    {userEmail && <p className="mt-0.5 truncate text-xs text-gray-500">{userEmail}</p>}
                                </div>
                                <MenuItem>
                                    {({ focus }) => (
                                        <button
                                            type="button"
                                            className={cn(
                                                'flex w-full items-center px-4 py-2 text-left text-sm',
                                                focus ? 'bg-gray-50 text-gray-900' : 'text-gray-700'
                                            )}
                                        >
                                            Profile
                                        </button>
                                    )}
                                </MenuItem>
                                <MenuItem>
                                    {({ focus }) => (
                                        <button
                                            type="button"
                                            onClick={() => setIsDrawerOpen(true)}
                                            className={cn(
                                                'flex w-full items-center px-4 py-2 text-left text-sm',
                                                focus ? 'bg-gray-50 text-gray-900' : 'text-gray-700'
                                            )}
                                        >
                                            Manage Client
                                        </button>
                                    )}
                                </MenuItem>
                                <MenuItem>
                                    {({ focus }) => (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                await authService.logout();
                                                navigate('/login');
                                            }}
                                            className={cn(
                                                'flex w-full items-center px-4 py-2 text-left text-sm',
                                                focus ? 'bg-red-50' : '',
                                                'text-red-600'
                                            )}
                                        >
                                            Sign Out
                                        </button>
                                    )}
                                </MenuItem>
                            </MenuItems>
                        </Transition>
                    </Menu>
                </div>
            </header>

            {/* Main */}
            <main className="pt-[60px]">
                <div className="relative min-h-[calc(100vh-60px)]">
                    <div className="relative pt-8 pb-10">
                        <Outlet />
                    </div>
                </div>
            </main>

            {/* Client Selection Drawer (preserved — opens from header Change + avatar Switch client) */}
            <Transition show={isDrawerOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setIsDrawerOpen(false)}>
                    <TransitionChild
                        as={Fragment}
                        enter="ease-in-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in-out duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-900/40 transition-opacity" />
                    </TransitionChild>

                    <div className="fixed inset-0 overflow-hidden">
                        <div className="absolute inset-0 overflow-hidden">
                            <div className="pointer-events-none fixed inset-y-0 left-0 flex max-w-full pr-10">
                                <TransitionChild
                                    as={Fragment}
                                    enter="transform transition ease-in-out duration-300"
                                    enterFrom="-translate-x-full"
                                    enterTo="translate-x-0"
                                    leave="transform transition ease-in-out duration-200"
                                    leaveFrom="translate-x-0"
                                    leaveTo="-translate-x-full"
                                >
                                    <DialogPanel className="pointer-events-auto w-[260px]">
                                        <div className="flex h-full flex-col bg-white shadow-xl">
                                            {/* Header */}
                                            <div className="flex items-start justify-between px-5 pt-5 pb-4">
                                                <div>
                                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Manage</p>
                                                    <DialogTitle className="mt-0.5 text-base font-medium text-blue-gray-800">Select Client</DialogTitle>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="mt-1 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                                    onClick={() => setIsDrawerOpen(false)}
                                                >
                                                    <span className="sr-only">Close</span>
                                                    <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                                                </button>
                                            </div>

                                            {/* Search */}
                                            <div className="px-5 pb-3">
                                                <AlliInput
                                                    name="client-search"
                                                    placeholder="Search"
                                                    value={search}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                                                    leadingIcon={
                                                        <MagnifyingGlassIcon className="alli-h-5 alli-w-5 alli-text-gray-600" aria-hidden="true" />
                                                    }
                                                />
                                            </div>

                                            {/* Client list */}
                                            <div className="flex-1 overflow-y-auto">
                                                {loadingClients ? (
                                                    <div className="flex h-32 items-center justify-center">
                                                        <ArrowPathIcon className="h-5 w-5 animate-spin text-[#0C69EA]" />
                                                    </div>
                                                ) : clientError ? (
                                                    <div className="px-5 py-8 text-center text-sm">
                                                        <ExclamationTriangleIcon className="mx-auto h-8 w-8 text-amber-500" />
                                                        <p className="mt-2 text-gray-600">{clientError}</p>
                                                        <button onClick={fetchClients} className="mt-4 font-medium text-[#0C69EA] hover:text-blue-700">
                                                            Try Again
                                                        </button>
                                                    </div>
                                                ) : filteredClients.length > 0 ? (
                                                    filteredClients.map((client) => {
                                                        const isActive = selectedClient?.slug === client.slug;
                                                        return (
                                                            <button
                                                                key={client.slug}
                                                                onClick={() => handleSelectClient(client)}
                                                                className={cn(
                                                                    'mx-2 flex w-[calc(100%-16px)] items-center rounded-md px-3 py-2.5 text-left text-[13px] transition-colors duration-150',
                                                                    isActive
                                                                        ? 'bg-blue-50 font-medium text-blue-600'
                                                                        : 'font-normal text-gray-800 hover:bg-gray-50'
                                                                )}
                                                            >
                                                                {client.name}
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <p className="px-5 py-8 text-center text-sm text-gray-500">No clients found.</p>
                                                )}
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

