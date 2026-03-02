import * as functions from 'firebase-functions';
import axios from 'axios';
import cors from 'cors';

const corsHandler = cors({
    origin: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'clientid', 'Accept'],
    methods: ['GET', 'POST', 'OPTIONS']
});

function decodeJWT(token: string) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
        return JSON.parse(payload);
    } catch (e) {
        return null;
    }
}

export const getMeProxy = functions.https.onRequest((req, res) => {
    return corsHandler(req, res, async () => {
        res.setHeader('X-Proxy-Version', 'v5-me');

        if (req.method === 'OPTIONS') {
            res.status(204).send();
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).send('No Authorization header');
            return;
        }

        const url = 'https://api.central.alliplatform.com/me';
        const token = authHeader.replace('Bearer ', '');
        const claims = decodeJWT(token);

        try {
            console.log('--- [v5-me] START PROXY REQUEST ---');
            console.log('JWT Claims:', JSON.stringify(claims, null, 2));

            const response = await axios.get(url, {
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json'
                }
            });

            console.log('[v5-me] Success');
            res.status(200).send(response.data);
        } catch (error: any) {
            const errorData = error.response?.data;
            const errorStatus = error.response?.status;

            console.error('--- [v5-me] START PROXY ERROR ---');
            console.error('Status:', errorStatus);
            console.error('Data:', JSON.stringify(errorData));
            console.error('[v5-me] JWT Claims:', JSON.stringify(claims, null, 2));
            console.error('--- [v5-me] END PROXY ERROR ---');

            res.status(errorStatus || 500).send(errorData || 'Internal Server Error');
        }
    });
});

export const getClientsProxy = functions.https.onRequest((req, res) => {
    return corsHandler(req, res, async () => {
        res.setHeader('X-Proxy-Version', 'v5');

        if (req.method === 'OPTIONS') {
            res.status(204).send();
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            console.error('[v5] No Authorization header');
            res.status(401).send('No Authorization header');
            return;
        }

        const url = 'https://api.central.alliplatform.com/clients';
        const clientid = req.headers.clientid as string;

        const headers: any = {
            'Authorization': authHeader,
            'Accept': 'application/json'
        };

        // Only send clientid if it was provided by the frontend
        if (clientid) {
            headers['clientid'] = clientid;
        }

        const token = authHeader.replace('Bearer ', '');
        const claims = decodeJWT(token);

        try {
            console.log('--- [v5] START PROXY REQUEST ---');
            console.log('Method:', req.method);
            console.log('ClientId Header Header:', clientid ? 'Present: ' + clientid : 'MISSING (Intentional)');
            console.log('JWT Claims:', JSON.stringify(claims, null, 2));

            const response = await axios.get(url, { headers });

            console.log('[v5] Success');
            res.status(200).send(response.data);
        } catch (error: any) {
            const errorData = error.response?.data;
            const errorStatus = error.response?.status;

            console.error('--- [v5] START PROXY ERROR ---');
            console.error('Status:', errorStatus);
            console.error('Data:', JSON.stringify(errorData));
            console.error('Headers Sent:', {
                'Accept': 'application/json',
                ... (clientid ? { 'clientid': clientid } : {}),
                'Authorization': authHeader.substring(0, 20) + '...'
            });
            console.error('[v5] JWT Claims:', JSON.stringify(claims, null, 2));
            console.error('--- [v5] END PROXY ERROR ---');

            res.status(errorStatus || 500).send(errorData || 'Internal Server Error');
        }
    });
});
