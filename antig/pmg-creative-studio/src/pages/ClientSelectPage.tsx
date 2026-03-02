import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { alliService } from '../services/alli';
import type { Client } from '../types';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

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
        <div className="mx-auto max-w-2xl px-4 py-12">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Select a Client</h1>
                <p className="mt-4 text-sm text-blue-gray-600">
                    Choose which brand you want to optimize or create content for.
                </p>
            </div>

            <div className="mt-10">
                <div className="relative mb-6">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                        type="text"
                        disabled={loading || !!error}
                        className="block w-full rounded-md border-0 py-3 pl-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 disabled:opacity-50"
                        placeholder="Search clients..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>


                {error ? (
                    <div className="rounded-lg bg-red-50 p-6 text-center border border-red-100">
                        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
                        <h3 className="mt-2 text-sm font-semibold text-red-800">Error Loading Clients</h3>
                        <p className="mt-1 text-sm text-red-700">{error}</p>
                        <div className="mt-6">
                            <button
                                onClick={fetchClients}
                                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
                            >
                                <ArrowPathIcon className="h-4 w-4" />
                                Try Again
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {loading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-4"></div>
                                    <div className="h-4 w-3/4 bg-gray-100 rounded"></div>
                                </div>
                            ))
                        ) : filteredClients.length > 0 ? (
                            filteredClients.map((client) => (
                                <button
                                    key={client.slug}
                                    onClick={() => handleSelect(client)}
                                    className="group relative flex flex-col items-center justify-center rounded-xl border border-gray-100 bg-white/80 backdrop-blur-sm p-8 text-center shadow-card hover:shadow-elevated hover:border-blue-600 hover:ring-1 hover:ring-blue-600 transition-all active:scale-95 border-white/20"
                                >
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                                        <span className="text-xl font-bold">{client.name.charAt(0)}</span>
                                    </div>
                                    <h3 className="mt-4 text-sm font-semibold text-gray-900 truncate w-full px-2">{client.name}</h3>
                                </button>
                            ))
                        ) : (
                            <div className="col-span-full py-12 text-center text-blue-gray-400">
                                No clients found matching "{search}"
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
