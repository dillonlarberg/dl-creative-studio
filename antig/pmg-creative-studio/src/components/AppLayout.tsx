import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../utils/cn';
import { useEffect, useState } from 'react';
import { authService } from '../services/auth';
import { Input as AlliInputBase } from '@agencypmg/alli-design-system';
import {
    ArrowRightStartOnRectangleIcon,
    XMarkIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    Cog6ToothIcon,
    QuestionMarkCircleIcon,
    BellIcon,
    ChevronRightIcon,
    Squares2X2Icon,
    ChartBarIcon,
    ClipboardDocumentListIcon,
    BoltIcon,
    UsersIcon,
    ShoppingBagIcon,
    PhotoIcon,
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

// Platform-style nav rail. Only AdLabs is enabled — the other items mirror the
// Alli platform's section list (Dashboards, Data, Strategy & Planning, Actions,
// Audiences, Products) as visual context. Settings has Client Asset House as a
// sub-item, matching how Alli platform groups admin surfaces under Settings.
type NavItem = {
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    href?: string;
    disabled?: boolean;
    children?: { name: string; href: string; matchPrefix?: boolean; disabled?: boolean }[];
};

const PRIMARY_NAV: NavItem[] = [
    { name: 'Dashboards', icon: Squares2X2Icon, disabled: true },
    { name: 'Data', icon: ChartBarIcon, disabled: true },
    { name: 'Strategy & Planning', icon: ClipboardDocumentListIcon, disabled: true },
    { name: 'Actions', icon: BoltIcon, disabled: true },
    { name: 'Audiences', icon: UsersIcon, disabled: true },
    { name: 'Creative', icon: PhotoIcon, children: [{ name: 'AdLabs', href: '/adlabs/', matchPrefix: true }] },
    { name: 'Products', icon: ShoppingBagIcon, disabled: true },
];

const SETTINGS_ITEM: NavItem = {
    name: 'Settings',
    icon: Cog6ToothIcon,
    children: [
        { name: 'Manage Client', href: '#', disabled: true },
        { name: 'Cloud Storage', href: '#', disabled: true },
        { name: 'Client Asset House', href: '/client-asset-house' },
    ],
};

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

    const isAdLabsActive = !location.pathname.startsWith('/client-asset-house');
    const isSettingsActive = location.pathname.startsWith('/client-asset-house');

    // Resolve Creative > AdLabs href to the current client so the link lands correctly.
    const resolvedPrimaryNav = PRIMARY_NAV.map((item) => {
        if (item.name === 'Creative' && item.children) {
            return {
                ...item,
                children: item.children.map((child) =>
                    child.name === 'AdLabs'
                        ? { ...child, href: selectedClient?.slug ? `/adlabs/${selectedClient.slug}/` : '/adlabs/' }
                        : child
                ),
            };
        }
        return item;
    });

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
                                            onClick={() => setIsDrawerOpen(true)}
                                            className={cn(
                                                'flex w-full items-center gap-2 px-4 py-2 text-left text-sm',
                                                focus ? 'bg-gray-50 text-gray-900' : 'text-gray-700'
                                            )}
                                        >
                                            <Squares2X2Icon className="h-4 w-4 text-gray-400" />
                                            Switch client
                                            {selectedClient?.name && <span className="ml-auto truncate text-xs text-gray-400">{selectedClient.name}</span>}
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
                                                'flex w-full items-center gap-2 px-4 py-2 text-left text-sm',
                                                focus ? 'bg-gray-50 text-gray-900' : 'text-gray-700'
                                            )}
                                        >
                                            <ArrowRightStartOnRectangleIcon className="h-4 w-4 text-gray-400" />
                                            Log out
                                        </button>
                                    )}
                                </MenuItem>
                            </MenuItems>
                        </Transition>
                    </Menu>
                </div>
            </header>

            {/* Sidebar rail — full height (behind header), icon-only by default, hover-expands to show labels */}
            <aside
                className="group fixed inset-y-0 left-0 z-20 flex w-16 flex-col items-stretch overflow-hidden border-r border-gray-200 transition-[width] duration-200 ease-out hover:w-[256px]" style={{ backgroundColor: '#F4F7FC' }}
                aria-label="Primary navigation"
            >
                <nav className="flex-1 overflow-y-auto pt-[60px] pb-2">
                    <ul className="flex flex-col gap-0.5">
                        {resolvedPrimaryNav.map((item) => (
                            <li key={item.name}>
                                <RailItem
                                    item={item}
                                    active={item.name === 'Creative' && isAdLabsActive}
                                />
                            </li>
                        ))}
                    </ul>
                </nav>
                <div className="border-t border-gray-200 py-2">
                    <ul className="flex flex-col gap-0.5">
                        <li>
                            <RailItem item={SETTINGS_ITEM} active={isSettingsActive} />
                        </li>
                    </ul>
                </div>
            </aside>

            {/* Main */}
            <main className="ml-16 pt-[60px]" style={{ backgroundColor: '#EEF1F7' }}>
                <div className="relative min-h-[calc(100vh-60px)]">
                    <div className="relative mx-auto max-w-[1440px] px-9 pt-8 pb-10">
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

