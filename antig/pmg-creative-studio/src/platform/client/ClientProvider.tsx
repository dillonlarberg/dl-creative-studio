import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { alliService } from '../../services/alli';

export interface Client {
  slug: string;
  name: string;
  id?: string;
}

interface ClientContextValue {
  currentClient: Client | null;
  allowedClients: Client[];
  isLoading: boolean;
  error: string | null;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const [allowedClients, setAllowedClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    alliService
      .getClients()
      .then((list) => {
        if (cancelled) return;
        setAllowedClients(list);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load clients');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let currentClient: Client | null = null;
  if (!isLoading && !error && clientSlug) {
    const found = allowedClients.find((c) => c.slug === clientSlug);
    if (found) {
      currentClient = found;
    } else {
      // URL slug is not in the user's allowed list. Surface as an error;
      // a higher-level router decides whether to redirect to /select-client.
      return (
        <ClientContext.Provider
          value={{
            currentClient: null,
            allowedClients,
            isLoading: false,
            error: `Client '${clientSlug}' is not in your allowed list`,
          }}
        >
          {children}
        </ClientContext.Provider>
      );
    }
  }

  return (
    <ClientContext.Provider value={{ currentClient, allowedClients, isLoading, error }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClientContext(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error('useClientContext must be used inside <ClientProvider>');
  }
  return ctx;
}
