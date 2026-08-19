import type {
  RosterStore,
  Employee,
  DayEntry,
  PublicHoliday,
  CepEntry,
  OvertimeEntry,
  ShortLeaveEntry,
  DbEmployee,
  DbPublicHoliday,
  DbCepEntry,
  DbOvertimeEntry,
  DbShortLeaveEntry,
  DbRosterEntry,
  DbAppSettings,
  DutyCode,
  LeaveCode,
} from '../types';
import { mockRosterStore } from '../data/mockData';
import { supabase } from '../lib/supabaseClient';
import { monthKey } from './monthKey';

const LOCAL_STORAGE_KEY = 'duty_roster_store_v2';
const LEGACY_STORAGE_KEY = 'duty_roster_store_v1';

// Helper to format date string YYYY-MM-DD
export function formatEntryDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Helper to parse date string YYYY-MM-DD into { year, month (0-indexed), day (1-indexed) }
export function parseEntryDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return {
    year: y,
    month: m - 1,
    day: d,
  };
}

/** ── Mapping helpers ── */

function mapDbEmployeeToEmployee(db: DbEmployee): Employee {
  return {
    id: db.id,
    name: db.name,
    designation: db.designation,
    team: db.team || undefined,
    phone: db.phone || undefined,
  };
}

function mapEmployeeToDb(emp: Employee, index: number): DbEmployee {
  return {
    id: emp.id,
    name: emp.name,
    designation: emp.designation,
    team: emp.team || null,
    phone: emp.phone || null,
    display_order: index + 1,
  };
}

function mapDbHolidayToPublicHoliday(db: DbPublicHoliday): PublicHoliday {
  return {
    id: db.id,
    title: db.title,
    startDate: db.start_date,
    endDate: db.end_date,
  };
}

function mapPublicHolidayToDb(h: PublicHoliday): DbPublicHoliday {
  return {
    id: h.id,
    title: h.title,
    start_date: h.startDate,
    end_date: h.endDate,
  };
}

function mapDbCepToCepEntry(db: DbCepEntry): CepEntry {
  return {
    id: db.id,
    name: db.name,
    number: db.number,
  };
}

function mapCepEntryToDb(c: CepEntry): DbCepEntry {
  return {
    id: c.id,
    name: c.name,
    number: c.number,
  };
}

function mapDbOvertimeToOvertimeEntry(db: DbOvertimeEntry): OvertimeEntry {
  return {
    id: db.id,
    employeeId: db.employee_id || '',
    date: db.date,
    from: db.from_time,
    to: db.to_time,
    totalHours: Number(db.total_hours) || 0,
    cepId: db.cep_id || undefined,
    cepName: db.cep_name || undefined,
    cepNumber: db.cep_number || undefined,
    lunchBreak: db.lunch_break ?? false,
  };
}

function mapOvertimeEntryToDb(ot: OvertimeEntry): DbOvertimeEntry {
  return {
    id: ot.id,
    employee_id: ot.employeeId || null,
    date: ot.date,
    from_time: ot.from,
    to_time: ot.to,
    total_hours: ot.totalHours,
    cep_id: ot.cepId || null,
    cep_name: ot.cepName || null,
    cep_number: ot.cepNumber || null,
    lunch_break: ot.lunchBreak ?? false,
  };
}

function mapDbShortLeaveToShortLeaveEntry(db: DbShortLeaveEntry): ShortLeaveEntry {
  return {
    id: db.id,
    employeeId: db.employee_id,
    date: db.date,
    from: db.from_time,
    to: db.to_time,
    totalHours: Number(db.total_hours) || 0,
  };
}

function mapShortLeaveEntryToDb(sl: ShortLeaveEntry): DbShortLeaveEntry {
  return {
    id: sl.id,
    employee_id: sl.employeeId,
    date: sl.date,
    from_time: sl.from,
    to_time: sl.to,
    total_hours: sl.totalHours,
  };
}

/** ── Paginated fetch helper ──
 * Supabase returns at most 1 000 rows per request by default.
 * This helper pages through the full result set in chunks of `pageSize`.
 */
