import type { MonthlyRoster } from '../types';
import { mockRoster } from '../data/mockData';
import { supabase } from '../lib/supabaseClient';

// Single-row table — this app has one shared roster document, not per-user data.
const ROW_ID = 1;

/** Load roster from Supabase, seeding from mock data on first run */
export async function loadRoster(): Promise<MonthlyRoster> {
  const { data, error } = await supabase
    .from('roster_state')
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (error) {
    console.error('Failed to load roster from Supabase:', error);
    return { ...mockRoster };
  }

  if (data?.data) {
    return data.data as MonthlyRoster;
  }

  // No row yet — first run. Seed it.
  await saveRoster(mockRoster);
  return { ...mockRoster };
}

/** Persist roster to Supabase */
export async function saveRoster(roster: MonthlyRoster): Promise<void> {
  const { error } = await supabase
    .from('roster_state')
    .upsert({ id: ROW_ID, data: roster });

  if (error) {
    console.error('Failed to save roster to Supabase:', error);
  }
}

/** Wipe stored roster and re-seed from mock data */
export async function clearRoster(): Promise<MonthlyRoster> {
  const fresh = { ...mockRoster, grid: {} };
  await saveRoster(fresh);
  return fresh;
}
