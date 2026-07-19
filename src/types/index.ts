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

// ── Full monthly roster ──
export interface MonthlyRoster {
  year: number;
  month: number; // 0-indexed (0 = Jan, 6 = Jul, etc.)
  employees: Employee[];
  grid: Record<string, DayEntry[]>; // keyed by employee id, array length = daysInMonth
  publicHolidays?: PublicHoliday[]; // Optional list of monthly/global public holidays
  cepDirectory?: CepEntry[]; // Optional CEP directory
  overtime?: OvertimeEntry[]; // Optional Overtime list
}