/**
 * Sidebar nav item. Icon lives in a fixed-width 64px slot so it stays
 * centered in the collapsed rail. Labels and chevron fade in on hover.
 */
function RailItem({ item, active }: { item: NavItem; active: boolean }) {
    const { pathname } = useLocation();
    const [isOpen, setIsOpen] = useState(active && !!item.children?.length);
    const Icon = item.icon;
    const hasChildren = !!item.children?.length;

    // Row — no horizontal padding; icon slot and pr-3 handle all spacing
    const base = 'flex h-10 w-full items-center text-left transition-colors duration-150';
    const idle = 'font-normal text-blue-gray-700 hover:bg-blue-gray-50';
    const disabledCls = 'cursor-not-allowed font-normal text-blue-gray-300';
    const activeCls = 'bg-blue-gray-50 font-semibold text-blue-gray-900';

    // Icon always centered inside the 64px slot = centered in the collapsed rail
    const iconSlot = 'flex w-16 shrink-0 items-center justify-center';
    const iconCls = cn('h-[20px] w-[20px] shrink-0', active ? 'text-blue-600' : 'text-blue-gray-500');

    const labelCls = 'flex-1 truncate text-[13px] opacity-0 transition-opacity duration-150 group-hover:opacity-100';
    const chevronCls = 'mr-3 h-3.5 w-3.5 shrink-0 text-blue-gray-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100';

    if (item.disabled) {
        return (
            <div className={cn(base, disabledCls)} aria-disabled="true">
                <span className={iconSlot}><Icon className={iconCls} /></span>
                <span className={labelCls}>{item.name}</span>
                <ChevronRightIcon className={chevronCls} />
            </div>
        );
    }

    if (hasChildren) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setIsOpen(o => !o)}
                    className={cn(base, active ? activeCls : idle)}
                >
                    <span className={iconSlot}><Icon className={iconCls} /></span>
                    <span className={labelCls}>{item.name}</span>
                    <ChevronRightIcon
                        className={cn(chevronCls, isOpen && 'rotate-90')}
                    />
                </button>
                {isOpen && (
                    <ul className="hidden flex-col group-hover:flex">
                        {item.children!.map((child) => {
                            const isChildActive = !child.disabled && (child.matchPrefix
                                ? pathname.startsWith(child.href)
                                : pathname === child.href);
                            return (
                                <li key={child.name}>
                                    {child.disabled ? (
                                        <span className="flex h-9 w-full cursor-not-allowed items-center pl-16 pr-3 text-[13px] text-blue-gray-300">
                                            {child.name}
                                        </span>
                                    ) : (
                                        <Link
                                            to={child.href}
                                            className={cn(
                                                'flex h-9 w-full items-center pl-16 pr-3 text-[13px] font-normal transition-colors duration-150',
                                                isChildActive
                                                    ? 'bg-blue-gray-50 font-semibold text-blue-600'
                                                    : 'text-blue-gray-600 hover:bg-blue-gray-50 hover:text-blue-gray-800'
                                            )}
                                        >
                                            {child.name}
                                        </Link>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </>
        );
    }

    return (
        <Link
            to={item.href!}
            className={cn(base, active ? activeCls : idle)}
            aria-current={active ? 'page' : undefined}
        >
            <span className={iconSlot}><Icon className={iconCls} /></span>
            <span className={labelCls}>{item.name}</span>
            <ChevronRightIcon className={chevronCls} />
        </Link>
    );
}
