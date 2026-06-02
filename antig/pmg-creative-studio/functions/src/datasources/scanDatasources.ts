// functions/src/datasources/scanDatasources.ts
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { assertAlliStudioUser } from '../_shared/assertAlliStudioUser';
import { scanClientDatasources, SCAN_VERSION } from './scan';
import { writeRegistry } from './registry';

const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;

export interface ScanDatasourcesInput {
  clientSlug: string;
  alliToken: string; // caller's Alli OIDC bearer; forwarded to dataexplorer
}

export interface ScanDatasourcesResult {
  feedCount: number;
  scanVersion: number;
}

export const scanDatasources = onCall(
  { timeoutSeconds: 540, memory: '512MiB' },
  async (req: CallableRequest<ScanDatasourcesInput>): Promise<ScanDatasourcesResult> => {
    assertAlliStudioUser(req);
    const { clientSlug, alliToken } = req.data ?? ({} as ScanDatasourcesInput);
    if (!clientSlug || !CLIENT_SLUG_RE.test(clientSlug)) {
      throw new HttpsError('invalid-argument', 'Invalid clientSlug');
    }
    if (!alliToken || typeof alliToken !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing Alli token');
    }
    try {
      const records = await scanClientDatasources(clientSlug, alliToken);
      await writeRegistry(clientSlug, records, SCAN_VERSION);
      logger.info('datasource-scan: complete', { clientSlug, feedCount: records.length });
      return { feedCount: records.length, scanVersion: SCAN_VERSION };
    } catch (e) {
      logger.error('datasource-scan: failed', { clientSlug, error: String(e) });
      throw new HttpsError('internal', 'Datasource scan failed');
    }
  },
);
