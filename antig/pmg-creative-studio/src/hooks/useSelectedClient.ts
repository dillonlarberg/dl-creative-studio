import { useSyncExternalStore } from 'react';
import type { Client } from '../platform/client/ClientProvider';

const STORAGE_KEY = 'selectedClient';
const EVENT_NAME = 'selectedClient:changed';

/**
 * Reactive read of the user's currently-selected client from localStorage.
 *
 * For routes that AREN'T wrapped in <ClientProvider> (notably the legacy
 * /create/:useCaseId wizard, which has no :clientSlug URL segment), the
 * canonical useCurrentClient() hook can't be used — there's no URL slug to
 * derive from. This hook reads from localStorage and re-renders when:
 *   - another tab updates the value (native 'storage' event), or
 *   - this tab dispatches the 'selectedClient:changed' custom event after
 *     a same-tab write (AppLayout.handleSelectClient does this).
 *
 * Returns null when no client is selected.
 */
export function useSelectedClient(): Client | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Notify same-tab subscribers after writing localStorage.selectedClient. */
export function notifySelectedClientChanged(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

function subscribe(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT_NAME, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT_NAME, callback);
  };
}

// Cache the parsed snapshot so useSyncExternalStore's referential-equality
// check doesn't fire spurious re-renders on every getSnapshot call.
let cachedRaw: string | null = null;
let cachedParsed: Client | null = null;

function getSnapshot(): Client | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedParsed;
  cachedRaw = raw;
  if (!raw) {
    cachedParsed = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Client;
    cachedParsed = parsed && parsed.slug ? parsed : null;
  } catch {
    cachedParsed = null;
  }
  return cachedParsed;
}

function getServerSnapshot(): Client | null {
  return null;
}
