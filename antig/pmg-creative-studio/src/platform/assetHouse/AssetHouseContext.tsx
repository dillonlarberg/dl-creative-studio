import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clientAssetHouseService, type ClientAssetHouse } from '../../services/clientAssetHouse';

interface AssetHouseContextValue {
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  error: string | null;
}

const AssetHouseContext = createContext<AssetHouseContextValue>({
  assetHouse: null,
  isLoading: true,
  error: null,
});

export function AssetHouseProvider({ clientSlug, children }: { clientSlug: string; children: ReactNode }) {
  const [assetHouse, setAssetHouse] = useState<ClientAssetHouse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientSlug) return;
    let cancelled = false;
    setIsLoading(true);
    clientAssetHouseService
      .getAssetHouse(clientSlug)
      .then((house) => { if (!cancelled) { setAssetHouse(house); setIsLoading(false); } })
      .catch((err: unknown) => { if (!cancelled) { setError(String(err)); setIsLoading(false); } });
    return () => { cancelled = true; };
  }, [clientSlug]);

  return <AssetHouseContext.Provider value={{ assetHouse, isLoading, error }}>{children}</AssetHouseContext.Provider>;
}

export function useAssetHouse(): AssetHouseContextValue {
  return useContext(AssetHouseContext);
}
