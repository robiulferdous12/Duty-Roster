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

/** Load roster from Supabase, seeding from mock data on first run */
export async function loadRoster(): Promise<RosterStore> {
  const { data, error } = await supabase
    .from('roster_state')
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (error) {
    console.error('Failed to load roster from Supabase:', error);
    return { ...mockRosterStore };
  }

  if (data?.data) {
    return migrateLegacyRow(data.data);
  }

  // No row yet — first run. Seed it.
  await saveRoster(mockRosterStore);
  return { ...mockRosterStore };
}

/** Persist roster to Supabase */
export async function saveRoster(store: RosterStore): Promise<void> {
  const { error } = await supabase
    .from('roster_state')
    .upsert({ id: ROW_ID, data: store });

  if (error) {
    console.error('Failed to save roster to Supabase:', error);
  }
}

/** Wipe stored roster and re-seed from mock data */
export async function clearRoster(): Promise<RosterStore> {
  const fresh = { ...mockRosterStore, monthlyGrids: {} };
  await saveRoster(fresh);
  return fresh;
}