async function fetchAllRows<T>(
  table: string,
  orderCol?: string,
  ascending = true,
  pageSize = 1000,
): Promise<T[]> {
  if (!supabase) return [];
  const all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (orderCol) q = q.order(orderCol, { ascending });
    const { data, error } = await q;
    if (error) { console.error(`fetchAllRows(${table}) error:`, error); break; }
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;   // last page
    from += pageSize;
  }
  return all;
}

/** ── Load complete roster store from Supabase or LocalStorage ── */

export async function loadRoster(): Promise<RosterStore> {
  if (supabase) {
    try {
      // Query all normalized relational tables concurrently.
      // roster_entries & overtime_entries may exceed Supabase's default 1 000-row
      // limit, so they use the paginated helper.
      const [
        settingsRes,
        employeesRes,
        holidaysRes,
        cepRes,
        allRosterEntries,
        allOvertimeEntries,
        shortLeaveRes,
      ] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('employees').select('*').order('display_order', { ascending: true }),
        supabase.from('public_holidays').select('*').order('start_date', { ascending: true }),
        supabase.from('cep_directory').select('*').order('name', { ascending: true }),
        fetchAllRows<DbRosterEntry>('roster_entries'),
        fetchAllRows<DbOvertimeEntry>('overtime_entries', 'date', false),
        supabase.from('short_leave_entries').select('*').order('date', { ascending: false }),
      ]);

      const hasEmployees = employeesRes.data && employeesRes.data.length > 0;

      if (hasEmployees) {
        const settings: DbAppSettings = settingsRes.data || { id: 1, year: 2026, month: 6 };
        const employees: Employee[] = (employeesRes.data as DbEmployee[]).map(mapDbEmployeeToEmployee);
        const publicHolidays: PublicHoliday[] = (holidaysRes.data as DbPublicHoliday[] || []).map(mapDbHolidayToPublicHoliday);
        const cepDirectory: CepEntry[] = (cepRes.data as DbCepEntry[] || []).map(mapDbCepToCepEntry);
        const overtime: OvertimeEntry[] = allOvertimeEntries.map(mapDbOvertimeToOvertimeEntry);
        const shortLeaveEntries: ShortLeaveEntry[] = (shortLeaveRes.data as DbShortLeaveEntry[] || []).map(mapDbShortLeaveToShortLeaveEntry);

        // Reconstruct monthlyGrids: monthKey -> employeeId -> DayEntry[]
        const monthlyGrids: Record<string, Record<string, DayEntry[]>> = {};

        const rosterEntries = allRosterEntries;
        for (const row of rosterEntries) {
          if (!row.date || !row.employee_id) continue;
          const { year, month, day } = parseEntryDate(row.date);
          const mKey = monthKey(year, month);
          const dayIndex = day - 1;

          if (!monthlyGrids[mKey]) {
            monthlyGrids[mKey] = {};
          }
          if (!monthlyGrids[mKey][row.employee_id]) {
            monthlyGrids[mKey][row.employee_id] = [];
          }

          monthlyGrids[mKey][row.employee_id][dayIndex] = {
            duty: (row.duty as DutyCode) || undefined,
            leave: (row.leave as LeaveCode) || undefined,
            shortLeave: row.short_leave !== null ? Number(row.short_leave) : undefined,
          };
        }

        const store: RosterStore = {
          year: settings.year ?? 2026,
          month: settings.month ?? 6,
          employees,
          monthlyGrids,
          publicHolidays,
          cepDirectory,
          overtime,
          shortLeaveEntries,
        };

        // Cache locally
        saveToLocalStorage(store);
        return store;
      }

      // If database is empty, seed it with mock initial data
      if (employeesRes.data && employeesRes.data.length === 0) {
        await seedDatabaseWithMockData();
        return { ...mockRosterStore };
      }
    } catch (err) {
      console.error('Failed to load roster from Supabase relational tables:', err);
    }
  }

  // Fallback to LocalStorage
  try {
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData);
      if (parsed.grid && !parsed.monthlyGrids) {
        const { grid, ...rest } = parsed;
        const key = monthKey(parsed.year, parsed.month);
        return { ...rest, monthlyGrids: { [key]: grid } } as RosterStore;
      }
      return parsed as RosterStore;
    }
  } catch (err) {
    console.error('Failed to load from LocalStorage:', err);
  }

  return { ...mockRosterStore };
}

