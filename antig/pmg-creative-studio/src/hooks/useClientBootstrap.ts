import { useEffect, useState } from 'react';
import { clientAssetHouseService } from '../services/clientAssetHouse';
import { alliService } from '../services/alli';
import type { Client } from '../types';

/**
 * Step 0.5 of AdLabs v1 plan.
 *
 * Single source of truth for the dashboard's client-bootstrap concerns:
 *   1. Resolve the active client (URL slug wins, falls back to localStorage).
 *   2. Fetch the client's asset house from the LEGACY top-level
 *      `clientAssetHouse/{slug}` collection — NOT the path-scoped tree.
 *   3. Fire the Alli `getCreativeAssets` cache warm so the singleton's
 *      assetCache is hot when downstream wizards mount.
 *
 * Replaces the load-bearing useEffect at CreatePage.tsx:39-54 and the
 * double-localStorage-read at CreatePage.tsx:37 + :148. DashboardPage uses
 * the returned `client` as a single stable binding for everything below.
 *
 * Failure modes are decoupled: an asset-house read failure does NOT block
 * the cache-warm call, and neither failure crashes the hook. `error` is
 * surfaced for the dashboard to render an "Couldn't load brand standards"
 * affordance.
 */

export interface ClientBootstrapState {
  client: Client | null;
  isReady: boolean;
  loading: boolean;
  error: Error | null;
}

interface UseClientBootstrapOptions {
  /** When provided, takes precedence over localStorage. */
  urlSlug?: string | null;
}

const INITIAL_STATE: ClientBootstrapState = {
  client: null,
  isReady: false,
  loading: true,
  error: null,
};

function readSelectedClient(): Client | null {
  try {
    const raw = localStorage.getItem('selectedClient');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.slug === 'string') {
      return parsed as Client;
    }
    return null;
  } catch {
    return null;
  }
}

export function useClientBootstrap(
  options: UseClientBootstrapOptions = {}
): ClientBootstrapState {
  const { urlSlug } = options;
  const [state, setState] = useState<ClientBootstrapState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    const resolved: Client | null = (() => {
      if (urlSlug) {
        const stored = readSelectedClient();
        if (stored?.slug === urlSlug) return stored;
        return { slug: urlSlug, name: urlSlug };
      }
      return readSelectedClient();
    })();

    if (!resolved) {
      setState({ client: null, isReady: false, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, client: resolved, loading: true }));

    // Cache warm fires regardless of asset-house outcome — different failure
    // modes, neither blocks the other.
    void alliService
      .getCreativeAssets(resolved.slug)
      .catch((err) => {
        // Match CreatePage's fire-and-forget posture: log and move on.
        console.warn('[useClientBootstrap] Alli cache warm failed:', err);
      });

    clientAssetHouseService
      .getAssetHouse(resolved.slug)
      .then((house) => {
        if (cancelled) return;
        setState({
          client: resolved,
          isReady: clientAssetHouseService.checkBrandStandards(house),
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({
          client: resolved,
          isReady: false,
          loading: false,
          error,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [urlSlug]);

  return state;
}
