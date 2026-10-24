import { useSyncExternalStore, useCallback } from 'react';
import { getTeamFilter, setTeamFilter, subscribeTeamFilter } from './teamFilterStore';

/**
 * React hook that reads/writes the global team-filter store.
 *
 * • Every page that calls this hook shares the **same** Set<string>.
 * • Selecting employees on one page is automatically visible on every
 *   other page after navigation (no prop-drilling needed).
 * • On full browser refresh the store resets → "All Teams".
 */
export function useTeamFilter() {
  const selected = useSyncExternalStore(subscribeTeamFilter, getTeamFilter);

  const onChange = useCallback((next: Set<string>) => {
    setTeamFilter(next);
  }, []);

  return [selected, onChange] as const;
}
