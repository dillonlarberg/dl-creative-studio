# CORS Image Proxy — Vercel Repo Setup

> Copy this file into your `edit-image-api` Vercel repo for reference, then follow the steps below.

## Step 1: Create the endpoint

Create `api/proxy-image.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_DOMAINS = [
  'creative-insights-images-prod.creative.alliplatform.com',
  'replicate.delivery',
  'pbxt.replicate.delivery',
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
    return res.status(403).json({ error: `Domain not allowed: ${parsedUrl.hostname}` });
  }

  try {
    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` });
    }

    const contentLength = upstream.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      return res.status(413).json({ error: 'Image exceeds 10MB limit' });
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'Image exceeds 10MB limit' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch image' });
  }
}
```

## Step 2: Deploy

```bash
cd <your-edit-image-api-repo>
vercel deploy
```

## Step 3: Test

```bash
# Should return 200 with CORS headers
curl -I "https://edit-image-api.vercel.app/api/proxy-image?url=https://replicate.delivery/test.png"

# Should return 403
curl -I "https://edit-image-api.vercel.app/api/proxy-image?url=https://evil.com/image.png"
```

## Step 4: Commit

```bash
git add api/proxy-image.ts
git commit -m "feat: add CORS image proxy with domain allowlist"
git push
```

## Verify from pmg-creative-studio

Your `.env.local` already has `VITE_EXTRACT_API_URL=https://edit-image-api.vercel.app` so the `proxyUrl()` helper will automatically route through this endpoint once the frontend code is implemented.
