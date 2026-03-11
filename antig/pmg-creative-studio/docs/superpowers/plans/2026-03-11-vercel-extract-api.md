# Vercel Extract Foreground API — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a lightweight Vercel serverless function that proxies Replicate's background removal API, returning a transparent PNG URL.

**Architecture:** Single serverless function receives an image URL from the Alli Studio frontend, calls Replicate's `remove-bg` model, and returns the result URL. CORS configured for the studio origin. No database needed.

**Tech Stack:** Vercel serverless functions, Replicate JS client, Node.js

**Spec:** `docs/superpowers/specs/2026-03-11-edit-image-architecture-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `edit-image-api/package.json` | Create | Project manifest, dependencies |
| `edit-image-api/api/extract-foreground.js` | Create | Serverless function: receive imageUrl, call Replicate, return result |
| `edit-image-api/vercel.json` | Create | Vercel config, CORS headers, env reference |
| `edit-image-api/.gitignore` | Create | node_modules, .vercel |
| `edit-image-api/README.md` | Create | Setup and deployment instructions |

**Note:** This is a separate project/repo from `pmg-creative-studio`. Create it as a sibling directory or in its own repo.

---

## Chunk 1: Project Setup + Serverless Function

### Task 1: Initialize the Vercel project

**Files:**
- Create: `edit-image-api/package.json`
- Create: `edit-image-api/.gitignore`

- [ ] **Step 1: Create project directory and initialize**

```bash
mkdir -p ~/Documents/dl-creative-studio/edit-image-api
cd ~/Documents/dl-creative-studio/edit-image-api
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install replicate
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.vercel/
.env
```

- [ ] **Step 4: Update package.json type to module**

Add `"type": "module"` to `package.json` so Vercel uses ES module syntax.

- [ ] **Step 5: Commit**

```bash
git init
git add package.json package-lock.json .gitignore
git commit -m "chore: initialize vercel project with replicate dependency"
```

---

### Task 2: Create the serverless function

**Files:**
- Create: `edit-image-api/api/extract-foreground.js`

- [ ] **Step 1: Create the API route**

```javascript
import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// CORS origins — update with your actual frontend URLs
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://automated-creative-e10d7.web.app",
  "https://automated-creative-e10d7.firebaseapp.com",
];

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const cors = getCorsHeaders(origin);

  // Set CORS headers on every response
  Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageUrl } = req.body;
  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({ error: "imageUrl (string) is required" });
  }

  try {
    const output = await replicate.run(
      "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900b7e49c68f34dc200b9631c5e9826e07c006108",
      { input: { image: imageUrl } }
    );

    // output is a URL string pointing to the transparent PNG
    const url = typeof output === "string" ? output : String(output);

    return res.status(200).json({ url });
  } catch (err) {
    console.error("Replicate error:", err);
    return res.status(502).json({
      error: "Background removal failed",
      detail: err.message || String(err),
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p api
git add api/extract-foreground.js
git commit -m "feat: add extract-foreground serverless function with Replicate"
```

---

### Task 3: Vercel configuration

**Files:**
- Create: `edit-image-api/vercel.json`

- [ ] **Step 1: Create vercel.json**

```json
{
  "version": 2,
  "functions": {
    "api/extract-foreground.js": {
      "maxDuration": 30
    }
  }
}
```

Note: `maxDuration: 30` gives Replicate enough time to process. Free tier allows up to 60s.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add vercel config with 30s function timeout"
```

---

### Task 4: Deploy to Vercel

- [ ] **Step 1: Install Vercel CLI (if not already installed)**

```bash
npm i -g vercel
```

- [ ] **Step 2: Login to Vercel**

```bash
vercel login
```

- [ ] **Step 3: Add the Replicate API token as an environment variable**

```bash
vercel env add REPLICATE_API_TOKEN
```

When prompted: paste your Replicate API key, select all environments (Production, Preview, Development).

- [ ] **Step 4: Deploy**

```bash
vercel deploy
```

Note the deployment URL (e.g., `https://edit-image-api-xxx.vercel.app`).

- [ ] **Step 5: Test the endpoint**

```bash
curl -X POST https://YOUR_DEPLOYMENT_URL/api/extract-foreground \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png"}'
```

Expected: `{ "url": "https://replicate.delivery/..." }` — a URL to the transparent PNG.

- [ ] **Step 6: Commit README with deployment URL**

Create `README.md`:

```markdown
# Edit Image API

Lightweight Vercel serverless function for background removal via Replicate.

## Endpoint

`POST /api/extract-foreground`

**Body:** `{ "imageUrl": "https://..." }`
**Response:** `{ "url": "https://..." }` — transparent PNG

## Setup

1. `npm install`
2. `vercel env add REPLICATE_API_TOKEN`
3. `vercel deploy`

## Environment Variables

- `REPLICATE_API_TOKEN` — your Replicate API key
```

```bash
git add README.md
git commit -m "docs: add README with endpoint documentation"
```
