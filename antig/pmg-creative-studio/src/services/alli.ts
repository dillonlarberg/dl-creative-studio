/**
 * Alli API Service
 * Handles communication with the Alli platform (Data Explorer, Central, Audience Planner)
 */

import type { Client, CreativeAsset } from '../types';
import { authService } from './auth';

const PROXY_BASE = '/api';

export class AlliService {
    private static instance: AlliService;
    private assetCache: Record<string, CreativeAsset[]> = {};
    private clientCache: Client[] | null = null;
    private clientCacheTime: number = 0;

    private constructor() { }

    public static getInstance(): AlliService {
        if (!AlliService.instance) {
            AlliService.instance = new AlliService();
        }
        return AlliService.instance;
    }

    /**
     * Fetches current user metadata and token info from Central API
     */
    async getMe(): Promise<any> {
        const token = await authService.getAccessToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${PROXY_BASE}/getMeProxy`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Me API Error: ${response.status} - ${errorBody}`);
        }

        return await response.json();
    }

    /**
     * Fetches the list of clients accessible to the current user
     */
    /**
     * Fetches the list of clients accessible to the current user
     * Preference is given to the /me endpoint which returns user-assigned clients
     */
    async getClients(): Promise<Client[]> {
        const CACHE_STALENESS_MS = 5 * 60 * 1000; // 5 minutes
        if (this.clientCache && (Date.now() - this.clientCacheTime < CACHE_STALENESS_MS)) {
            console.log('[AlliService] Returning cached client list');
            return this.clientCache;
        }

        try {
            const meData = await this.getMe();
            console.log('[AlliService] /me response:', meData);

            // Try multiple places where clients might live in the /me response
            const clientList = meData.user?.clients || meData.clients || meData.results || meData.data || (Array.isArray(meData) ? meData : null);

            if (!clientList || !Array.isArray(clientList) || clientList.length === 0) {
                console.warn('[AlliService] No clients found in /me response, trying fallback...');
                throw new Error('No clients found in user profile');
            }

            const mapped = clientList.filter((c: any) => c && (c.slug || c.id || c.name)).map((c: any) => ({
                slug: c.slug || c.id || String(c.name).toLowerCase().replace(/\s+/g, '-'),
                name: c.name || c.slug || 'Unknown Client',
                id: c.id || c.slug || 'unknown'
            }));

            this.clientCache = mapped;
            this.clientCacheTime = Date.now();
            return mapped;
        } catch (error) {
            console.error('Fetch Clients Error (falling back to /clients):', error);

            // Fallback to the broad /clients list if /me fails or is different
            const token = await authService.getAccessToken();
            if (!token) throw new Error('Not authenticated');

            const response = await fetch(`${PROXY_BASE}/getClientsProxy`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const list = data.results || data.data || (Array.isArray(data) ? data : []);

            const fallbackMapped = list.filter((c: any) => c && (c.slug || c.id || c.name)).map((c: any) => ({
                slug: c.slug || c.id || String(c.name).toLowerCase().replace(/\s+/g, '-'),
                name: c.name || c.slug || 'Unknown Client',
                id: c.id || c.slug || 'unknown'
            }));

            this.clientCache = fallbackMapped;
            this.clientCacheTime = Date.now();
            return fallbackMapped;
        }
    }

    /**
     * Fetches creative assets for a specific client
     * Uses the 'creative_insights_data_export' model
     */
    async getCreativeAssets(clientSlug: string, forceRefresh = false): Promise<CreativeAsset[]> {
        if (!forceRefresh && this.assetCache[clientSlug]) {
            console.log(`Returning cached assets for ${clientSlug}...`);
            return this.assetCache[clientSlug];
        }

        console.log(`Fetching assets for ${clientSlug} from Alli...`);
        const token = await authService.getAccessToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${PROXY_BASE}/getCreativeAssetsProxy?clientSlug=${clientSlug}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Data Explorer Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const results = data.results || (Array.isArray(data) ? data : []);

        const mapped = results.map((item: any, idx: number) => {
            const getValue = (key: string) => {
                return item[key] || item[`creative_insights_data_export__${key}`];
            };

            const id = getValue('ci_ad_id') || getValue('ad_id') || `asset-${idx}`;
            return {
                id,
                url: getValue('url'),
                type: (getValue('creative_type') === 'video' ? 'video' : 'image') as 'video' | 'image',
                name: id,
                platform: getValue('platform')
            };
        }).filter((asset: CreativeAsset) => asset.url);

        this.assetCache[clientSlug] = mapped;
        return mapped;
    }

    /**
     * Fetches all data sources (models) for a client
     */
    async getDataSources(clientSlug: string): Promise<any[]> {
        const token = await authService.getAccessToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${PROXY_BASE}/getDataSourcesProxy?clientSlug=${clientSlug}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Data Sources Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log(`[AlliService] getDataSources raw response for ${clientSlug}:`, data);

        // Alli UDA can return models in several keys depending on the endpoint/version
        const models = data.models || data.results || data.data || data.payload || (Array.isArray(data) ? data : []);
        return models;
    }

    /**
     * Fetches metadata for a specific model (dimensions, measures, etc.)
     */
    async getModelMetadata(clientSlug: string, modelName: string): Promise<any> {
        const token = await authService.getAccessToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${PROXY_BASE}/getModelMetadataProxy?clientSlug=${clientSlug}&modelName=${modelName}&t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Metadata Error: ${response.status} - ${errorText}`);
        }

        return await response.json();
    }

    async executeQuery(clientSlug: string, modelName: string, query: { dimensions?: string[], measures?: string[], limit?: number }): Promise<any> {
        const token = await authService.getAccessToken();
        if (!token) throw new Error('Not authenticated');

        const url = `${PROXY_BASE}/smartExecuteQueryProxy?clientSlug=${clientSlug}&modelName=${modelName}&t=${Date.now()}`;
        console.log(`[AlliService] Executing query on ${modelName}:`, { url, query });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(query)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[AlliService] Query failed (${response.status}):`, errorText);
                throw new Error(`Query Error: ${response.status} - ${errorText}`);
            }

            return await response.json();
        } catch (fetchErr: any) {
            console.error('[AlliService] ExecuteQuery Fetch Exception:', fetchErr);
            throw fetchErr;
        }
    }
}

export const alliService = AlliService.getInstance();