/** ── Local Storage Cache Helper ── */

export function saveToLocalStorage(store: RosterStore): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error('Failed to save to LocalStorage:', err);
  }
}

/** ── Seed Relational Tables with initial Mock Data ── */

export async function seedDatabaseWithMockData(): Promise<void> {
  if (!supabase) return;

  try {
    // 1. Settings
    await supabase.from('app_settings').upsert({
      id: 1,
      year: mockRosterStore.year,
      month: mockRosterStore.month,
    });

    // 2. Employees
    const dbEmployees = mockRosterStore.employees.map(mapEmployeeToDb);
    if (dbEmployees.length > 0) {
      await supabase.from('employees').upsert(dbEmployees, { onConflict: 'id' });
    }
  } catch (err) {
    console.error('Failed to seed Supabase database:', err);
  }
}

/** ── Granular Database Mutation Functions ── */

export async function saveAppSettings(year: number, month: number): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('app_settings').upsert({
      id: 1,
      year,
      month,
    });
  } catch (err) {
    console.error('Failed to save app_settings:', err);
  }
}

export async function saveRosterCellDb(
  employeeId: string,
  dateStr: string,
  updates: Partial<DayEntry>
): Promise<void> {
  if (!supabase) return;
  try {
    const payload: Partial<DbRosterEntry> = {
      employee_id: employeeId,
      date: dateStr,
    };

    if (updates.duty !== undefined) {
      payload.duty = updates.duty || null;
    }
    if (updates.leave !== undefined) {
      payload.leave = updates.leave || null;
    }
    if (updates.shortLeave !== undefined) {
      payload.short_leave = updates.shortLeave || null;
    }

    await supabase.from('roster_entries').upsert(payload, { onConflict: 'employee_id, date' });
  } catch (err) {
    console.error('Failed to save roster cell:', err);
  }
}

export async function resetRosterFieldDb(
  year: number,
  month: number,
  field: 'duty' | 'leave' | 'shortLeave'
): Promise<void> {
  if (!supabase) return;
  try {
    const startDate = formatEntryDate(year, month, 1);
    const endDate = formatEntryDate(year, month, 31);

    const updatePayload: Record<string, any> = {};
    if (field === 'duty') updatePayload.duty = null;
    if (field === 'leave') updatePayload.leave = null;
    if (field === 'shortLeave') updatePayload.short_leave = null;

    await supabase
      .from('roster_entries')
      .update(updatePayload)
      .gte('date', startDate)
      .lte('date', endDate);
  } catch (err) {
    console.error(`Failed to reset field ${field} in DB:`, err);
  }
}

export async function syncEmployeesDb(employees: Employee[]): Promise<void> {
  if (!supabase) return;
  try {
    const dbEmps = employees.map(mapEmployeeToDb);
    if (dbEmps.length > 0) {
      await supabase.from('employees').upsert(dbEmps, { onConflict: 'id' });
    }

    // Remove deleted employees from DB
    const currentIds = employees.map((e) => e.id);
    const { data: existing } = await supabase.from('employees').select('id');
    if (existing) {
      const toDelete = existing.filter((row) => !currentIds.includes(row.id)).map((row) => row.id);
      if (toDelete.length > 0) {
        await supabase.from('employees').delete().in('id', toDelete);
      }
    }
  } catch (err) {
    console.error('Failed to sync employees:', err);
  }
}

export async function syncPublicHolidaysDb(holidays: PublicHoliday[]): Promise<void> {
  if (!supabase) return;
  try {
    const dbHolidays = holidays.map(mapPublicHolidayToDb);
    if (dbHolidays.length > 0) {
      await supabase.from('public_holidays').upsert(dbHolidays, { onConflict: 'id' });
    }

    const currentIds = holidays.map((h) => h.id);
    const { data: existing } = await supabase.from('public_holidays').select('id');
    if (existing) {
      const toDelete = existing.filter((row) => !currentIds.includes(row.id)).map((row) => row.id);
      if (toDelete.length > 0) {
        await supabase.from('public_holidays').delete().in('id', toDelete);
      }
    }
  } catch (err) {
    console.error('Failed to sync public holidays:', err);
  }
}

