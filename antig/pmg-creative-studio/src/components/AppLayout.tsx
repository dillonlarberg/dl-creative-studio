import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../utils/cn';
import { useEffect, useState } from 'react';
import { authService } from '../services/auth';
import {
    HomeIcon,
    SparklesIcon,
    ArrowRightStartOnRectangleIcon,
    BookOpenIcon,
    XMarkIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Fragment } from 'react';
import { alliService } from '../services/alli';
import type { Client } from '../types';
import Breadcrumbs from './Breadcrumbs';
import { clientAssetHouseService } from '../services/clientAssetHouse';

const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'Create New', href: '/create', icon: SparklesIcon },
    { name: 'Client Asset House', href: '/client-asset-house', icon: BookOpenIcon },
];

export default function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [search, setSearch] = useState('');
    const [loadingClients, setLoadingClients] = useState(false);

    useEffect(() => {
        const clientStr = localStorage.getItem('selectedClient');
        if (!clientStr && location.pathname !== '/select-client' && location.pathname !== '/login') {
            navigate('/select-client');
        } else if (clientStr) {
            const client = JSON.parse(clientStr);
            setSelectedClient(client);
            // Load fonts for the client
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
        if (isDrawerOpen && clients.length === 0) {
            fetchClients();
        }
    }, [isDrawerOpen]);

    const fetchClients = async () => {
        setLoadingClients(true);
        try {
            const data = await alliService.getClients();
            setClients(data);
        } catch (err) {
            console.error('Failed to load clients:', err);
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
                <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
                    <span className="text-xl font-bold text-gray-900">alli</span>
                    <div className="h-6 w-px bg-gray-200 mx-1" />
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-sm font-medium text-gray-900">
                            {selectedClient?.name || '...'}
                        </span>
                        <button
                            onClick={() => setIsDrawerOpen(true)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-500"
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
                            DL
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">Dillon Larberg</p>
                            <button
                                onClick={() => navigate('/select-client')}
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
                <div className="brand-gradient min-h-screen">
                    <Breadcrumbs />
                    <div className="mx-auto max-w-7xl px-6 py-4 sm:px-8">
                        <Outlet />
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
                                                    ) : (
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
