import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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

  const load = async () => {
    setIsLoading(true);
    setError(null);
    const { feeds, error: err } = await fetchDataSources({ clientSlug });
    setDataSources(feeds);
    if (err) setError(err);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!clientSlug) return;
    void load();
  }, [clientSlug]);

  return (
    <SharedDataContext.Provider value={{ dataSources, isLoading, error, refresh: () => void load() }}>
      {children}
    </SharedDataContext.Provider>
  );
}

export function useSharedData(): SharedDataContextValue {
  return useContext(SharedDataContext);
}