export async function syncCepDirectoryDb(entries: CepEntry[]): Promise<void> {
  if (!supabase) return;
  try {
    const dbEntries = entries.map(mapCepEntryToDb);
    if (dbEntries.length > 0) {
      await supabase.from('cep_directory').upsert(dbEntries, { onConflict: 'id' });
    }

    const currentIds = entries.map((c) => c.id);
    const { data: existing } = await supabase.from('cep_directory').select('id');
    if (existing) {
      const toDelete = existing.filter((row) => !currentIds.includes(row.id)).map((row) => row.id);
      if (toDelete.length > 0) {
        await supabase.from('cep_directory').delete().in('id', toDelete);
      }
    }
  } catch (err) {
    console.error('Failed to sync CEP directory:', err);
  }
}

export async function syncOvertimeDb(entries: OvertimeEntry[]): Promise<void> {
  if (!supabase) return;
  try {
    const dbEntries = entries.map(mapOvertimeEntryToDb);
    if (dbEntries.length > 0) {
      await supabase.from('overtime_entries').upsert(dbEntries, { onConflict: 'id' });
    }

    const currentIds = entries.map((ot) => ot.id);
    const { data: existing } = await supabase.from('overtime_entries').select('id');
    if (existing) {
      const toDelete = existing.filter((row) => !currentIds.includes(row.id)).map((row) => row.id);
      if (toDelete.length > 0) {
        await supabase.from('overtime_entries').delete().in('id', toDelete);
      }
    }
  } catch (err) {
    console.error('Failed to sync overtime entries:', err);
  }
}

export async function syncShortLeaveDb(entries: ShortLeaveEntry[]): Promise<void> {
  if (!supabase) return;
  try {
    const dbEntries = entries.map(mapShortLeaveEntryToDb);
    if (dbEntries.length > 0) {
      await supabase.from('short_leave_entries').upsert(dbEntries, { onConflict: 'id' });
    }

    const currentIds = entries.map((sl) => sl.id);
    const { data: existing } = await supabase.from('short_leave_entries').select('id');
    if (existing) {
      const toDelete = existing.filter((row) => !currentIds.includes(row.id)).map((row) => row.id);
      if (toDelete.length > 0) {
        await supabase.from('short_leave_entries').delete().in('id', toDelete);
      }
    }
  } catch (err) {
    console.error('Failed to sync short leave entries:', err);
  }
}

export async function clearOvertimeCurrentMonthDb(year: number, month: number): Promise<void> {
  if (!supabase) return;
  try {
    const startDate = formatEntryDate(year, month, 1);
    const endDate = formatEntryDate(year, month, 31);
    await supabase
      .from('overtime_entries')
      .delete()
      .gte('date', startDate)
      .lte('date', endDate);
  } catch (err) {
    console.error('Failed to clear overtime for current month:', err);
  }
}

export async function clearShortLeaveCurrentMonthDb(year: number, month: number): Promise<void> {
  if (!supabase) return;
  try {
    const startDate = formatEntryDate(year, month, 1);
    const endDate = formatEntryDate(year, month, 31);
    await supabase
      .from('short_leave_entries')
      .delete()
      .gte('date', startDate)
      .lte('date', endDate);
  } catch (err) {
    console.error('Failed to clear short leave for current month:', err);
  }
}

/** Persist entire roster state to LocalStorage and trigger DB sync */
export async function saveRoster(store: RosterStore): Promise<void> {
  saveToLocalStorage(store);

  if (supabase) {
    try {
      await Promise.all([
        saveAppSettings(store.year, store.month),
        syncEmployeesDb(store.employees),
        store.publicHolidays ? syncPublicHolidaysDb(store.publicHolidays) : Promise.resolve(),
        store.cepDirectory ? syncCepDirectoryDb(store.cepDirectory) : Promise.resolve(),
        store.overtime ? syncOvertimeDb(store.overtime) : Promise.resolve(),
        store.shortLeaveEntries ? syncShortLeaveDb(store.shortLeaveEntries) : Promise.resolve(),
      ]);
    } catch (err) {
      console.error('Failed to batch sync roster to Supabase:', err);
    }
  }
}

