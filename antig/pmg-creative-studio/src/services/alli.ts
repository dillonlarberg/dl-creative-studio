/**
 * Alli API Service
 * Handles communication with the Alli platform (Data Explorer, Central, Audience Planner)
 */

import type { Client, CreativeAsset } from '../types';
import { authService } from './auth';

const PROXY_BASE = 'https://us-central1-automated-creative-e10d7.cloudfunctions.net';

export class AlliService {
    private static instance: AlliService;

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
    async getCreativeAssets(clientSlug: string): Promise<CreativeAsset[]> {
        console.log(`Fetching assets for ${clientSlug}...`);
        // Mock response for now - targeting this next
        return [
            { id: '1', url: 'https://placehold.co/600x600?text=Asset+1', type: 'image', name: 'Spring Hero' },
            { id: '2', url: 'https://placehold.co/1080x1920?text=Asset+2', type: 'image', name: 'Story Ad' },
            { id: '3', url: 'https://placehold.co/1200x628?text=Asset+3', type: 'image', name: 'Display Banner' },
        ];
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
