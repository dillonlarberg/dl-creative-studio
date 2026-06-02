// src/platform/datasources/scan.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { authService } from '../../services/auth';

/**
 * Must equal SCAN_VERSION in functions/src/datasources/scan.ts. When that
 * bumps, existing clients re-scan because marker.scanVersion < EXPECTED.
 */
export const EXPECTED_SCAN_VERSION = 1;

interface ScanResult {
  feedCount: number;
  scanVersion: number;
}

const callScan = httpsCallable<{ clientSlug: string; alliToken: string }, ScanResult>(
  functions,
  'scanDatasources',
  { timeout: 540000 },
);

/** Trigger a server-side scan for this client. Requires a live Alli session. */
export async function scanDatasources(clientSlug: string): Promise<ScanResult> {
  const alliToken = await authService.getAccessToken();
  if (!alliToken) throw new Error('No Alli session — cannot scan datasources.');
  const r = await callScan({ clientSlug, alliToken });
  return r.data;
}
