/**
 * In-memory global team-filter store.
 *
 * – A single Set<string> of selected employee IDs shared across ALL pages.
 * – When a user selects employees on one page, every other page sees the
 *   same filter after navigation.
 * – On browser refresh / tab reopen the store resets (empty Set = "All Teams").
 *
 * This mirrors the pattern used in columnVisibility.ts.
 */

// Module-level state — lives as long as the SPA bundle is loaded.
let _selected: Set<string> = new Set();

// Subscribers are notified whenever the selection changes, so React hooks
// can trigger a re-render.
type Listener = () => void;
const _listeners = new Set<Listener>();

/** Read the current global selection (empty = no filter / all teams). */
export function getTeamFilter(): Set<string> {
  return _selected;
}

/** Replace the selection and notify subscribers. */
export function setTeamFilter(next: Set<string>): void {
  _selected = next;
  _listeners.forEach(fn => fn());
}

/** Subscribe to selection changes. Returns an unsubscribe function. */
export function subscribeTeamFilter(listener: Listener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
