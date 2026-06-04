import { useEffect } from 'react';

const PLATFORM = 'Ad Labs';

export function usePageTitle(appName?: string) {
  useEffect(() => {
    document.title = appName ? `${appName} — ${PLATFORM}` : PLATFORM;
    return () => { document.title = PLATFORM; };
  }, [appName]);
}
