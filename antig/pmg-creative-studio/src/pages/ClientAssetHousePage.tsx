import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientAssetHouseService } from '../services/clientAssetHouse';
import type { ClientAssetHouse, AssetHouseItem } from '../services/clientAssetHouse';
import { fontParser } from '../utils/fontParser';
import { cn } from '../utils/cn';
import {
    PlusIcon,
    TrashIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    ArrowPathIcon,
    ArrowUpTrayIcon
} from '@heroicons/react/24/outline';

export default function ClientAssetHousePage() {
    const [assetHouse, setAssetHouse] = useState<ClientAssetHouse | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const client = JSON.parse(localStorage.getItem('selectedClient') || '{}');

    useEffect(() => {
        if (client.slug) {
            fetchAssetHouse();
        } else {
            setLoading(false);
        }
    }, [client.slug]);

    useEffect(() => {
        if (assetHouse) {
            console.log(`[ClientAssetHousePage] State updated: ${assetHouse.assets.length} assets, ${assetHouse.variables.length} variables.`);
        }
    }, [assetHouse]);

    const fetchAssetHouse = async () => {
        setLoading(true);
        try {
            const data = await clientAssetHouseService.getAssetHouse(client.slug);
            const house = data || {
                clientSlug: client.slug,
                primaryColor: '#000000',
                fontPrimary: 'Inter',
                variables: [],
                assets: [],
                lastUpdated: new Date().toISOString()
            } as ClientAssetHouse;

            // Ensure variables array exists for older records
            if (!house.variables) house.variables = [];

            console.log(`[fetchAssetHouse] Successfully loaded house for ${client.slug}. Assets: ${house.assets.length}, Variables: ${house.variables.length}`);
            setAssetHouse(house);

            // Diagnostic: List all font assets found
            const fontAssets = house.assets.filter(a => a.type === 'font');
            console.log('[fetchAssetHouse] Font assets found:', fontAssets.map(f => f.name));

        } catch (err: any) {
            setError('Failed to load client asset house.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'font', field?: keyof ClientAssetHouse) => {
        const file = e.target.files?.[0];
        if (!file || !assetHouse) return;

        console.log(`File selection detected: ${file.name} (${file.size} bytes)`);
        setSaving(true);
        try {
            if (type === 'font' && file.name.toLowerCase().endsWith('.ttc')) {
                console.log('Processing font collection (.ttc)...');
                const buffer = await file.arrayBuffer();
                const fonts = await fontParser.parseFontBuffer(buffer, file.name);
                console.log(`Extracted ${fonts.length} fonts from collection.`);

                if (fonts.length === 0) {
                    throw new Error('No valid fonts found in the collection.');
                }

                // Show progress in the UI
                setError(`Extracting ${fonts.length} fonts...`);

                const uploadPromises = fonts.map(async (font) => {
                    const blob = new Blob([font.buffer], { type: 'font/ttf' });
                    // Sanitize name for Firebase Storage
                    const safeName = font.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

                    const url = await clientAssetHouseService.uploadAsset(client.slug, blob, 'font', `${safeName}.ttf`);
                    clientAssetHouseService.loadCustomFont(font.name, url);

                    return {
                        id: crypto.randomUUID(),
                        name: font.name,
                        url: url,
                        type: 'font'
                    } as AssetHouseItem;
                });

                const newAssets = await Promise.all(uploadPromises);

                console.log(`TTC upload complete. Successfully uploaded ${newAssets.length} fonts.`);
                setError(null);

                setAssetHouse(prev => {
                    if (!prev) return prev;
                    const updatedHouse = {
                        ...prev,
                        assets: [...(prev.assets || []), ...newAssets],
                        fontPrimary: prev.fontPrimary === 'Inter' && newAssets.length > 0 ? newAssets[0].name : prev.fontPrimary,
                        lastUpdated: new Date().toISOString()
                    };

                    // Auto-save the results immediately since it's a bulk operation
                    clientAssetHouseService.saveAssetHouse(client.slug, updatedHouse).catch(saveErr => {
                        console.error('Auto-save failed after TTC upload:', saveErr);
                    });

                    return updatedHouse;
                });
            } else {
                console.log(`Uploading single ${type}...`);
                const url = await clientAssetHouseService.uploadAsset(client.slug, file, type);

                setAssetHouse(prev => {
                    if (!prev) return prev;
                    if (field) {
                        return { ...prev, [field]: url, lastUpdated: new Date().toISOString() };
                    } else if (type === 'font') {
                        const fontName = file.name.split('.')[0];
                        const newAsset: AssetHouseItem = {
                            id: crypto.randomUUID(),
                            name: fontName,
                            url: url,
                            type: 'font'
                        };
                        return {
                            ...prev,
                            assets: [...(prev.assets || []), newAsset],
                            fontPrimary: prev.fontPrimary === 'Inter' ? fontName : prev.fontPrimary,
                            lastUpdated: new Date().toISOString()
                        };
                    }
                    return prev;
                });
            }
        } catch (err: any) {
            console.error('Upload failed:', err);
            setError(`Upload failed: ${err.message || 'Unknown error'}. Check your permissions.`);
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (!assetHouse) return;
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            await clientAssetHouseService.saveAssetHouse(client.slug, assetHouse);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            console.error('Save failed:', err);
            setError(`Save failed: ${err.message || 'Unknown error'}. Check your permissions.`);
        } finally {
            setSaving(false);
        }
    };

    const addAsset = () => {
        if (!assetHouse) return;
        const newAsset: AssetHouseItem = {
            id: crypto.randomUUID(),
            name: '',
            url: '',
            type: 'logo'
        };
        setAssetHouse({
            ...assetHouse,
            assets: [...assetHouse.assets, newAsset]
        });
    };

    const updateAsset = (id: string, updates: Partial<AssetHouseItem>) => {
        if (!assetHouse) return;
        setAssetHouse({
            ...assetHouse,
            assets: assetHouse.assets.map(a => a.id === id ? { ...a, ...updates } : a)
        });
    };

    const removeAsset = (id: string) => {
        if (!assetHouse) return;
        setAssetHouse({
            ...assetHouse,
            assets: assetHouse.assets.filter(a => a.id !== id)
        });
    };

    const addVariable = (type: 'color' | 'font' | 'number' | 'text') => {
        if (!assetHouse) return;
        const newVar = {
            id: crypto.randomUUID(),
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${assetHouse.variables.length + 1}`,
            type,
            value: type === 'color' ? '#ffffff' : ''
        };
        setAssetHouse({
            ...assetHouse,
            variables: [...assetHouse.variables, newVar]
        });
    };

    const updateVariable = (id: string, updates: any) => {
        if (!assetHouse) return;
        setAssetHouse({
            ...assetHouse,
            variables: assetHouse.variables.map(v => v.id === id ? { ...v, ...updates } : v)
        });
    };

    const removeVariable = (id: string) => {
        if (!assetHouse) return;
        setAssetHouse({
            ...assetHouse,
            variables: assetHouse.variables.filter(v => v.id !== id)
        });
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!client.slug) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <ExclamationCircleIcon className="h-12 w-12 text-blue-gray-300" />
                <h3 className="mt-4 text-base font-semibold text-gray-900">No Client Selected</h3>
                <p className="mt-2 text-sm text-blue-gray-500">Please select a client to view and manage their Asset House.</p>
                <button
                    onClick={() => navigate('/select-client')}
                    className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
                >
                    Select Client
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-4xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Client Asset House</h1>
                <p className="mt-1 text-sm text-blue-gray-500">
                    Manage visual assets and brand rules for <span className="font-semibold text-blue-600">{client.name}</span>.
                    These assets are shared across all users for this client.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Mandatory Brand Standards Section */}
                <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-card">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">Mandatory Standards</h2>
                        {clientAssetHouseService.checkBrandStandards(assetHouse) ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                                <CheckCircleIcon className="h-4 w-4" /> Ready for Creative
                            </span>
                        ) : (
                            <div className="group relative">
                                <span className="flex cursor-help items-center gap-1 text-xs font-bold text-amber-600">
                                    <ExclamationCircleIcon className="h-4 w-4" /> Requirements Missing
                                </span>
                                <div className="absolute right-0 top-full z-10 mt-2 hidden w-48 rounded-md bg-white p-2 text-[10px] shadow-lg border border-gray-100 group-hover:block">
                                    <p className="font-bold text-gray-700 underline mb-1">Missing:</p>
                                    {!assetHouse?.primaryColor && <p>• Primary Color</p>}
                                    {!assetHouse?.fontPrimary && <p>• Main Font Family</p>}
                                    {!assetHouse?.logoPrimary && <p>• Primary Logo</p>}
                                    {!assetHouse?.logoInverse && <p>• Inverse Logo</p>}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        {/* Logos */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Primary Logo (Light BG)</label>
                                <div className="mt-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={assetHouse?.logoPrimary || ''}
                                        placeholder="URL or Upload"
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setAssetHouse(prev => prev ? { ...prev, logoPrimary: val } : prev);
                                        }}
                                        className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    />
                                    <label className="flex cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white px-3 shadow-sm hover:bg-gray-50">
                                        <ArrowUpTrayIcon className="h-4 w-4 text-gray-500" />
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'logo', 'logoPrimary')} />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Inverse Logo (Dark BG)</label>
                                <div className="mt-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={assetHouse?.logoInverse || ''}
                                        placeholder="URL or Upload"
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setAssetHouse(prev => prev ? { ...prev, logoInverse: val } : prev);
                                        }}
                                        className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    />
                                    <label className="flex cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white px-3 shadow-sm hover:bg-gray-50">
                                        <ArrowUpTrayIcon className="h-4 w-4 text-gray-500" />
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'logo', 'logoInverse')} />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Colors & Typography */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Primary Brand Color</label>
                                <div className="mt-1 flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={assetHouse?.primaryColor || '#000000'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setAssetHouse(prev => prev ? { ...prev, primaryColor: val } : prev);
                                        }}
                                        className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                                    />
                                    <input
                                        type="text"
                                        value={assetHouse?.primaryColor || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setAssetHouse(prev => prev ? { ...prev, primaryColor: val } : prev);
                                        }}
                                        className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Main Font Family</label>
                                <div className="mt-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={assetHouse?.fontPrimary || ''}
                                        placeholder="e.g., Inter, Roboto"
                                        list="available-fonts"
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setAssetHouse(prev => prev ? { ...prev, fontPrimary: val } : prev);
                                        }}
                                        className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    />
                                    <datalist id="available-fonts">
                                        <option value="Inter" />
                                        <option value="Roboto" />
                                        <option value="Open Sans" />
                                        {assetHouse?.assets.filter(a => a.type === 'font').map(font => (
                                            <option key={font.id} value={font.name} />
                                        ))}
                                    </datalist>
                                    <label className="flex cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white px-3 shadow-sm hover:bg-gray-50">
                                        <ArrowUpTrayIcon className="h-4 w-4 text-gray-500" />
                                        <input type="file" className="hidden" accept=".ttf,.woff,.woff2,.otf,.ttc" onChange={(e) => handleFileUpload(e, 'font')} />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dynamic Brand Variables Section */}
                <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-card">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">Custom Brand Variables</h2>
                        <div className="flex gap-2">
                            <select
                                onChange={(e) => {
                                    if (e.target.value) {
                                        addVariable(e.target.value as any);
                                        e.target.value = '';
                                    }
                                }}
                                className="rounded-md border-gray-300 py-1 pl-3 pr-8 text-xs font-semibold text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="">+ Add Variable</option>
                                <option value="color">Brand Color</option>
                                <option value="font">Custom Font</option>
                                <option value="number">Numeric (Kerning/Spacing)</option>
                                <option value="text">General Text</option>
                            </select>
                        </div>
                    </div>

                    <div className="max-h-[300px] space-y-4 overflow-y-auto pr-2">
                        {assetHouse?.variables.map((variable) => (
                            <div key={variable.id} className="group relative flex items-center gap-4 rounded-lg border border-gray-50 bg-gray-50/30 p-3 transition-colors hover:bg-gray-50">
                                <div className="flex-1 space-y-2">
                                    <input
                                        type="text"
                                        value={variable.name}
                                        onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
                                        placeholder="Variable Name"
                                        className="block w-full border-none bg-transparent p-0 text-xs font-bold uppercase text-gray-500 focus:ring-0"
                                    />

                                    <div className="flex items-center gap-2">
                                        {variable.type === 'color' && (
                                            <>
                                                <input
                                                    type="color"
                                                    value={variable.value || '#ffffff'}
                                                    onChange={(e) => updateVariable(variable.id, { value: e.target.value })}
                                                    className="h-8 w-10 cursor-pointer rounded border border-gray-200"
                                                />
                                                <input
                                                    type="text"
                                                    value={variable.value}
                                                    onChange={(e) => updateVariable(variable.id, { value: e.target.value })}
                                                    className="block w-full rounded-md border-gray-200 bg-white py-1 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                                />
                                            </>
                                        )}
                                        {variable.type === 'font' && (
                                            <div className="flex w-full gap-2">
                                                <input
                                                    type="text"
                                                    value={variable.value}
                                                    placeholder="Font Family Name"
                                                    onChange={(e) => updateVariable(variable.id, { value: e.target.value })}
                                                    className="block w-full rounded-md border-gray-200 bg-white py-1 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                                />
                                                <label className="flex cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white px-2 shadow-sm hover:bg-gray-50">
                                                    <ArrowUpTrayIcon className="h-4 w-4 text-gray-500" />
                                                    <input type="file" className="hidden" accept=".ttf,.woff,.woff2,.otf,.ttc" onChange={(e) => handleFileUpload(e, 'font')} />
                                                </label>
                                            </div>
                                        )}
                                        {(variable.type === 'number' || variable.type === 'text') && (
                                            <input
                                                type="text"
                                                value={variable.value}
                                                placeholder={variable.type === 'number' ? 'e.g. 1.2 or 16px' : 'Value'}
                                                onChange={(e) => updateVariable(variable.id, { value: e.target.value })}
                                                className="block w-full rounded-md border-gray-200 bg-white py-1 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            />
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeVariable(variable.id)}
                                    className="opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            </div>
                        ))}

                        {(!assetHouse?.variables || assetHouse.variables.length === 0) && (
                            <div className="py-8 text-center text-xs text-blue-gray-400">
                                No custom variables added. Use the menu above to add more brand standards.
                            </div>
                        )}
                    </div>
                </div>

                {/* Status/Save Section */}
                <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-blue-50 p-6 shadow-card">
                    <div>
                        <h2 className="text-lg font-semibold text-blue-900">Sync Status</h2>
                        <p className="mt-2 text-sm text-blue-800/70">
                            Last persistent update: {assetHouse?.lastUpdated ? new Date(assetHouse.lastUpdated).toLocaleString() : 'Never'}
                        </p>
                    </div>

                    <div className="mt-6 flex items-center gap-4">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>

                        {success && (
                            <div className="flex items-center gap-1 text-sm font-medium text-green-600">
                                <CheckCircleIcon className="h-5 w-5" />
                                Saved
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-1 text-sm font-medium text-red-600">
                                <ExclamationCircleIcon className="h-5 w-5" />
                                {error}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Assets Section */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-gray-900">Asset House Repository</h2>
                        <button
                            onClick={fetchAssetHouse}
                            className="p-1 text-blue-gray-400 hover:text-blue-600 transition-colors"
                            title="Refresh from Database"
                        >
                            <ArrowPathIcon className={cn("h-4 w-4", loading && "animate-spin")} />
                        </button>
                    </div>
                    <button
                        onClick={addAsset}
                        className="flex items-center gap-1 rounded-md bg-blue-gray-50 px-3 py-1.5 text-xs font-semibold text-blue-gray-700 hover:bg-blue-gray-100"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add Asset
                    </button>
                </div>

                <div className="mt-6 space-y-4">
                    {assetHouse?.assets.map((asset) => (
                        <div key={asset.id} className="flex items-start gap-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                            <div className="flex-1 grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-gray-500">Name</label>
                                    <input
                                        type="text"
                                        value={asset.name}
                                        onChange={(e) => updateAsset(asset.id, { name: e.target.value })}
                                        className="mt-1 block w-full border-b border-gray-300 bg-transparent py-1 text-sm focus:border-blue-500 focus:outline-none"
                                        placeholder="Main Logo"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-[10px] font-bold uppercase text-gray-500">Asset URL / Reference</label>
                                    <input
                                        type="text"
                                        value={asset.url}
                                        onChange={(e) => updateAsset(asset.id, { url: e.target.value })}
                                        className="mt-1 block w-full border-b border-gray-300 bg-transparent py-1 text-sm focus:border-blue-500 focus:outline-none"
                                        placeholder="https://cdn.pmg.com/logo.png"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => removeAsset(asset.id)}
                                className="mt-4 text-blue-gray-400 hover:text-red-600"
                            >
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ))}

                    {assetHouse?.assets.length === 0 && (
                        <div className="py-12 text-center text-sm text-blue-gray-400">
                            No assets added yet. Add your brand logos or asset references here.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
