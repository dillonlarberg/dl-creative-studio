import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { alliService } from '../services/alli';
import type { Client } from '../types';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from '../utils/cn';

export default function ClientSelectPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const fetchClients = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await alliService.getClients();
            setClients(data);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to load clients. Please ensure you are logged in and have access.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
    }, []);

    const filteredClients = clients.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (client: Client) => {
        localStorage.setItem('selectedClient', JSON.stringify(client));
        navigate('/');
    };

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-card">
                <div className="flex flex-col gap-0.5">
                    <h1 className="text-base font-medium text-gray-900">Select a client</h1>
                    <p className="text-[13px] text-gray-500">Choose which brand you want to work in. Your selection persists across sessions.</p>
                </div>

                <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                        type="text"
                        disabled={loading || !!error}
                        className="block w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:opacity-50"
                        placeholder="Search clients"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {error ? (
                    <div className="rounded-lg border border-red-100 bg-red-50 p-6 text-center">
                        <ExclamationTriangleIcon className="mx-auto h-8 w-8 text-red-400" />
                        <p className="mt-2 text-sm font-medium text-red-800">Couldn't load clients</p>
                        <p className="mt-1 text-[13px] text-red-700">{error}</p>
                        <button
                            onClick={fetchClients}
                            className="mt-4 inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[13px] font-medium text-red-700 hover:bg-red-50"
                        >
                            <ArrowPathIcon className="h-3.5 w-3.5" />
                            Try again
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {loading
                            ? Array.from({ length: 6 }).map((_, i) => (
                                  <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
                                      <div className="flex items-center gap-3">
                                          <div className="h-8 w-8 rounded-md bg-gray-100" />
                                          <div className="h-3 w-32 rounded bg-gray-100" />
                                      </div>
                                  </div>
                              ))
                            : filteredClients.length > 0
                              ? filteredClients.map((client) => (
                                    <button
                                        key={client.slug}
                                        onClick={() => handleSelect(client)}
                                        className={cn(
                                            'group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors',
                                            'hover:border-blue-300 hover:bg-blue-50/30'
                                        )}
                                    >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[13px] font-medium text-blue-600 group-hover:bg-blue-100">
                                            {client.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="truncate text-sm font-medium text-gray-900">{client.name}</span>
                                    </button>
                                ))
                              : (
                                  <div className="col-span-full rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-[13px] text-gray-500">
                                      No clients found matching "{search}".
                                  </div>
                              )}
                    </div>
                )}
            </div>
        </div>
    );
}
