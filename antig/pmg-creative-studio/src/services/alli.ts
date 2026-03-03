/**
 * Alli API Service
 * Handles communication with the Alli platform (Data Explorer, Central, Audience Planner)
 */

import type { Client, CreativeAsset } from '../types';
import { authService } from './auth';

const PROXY_BASE = 'https://us-central1-automated-creative-e10d7.cloudfunctions.net';

export class AlliService {
    private static instance: AlliService;
    private assetCache: Record<string, CreativeAsset[]> = {};

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
        try {
            // We use getMe() because it returns the specific subset of clients 
            // the user is assigned to, which is usually more relevant than the 
            // full directory of clients.
            const meData = await this.getMe();

            const clientList = meData.user?.clients || [];

            return clientList.map((c: any) => ({
                slug: c.slug || c.id,
                name: c.name || c.slug,
                id: c.id
            }));
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

            return list.map((c: any) => ({
                slug: c.slug || c.id,
                name: c.name || c.slug,
                id: c.id
            }));
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
     * Fetches product feeds for a specific client
     */
    async getProductFeeds(clientSlug: string): Promise<any[]> {
        console.log(`Fetching feeds for ${clientSlug}...`);
        return [
            { id: 'feed_1', name: 'Global Product Feed', type: 'product_feed' },
        ];
    }
}

export const alliService = AlliService.getInstance();
