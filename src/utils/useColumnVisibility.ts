import { useState, useCallback } from 'react';
import { getColumnVisibility, setColumnVisibility } from './columnVisibility';

type PageKey = 'summary' | 'leave' | 'shortLeave' | 'overtime';

/**
 * React hook that reads/writes the in-memory column visibility store.
 *
 * • Initialises from the store (defaults hidden on first load).
 * • Every toggle writes back to the store so the choice survives
 *   navigation to other pages and back.
 * • On full refresh the store resets → columns start hidden again.
 */
export function useColumnVisibility(page: PageKey) {
  const initial = getColumnVisibility(page);
  const [showDesig, _setShowDesig] = useState(initial.showDesig);
  const [showTeam, _setShowTeam] = useState(initial.showTeam);

  const setShowDesig = useCallback(
    (v: boolean) => {
      setColumnVisibility(page, { showDesig: v });
      _setShowDesig(v);
    },
    [page],
  );

  const setShowTeam = useCallback(
    (v: boolean) => {
      setColumnVisibility(page, { showTeam: v });
      _setShowTeam(v);
    },
    [page],
  );

  return { showDesig, setShowDesig, showTeam, setShowTeam } as const;
}
