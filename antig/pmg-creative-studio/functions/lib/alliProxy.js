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
exports.getClientsProxy = exports.getMeProxy = void 0;
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
//# sourceMappingURL=alliProxy.js.map