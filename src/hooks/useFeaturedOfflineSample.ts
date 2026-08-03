import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { listFeaturedPlans } from '../api/plans';
import { useIsOnline } from '../lib/offline';
import { FEATURED_OFFLINE_SAMPLE_KEY } from '../lib/queryPersistence';

const SAMPLE_SIZE = 12;

// Keeps a small, bounded slice of featured plans available offline —
// refreshed opportunistically whenever the app is foregrounded with a
// connection — so someone with no plans of their own yet still has
// something to browse. Mount once near the app root, after login.
export function useFeaturedOfflineSampleSync() {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  useEffect(() => {
    const refresh = () => {
      if (!isOnlineRef.current) return;
      queryClient.fetchQuery({
        queryKey: FEATURED_OFFLINE_SAMPLE_KEY,
        queryFn: async () => {
          const page = await listFeaturedPlans(1);
          return page.data.slice(0, SAMPLE_SIZE);
        },
      });
    };

    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [queryClient]);
}
