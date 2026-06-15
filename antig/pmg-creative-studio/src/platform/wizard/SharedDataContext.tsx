import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchDataSources } from '../datasources';
import type { SelectedFeed } from '../datasources';

interface SharedDataContextValue {
  dataSources: SelectedFeed[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const SharedDataContext = createContext<SharedDataContextValue>({
  dataSources: [],
  isLoading: true,
  error: null,
  refresh: () => {},
});

export function SharedDataProvider({ clientSlug, children }: { clientSlug: string; children: ReactNode }) {
  const [dataSources, setDataSources] = useState<SelectedFeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!clientSlug) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void fetchDataSources({ clientSlug }).then(({ feeds, error: err }) => {
      if (cancelled) return;
      setDataSources(feeds);
      if (err) setError(err);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [clientSlug, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  return (
    <SharedDataContext.Provider value={{ dataSources, isLoading, error, refresh }}>
      {children}
    </SharedDataContext.Provider>
  );
}

export function useSharedData(): SharedDataContextValue {
  return useContext(SharedDataContext);
}
