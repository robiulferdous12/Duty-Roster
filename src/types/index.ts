// ── Shift/duty codes only: A, B, C, M, H ──
export type DutyCode = 'A' | 'B' | 'C' | 'M' | 'H' | '';

// ── Leave codes: SL, PL, LFA, ADJ, A ──
export type LeaveCode = 'SL' | 'PL' | 'LFA' | 'ADJ' | 'A' | '';

// ── Single day entry for one employee ──
export interface DayEntry {
  duty?: DutyCode;
  leave?: LeaveCode;
  shortLeave?: number; // hours of short leave
}

// ── Employee record ──
export interface Employee {
  id: string;
  name: string;
  designation: string;
  team?: string;
  phone?: string;
}

// ── Public Holiday record ──
export interface PublicHoliday {
  id: string;
  title: string;
  startDate: string; // ISO string 'YYYY-MM-DD'
  endDate: string;   // ISO string 'YYYY-MM-DD'
}

// ── CEP (Contact/Emergency Personnel) entry ──
export interface CepEntry {
  id: string;
  name: string;
  number: string;
}

// ── Overtime record ──
export interface OvertimeEntry {
  id: string;
  employeeId: string;
  date: string; // ISO string 'YYYY-MM-DD'
  from: string; // HH:mm
  to: string;   // HH:mm
  totalHours: number;
  cepId?: string; // Reference to CEP
  cepName?: string;
  cepNumber?: string;
  lunchBreak?: boolean;
}

// ── Short Leave record (List view — clock-time based, mirrors OvertimeEntry) ──
export interface ShortLeaveEntry {
  id: string;
  employeeId: string;
  date: string; // ISO string 'YYYY-MM-DD'
  from: string; // HH:mm
  to: string;   // HH:mm
  totalHours: number;
}

// ── Full monthly roster (the "view" shape the pages consume) ──
// `grid` here always reflects ONLY the currently selected month (see `year`/`month`).
export interface MonthlyRoster {
  year: number;
  month: number; // 0-indexed (0 = Jan, 6 = Jul, etc.) — the currently SELECTED month
  employees: Employee[];
  grid: Record<string, DayEntry[]>; // keyed by employee id, array length = daysInMonth, SCOPED to `year`/`month`
  publicHolidays?: PublicHoliday[]; // Optional list of monthly/global public holidays
  cepDirectory?: CepEntry[]; // Optional CEP directory
  overtime?: OvertimeEntry[]; // Optional Overtime list (all months — each entry carries its own `date`)
  shortLeaveEntries?: ShortLeaveEntry[]; // Optional Short Leave log (all months — each entry carries its own `date`)
}

// ── Persisted store shape ──
// Unlike `MonthlyRoster`, the duty/leave grid is scoped per month here so that
// data for one month never bleeds into another. Keyed by 'YYYY-MM' (see
// utils/monthKey.ts). Everything else (employees, holidays, CEP directory,
// overtime, short leave) stays a single flat list shared across all months,
// since those entries already carry their own dates.
export interface RosterStore {
  year: number;
  month: number; // 0-indexed — last viewed month
  employees: Employee[];
  monthlyGrids: Record<string, Record<string, DayEntry[]>>; // monthKey -> employeeId -> DayEntry[]
  publicHolidays?: PublicHoliday[];
  cepDirectory?: CepEntry[];
  overtime?: OvertimeEntry[];
  shortLeaveEntries?: ShortLeaveEntry[];
}
