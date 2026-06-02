// functions/src/datasources/alliClient.ts
//
// Server-side Alli access. Rather than re-implement the Alli quirks (CSV
// fallback, error shapes), the scan reuses the SAME proxies the client uses —
// functions/src/alliProxy.ts — server-to-server. smartExecuteQueryProxy in
// particular already does the JSON→CSV fallback that many Alli models require.
// The caller's Alli OIDC bearer token is forwarded as Authorization.
import axios from 'axios';

// Same-project proxy host (also the target the client's vite proxy points at).
const PROXY_BASE = 'https://us-central1-automated-creative-e10d7.cloudfunctions.net';
const HTTP_TIMEOUT = 30_000;

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
}

export async function listModels(clientSlug: string, token: string): Promise<Array<Record<string, unknown>>> {
  const r = await axios.get(
    `${PROXY_BASE}/getDataSourcesProxy?clientSlug=${encodeURIComponent(clientSlug)}`,
    { headers: authHeaders(token), timeout: HTTP_TIMEOUT },
  );
  const d = r.data;
  return (d?.models || d?.results || d?.data || d?.payload || (Array.isArray(d) ? d : [])) as Array<Record<string, unknown>>;
}

export async function getModelMetadata(clientSlug: string, modelName: string, token: string): Promise<Record<string, unknown>> {
  const r = await axios.get(
    `${PROXY_BASE}/getModelMetadataProxy?clientSlug=${encodeURIComponent(clientSlug)}&modelName=${encodeURIComponent(modelName)}`,
    { headers: authHeaders(token), timeout: HTTP_TIMEOUT },
  );
  return (r.data ?? {}) as Record<string, unknown>;
}

/**
 * Execute a Cube query via smartExecuteQueryProxy, which handles the JSON→CSV
 * fallback (many Alli models only return data as CSV; the JSON endpoint
 * 500s/502s). Returns already-parsed row objects.
 */
export async function executeQuery(
  clientSlug: string,
  modelName: string,
  body: { dimensions?: string[]; measures?: string[]; limit?: number },
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const r = await axios.post(
    `${PROXY_BASE}/smartExecuteQueryProxy?clientSlug=${encodeURIComponent(clientSlug)}&modelName=${encodeURIComponent(modelName)}`,
    body,
    { headers: authHeaders(token), timeout: HTTP_TIMEOUT },
  );
  const d = r.data;
  return (d?.results || d?.rows || d?.data || (Array.isArray(d) ? d : [])) as Array<Record<string, unknown>>;
}
