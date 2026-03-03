"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreativeAssetsProxy = exports.getClientsProxy = exports.getMeProxy = void 0;
const functions = __importStar(require("firebase-functions"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const corsHandler = (0, cors_1.default)({
    origin: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'clientid', 'Accept'],
    methods: ['GET', 'POST', 'OPTIONS']
});
function decodeJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
        return JSON.parse(payload);
    }
    catch (e) {
        return null;
    }
}
exports.getMeProxy = functions.https.onRequest((req, res) => {
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
            const response = await axios_1.default.get(url, {
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json'
                }
            });
            console.log('[v5-me] Success');
            res.status(200).send(response.data);
        }
        catch (error) {
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
exports.getClientsProxy = functions.https.onRequest((req, res) => {
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
        const clientid = req.headers.clientid;
        const headers = {
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
            const response = await axios_1.default.get(url, { headers });
            console.log('[v5] Success');
            res.status(200).send(response.data);
        }
        catch (error) {
            const errorData = error.response?.data;
            const errorStatus = error.response?.status;
            console.error('--- [v5] START PROXY ERROR ---');
            console.error('Status:', errorStatus);
            console.error('Data:', JSON.stringify(errorData));
            console.error('Headers Sent:', {
                'Accept': 'application/json',
                ...(clientid ? { 'clientid': clientid } : {}),
                'Authorization': authHeader.substring(0, 20) + '...'
            });
            console.error('[v5] JWT Claims:', JSON.stringify(claims, null, 2));
            console.error('--- [v5] END PROXY ERROR ---');
            res.status(errorStatus || 500).send(errorData || 'Internal Server Error');
        }
    });
});
exports.getCreativeAssetsProxy = functions.https.onRequest((req, res) => {
    return corsHandler(req, res, async () => {
        res.setHeader('X-Proxy-Version', 'v5-uda');
        if (req.method === 'OPTIONS') {
            res.status(204).send();
            return;
        }
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).send('No Authorization header');
            return;
        }
        const clientSlug = req.query.clientSlug;
        if (!clientSlug) {
            res.status(400).send('Missing clientSlug query parameter');
            return;
        }
        const modelName = 'creative_insights_data_export';
        const queryUrl = `https://dataexplorer.alliplatform.com/api/v2/clients/${clientSlug}/models/${modelName}/execute-query`;
        // The exact sets of columns to try, in order of preference
        const dimensionAttempts = [
            ["ci_ad_id", "url", "creative_type", "platform"],
            ["ad_id", "url", "creative_type", "platform"],
            ["ci_ad_id", "url", "creative_type"],
            ["ad_id", "url", "creative_type"]
        ];
        // Measures often help UDA resolve the correct aggregation table
        const measureAttempts = [
            ["impressions"],
            []
        ];
        try {
            console.log(`--- [UDA v2.1] SMART QUERY START for ${clientSlug} ---`);
            let finalResponseData = null;
            let successDims = [];
            // Attempt Loop: Try different combinations in JSON format first
            for (const dims of dimensionAttempts) {
                for (const meas of measureAttempts) {
                    try {
                        console.log(`[UDA v2.1] Trying dims: ${dims.join(',')} | meas: ${meas.join(',')}`);
                        const response = await axios_1.default.post(queryUrl, {
                            dimensions: dims,
                            measures: meas,
                            limit: 500
                        }, {
                            headers: { 'Authorization': authHeader, 'Accept': 'application/json', 'Content-Type': 'application/json' }
                        });
                        if (response.data.results && response.data.results.length > 0) {
                            finalResponseData = response.data;
                            successDims = dims;
                            break;
                        }
                    }
                    catch (e) {
                        continue;
                    }
                }
                if (finalResponseData)
                    break;
            }
            // Fallback 2: CSV Format (Mirroring Python script which uses Accept: text/csv)
            if (!finalResponseData) {
                console.log(`[UDA v2.1] JSON yielded 0 items. Trying CSV fallback...`);
                try {
                    const csvResp = await axios_1.default.post(queryUrl, {
                        dimensions: ["ad_id", "ci_ad_id", "url", "creative_type", "platform"],
                        limit: 500
                    }, {
                        headers: { 'Authorization': authHeader, 'Accept': 'text/csv', 'Content-Type': 'application/json' }
                    });
                    if (csvResp.status === 200 && csvResp.data) {
                        console.log(`[UDA v2.1] CSV Success - Parsing...`);
                        const lines = csvResp.data.split('\n');
                        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                        const results = lines.slice(1).filter(l => l.trim()).map(line => {
                            const values = line.split(',');
                            const obj = {};
                            headers.forEach((h, i) => {
                                obj[h] = values[i]?.trim().replace(/^"|"$/g, '');
                            });
                            obj.__source = 'csv';
                            return obj;
                        });
                        if (results.length > 0) {
                            finalResponseData = { results };
                            successDims = ["ad_id", "ci_ad_id", "url", "creative_type", "platform"];
                        }
                    }
                }
                catch (csvError) {
                    console.log(`[UDA v2.1] CSV Fallback failed: ${csvError.message}`);
                }
            }
            // Fallback 3: Model Discovery (If we still have nothing)
            if (!finalResponseData || finalResponseData.results?.length === 0) {
                console.log(`[UDA v2.1] Total failure for ${modelName}. Discovery mode...`);
                const modelsUrl = `https://dataexplorer.alliplatform.com/api/v2/clients/${clientSlug}/models`;
                const mResp = await axios_1.default.get(modelsUrl, { headers: { 'Authorization': authHeader } });
                const models = Array.isArray(mResp.data) ? mResp.data : (mResp.data.results || []);
                console.log(`[UDA v2.1] Available Models (first 10):`, JSON.stringify(models.map((m) => m.name).slice(0, 10)));
                const alt = models.find((m) => m.name.includes('creative_insights') && m.name !== modelName);
                if (alt) {
                    console.log(`[UDA v2.1] Trying alternative model: ${alt.name}`);
                    const r = await axios_1.default.post(`https://dataexplorer.alliplatform.com/api/v2/clients/${clientSlug}/models/${alt.name}/execute-query`, { dimensions: ["ad_id", "url"], limit: 10 }, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
                    if (r.data.results?.length > 0)
                        finalResponseData = r.data;
                }
            }
            if (!finalResponseData)
                finalResponseData = { results: [] };
            console.log(`[UDA v2.1] Final Count: ${finalResponseData.results?.length || 0} using dims: ${successDims.join(', ')}`);
            res.status(200).send(finalResponseData);
        }
        catch (error) {
            const errorData = error.response?.data;
            const errorStatus = error.response?.status;
            console.error('--- [UDA v2.1] FINAL PROXY ERROR ---');
            console.error('Status:', errorStatus);
            console.error('Message:', error.message);
            if (errorData)
                console.error('Data:', JSON.stringify(errorData));
            console.error('Target URL:', queryUrl);
            console.error('--- [UDA v2.1] END PROXY ERROR ---');
            res.status(errorStatus || 500).send(errorData || { message: error.message });
        }
    });
});
//# sourceMappingURL=alliProxy.js.map