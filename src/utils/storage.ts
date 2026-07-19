import type { MonthlyRoster } from '../types';
import { mockRoster } from '../data/mockData';

const STORAGE_KEY = 'duty-roster-data';

/** Load roster from LocalStorage, seeding from mock data on first visit */
export function loadRoster(): MonthlyRoster {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as MonthlyRoster;
    }
  } catch {
    // corrupt data — fall through to default
  }
  saveRoster(mockRoster);
  return { ...mockRoster };
}

/** Persist roster to LocalStorage */
export function saveRoster(roster: MonthlyRoster): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
}

/** Wipe stored roster and re-seed from mock data */
export function clearRoster(): MonthlyRoster {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = { ...mockRoster, grid: {} };
  saveRoster(fresh);
  return fresh;
}
