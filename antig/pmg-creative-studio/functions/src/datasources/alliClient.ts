// functions/src/datasources/alliClient.ts
//
// Server-side Alli Data Explorer calls. URLs mirror functions/src/alliProxy.ts.
// The caller's Alli OIDC bearer token is passed in from the callable payload.
import axios from 'axios';

const BASE = 'https://dataexplorer.alliplatform.com/api/v2/clients';

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
}

export async function listModels(clientSlug: string, token: string): Promise<Array<Record<string, unknown>>> {
  const r = await axios.get(`${BASE}/${clientSlug}/models`, { headers: auth(token) });
  const d = r.data;
  return (d?.models || d?.results || d?.data || d?.payload || (Array.isArray(d) ? d : [])) as Array<Record<string, unknown>>;
}

export async function getModelMetadata(clientSlug: string, modelName: string, token: string): Promise<Record<string, unknown>> {
  const r = await axios.get(`${BASE}/${clientSlug}/models/${modelName}`, { headers: auth(token) });
  return (r.data ?? {}) as Record<string, unknown>;
}

export async function executeQuery(
  clientSlug: string,
  modelName: string,
  body: { dimensions?: string[]; measures?: string[]; limit?: number },
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const r = await axios.post(`${BASE}/${clientSlug}/models/${modelName}/execute-query`, body, { headers: auth(token) });
  const d = r.data;
  return (d?.results || d?.rows || d?.data || (Array.isArray(d) ? d : [])) as Array<Record<string, unknown>>;
}
