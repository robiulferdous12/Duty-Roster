/**
 * In-memory column visibility store.
 *
 * – Default: Designation and Team columns are HIDDEN in grid mode.
 * – When a user explicitly toggles a column, the choice is remembered
 *   for the rest of the session (survives SPA navigation).
 * – On browser refresh / tab reopen the store resets to defaults.
 */

// Each page gets its own namespace so toggling on one page
// doesn't affect another.
type PageKey = 'summary' | 'leave' | 'shortLeave' | 'overtime' | 'dutyRoster';

interface ColState {
  showDesig: boolean;
  showTeam: boolean;
}

const DEFAULTS: ColState = { showDesig: false, showTeam: false };

// Module-level map — lives as long as the SPA bundle is loaded.
const store = new Map<PageKey, ColState>();

/** Read the current visibility for a page (falls back to defaults). */
export function getColumnVisibility(page: PageKey): ColState {
  return store.get(page) ?? { ...DEFAULTS };
}

/** Persist a visibility change for the current session. */
export function setColumnVisibility(
  page: PageKey,
  patch: Partial<ColState>,
): ColState {
  const prev = getColumnVisibility(page);
  const next = { ...prev, ...patch };
  store.set(page, next);
  return next;
}
