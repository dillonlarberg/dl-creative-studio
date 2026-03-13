# Proxy Implementation Writeup

## Repo Changes

The `edit-image-api` repo was updated to add a production image proxy endpoint for browser-safe access to Replicate-hosted output images. The new endpoint lives in `api/proxy-image.js` and accepts a `GET` request with a `url` query parameter. It validates the URL, restricts requests to an allowlist of expected image hosts, fetches the upstream image, enforces a 10 MB size limit, and returns the image bytes with CORS headers and cache headers.

During implementation, the proxy was adjusted so CORS headers are applied to all responses, including error cases. That matters because browser clients need `Access-Control-Allow-Origin` even when the proxy rejects a request such as a disallowed domain. The endpoint now correctly responds to both preflight `OPTIONS` requests and normal `GET` requests.

The Vercel deployment was updated by shipping this new serverless function to production, and the alias `https://edit-image-api.vercel.app` now serves the proxy endpoint.

## Validation Performed

The proxy was tested against a rejected domain and correctly returned `403` with CORS headers. It was also tested end-to-end with a real Replicate output URL and correctly returned `200 OK` with `content-type: image/png` and `access-control-allow-origin: *`.

The existing background-removal endpoint in `api/extract-foreground.js` was also used to generate a real `replicate.delivery` image URL for validation. That confirmed the current production deployment is functional and that the proxy works with actual Replicate output.

## Note on Local CORS Fallback

The fallback CORS origin in `api/extract-foreground.js` currently points to `http://localhost:5173`. That is intentional for the current testing phase, since the web app is being hosted locally during development. It should be revisited before relying on that endpoint from a production frontend, but it is consistent with the current local-development setup.
