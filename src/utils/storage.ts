import type { RosterStore } from '../types';
import { mockRosterStore } from '../data/mockData';
import { supabase } from '../lib/supabaseClient';
import { monthKey } from './monthKey';

// Single-row table — this app has one shared roster document, not per-user data.
const ROW_ID = 1;

/**
 * Older saved rows (pre month-scoped-grid) stored a single flat `grid` object
 * instead of `monthlyGrids`. Migrate those in place so existing data isn't lost.
 */
function migrateLegacyRow(raw: any): RosterStore {
  if (raw && raw.grid && !raw.monthlyGrids) {
    const { grid, ...rest } = raw;
    const key = monthKey(raw.year, raw.month);
    return { ...rest, monthlyGrids: { [key]: grid } } as RosterStore;
  }
  return raw as RosterStore;
}

const LOCAL_STORAGE_KEY = 'duty_roster_store_v1';

/** Load roster from Supabase (or LocalStorage/mock data fallback) */
export async function loadRoster(): Promise<RosterStore> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('roster_state')
        .select('data')
        .eq('id', ROW_ID)
        .maybeSingle();

      if (!error && data?.data) {
        return migrateLegacyRow(data.data);
      }
      if (!error && !data?.data) {
        await saveRoster(mockRosterStore);
        return { ...mockRosterStore };
      }
    } catch (err) {
      console.error('Failed to load roster from Supabase:', err);
    }
  }

  // Fallback to LocalStorage
  try {
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
      return migrateLegacyRow(JSON.parse(localData));
    }
  } catch (err) {
    console.error('Failed to load from LocalStorage:', err);
  }

  return { ...mockRosterStore };
}

/** Persist roster to Supabase and LocalStorage */
export async function saveRoster(store: RosterStore): Promise<void> {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error('Failed to save to LocalStorage:', err);
  }

  if (supabase) {
    const { error } = await supabase
      .from('roster_state')
      .upsert({ id: ROW_ID, data: store });

    if (error) {
      console.error('Failed to save roster to Supabase:', error);
    }
  }
}

/** Wipe stored roster and re-seed from mock data */
export async function clearRoster(): Promise<RosterStore> {
  const fresh = { ...mockRosterStore, monthlyGrids: {} };
  await saveRoster(fresh);
  return fresh;
}