/** Import full backup (from JSON string or object) directly into Supabase and LocalStorage */
export async function importFullBackup(rawInput: string | any): Promise<RosterStore> {
  const parsed = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;

  // Normalize legacy format if needed
  let store: RosterStore;
  if (parsed.grid && !parsed.monthlyGrids) {
    const { grid, ...rest } = parsed;
    const key = monthKey(parsed.year ?? 2026, parsed.month ?? 6);
    store = { ...rest, monthlyGrids: { [key]: grid } } as RosterStore;
  } else {
    store = parsed as RosterStore;
  }

  // Ensure employees array
  const employees = store.employees || mockRosterStore.employees;
  store.employees = employees;

  // Save to LocalStorage immediately
  saveToLocalStorage(store);

  if (supabase) {
    try {
      // 1. Settings
      await saveAppSettings(store.year ?? 2026, store.month ?? 6);

      // 2. Employees
      await syncEmployeesDb(employees);

      // 3. Public Holidays
      if (store.publicHolidays && store.publicHolidays.length > 0) {
        await syncPublicHolidaysDb(store.publicHolidays);
      }

      // 4. CEP Directory
      if (store.cepDirectory && store.cepDirectory.length > 0) {
        await syncCepDirectoryDb(store.cepDirectory);
      }

      // 5. Overtime
      if (store.overtime && store.overtime.length > 0) {
        await syncOvertimeDb(store.overtime);
      }

      // 6. Short Leave Entries
      if (store.shortLeaveEntries && store.shortLeaveEntries.length > 0) {
        await syncShortLeaveDb(store.shortLeaveEntries);
      }

      // 7. Roster Entries (Duty & Leave grids for all months)
      if (store.monthlyGrids) {
        const dbRosterEntries: DbRosterEntry[] = [];
        for (const [mKey, monthGrid] of Object.entries(store.monthlyGrids)) {
          const [yStr, mStr] = mKey.split('-');
          const y = Number(yStr);
          const m = Number(mStr) - 1;

          for (const [empId, days] of Object.entries(monthGrid)) {
            days.forEach((dayEntry, dayIndex) => {
              if (dayEntry && (dayEntry.duty || dayEntry.leave || dayEntry.shortLeave !== undefined)) {
                const dateStr = formatEntryDate(y, m, dayIndex + 1);
                dbRosterEntries.push({
                  employee_id: empId,
                  date: dateStr,
                  duty: dayEntry.duty || null,
                  leave: dayEntry.leave || null,
                  short_leave: dayEntry.shortLeave ?? null,
                });
              }
            });
          }
        }

        if (dbRosterEntries.length > 0) {
          // Batch in chunks of 100 for safety
          for (let i = 0; i < dbRosterEntries.length; i += 100) {
            const chunk = dbRosterEntries.slice(i, i + 100);
            await supabase.from('roster_entries').upsert(chunk, { onConflict: 'employee_id, date' });
          }
        }
      }
    } catch (err) {
      console.error('Error importing backup to Supabase:', err);
    }
  }

  return store;
}

/** Wipe stored roster and re-seed from mock data */
export async function clearRoster(): Promise<RosterStore> {
  if (supabase) {
    try {
      await Promise.all([
        supabase.from('roster_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('overtime_entries').delete().neq('id', ''),
        supabase.from('short_leave_entries').delete().neq('id', ''),
        supabase.from('public_holidays').delete().neq('id', ''),
        supabase.from('cep_directory').delete().neq('id', ''),
      ]);
      await seedDatabaseWithMockData();
    } catch (err) {
      console.error('Failed to clear Supabase database:', err);
    }
  }

  const fresh: RosterStore = { ...mockRosterStore, monthlyGrids: {} };
  saveToLocalStorage(fresh);
  return fresh;
}
