// src/platform/datasources/scan.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { authService } from '../../services/auth';

/**
 * Must equal SCAN_VERSION in functions/src/datasources/scan.ts. When that
 * bumps, existing clients re-scan because marker.scanVersion < EXPECTED.
 */
export const EXPECTED_SCAN_VERSION = 3;

interface ScanResult {
  feedCount: number;
  scanVersion: number;
}

const callScan = httpsCallable<{ clientSlug: string; alliToken: string }, ScanResult>(
  functions,
  'scanDatasources',
  { timeout: 540000 },
);

// Dedupe concurrent scans for the same client. React StrictMode double-mounts
// the picker in dev, and the picker re-mounts on every visit until the marker
// is written — without this, each mount spawns a parallel scan that hammers
// the (flaky, 500-prone) Alli endpoints.
const _inFlight = new Map<string, Promise<ScanResult>>();

/** Trigger a server-side scan for this client. Requires a live Alli session. */
export async function scanDatasources(clientSlug: string): Promise<ScanResult> {
  const existing = _inFlight.get(clientSlug);
  if (existing) return existing;
  const p = (async () => {
    const alliToken = await authService.getAccessToken();
    if (!alliToken) throw new Error('No Alli session — cannot scan datasources.');
    const r = await callScan({ clientSlug, alliToken });
    return r.data;
  })();
  _inFlight.set(clientSlug, p);
  try {
    return await p;
  } finally {
    _inFlight.delete(clientSlug);
  }
}
