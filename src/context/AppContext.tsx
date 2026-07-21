import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { MonthlyRoster, RosterStore, Employee, DutyCode, LeaveCode, PublicHoliday, CepEntry, OvertimeEntry, ShortLeaveEntry, DayEntry } from '../types';
import { loadRoster, saveRoster } from '../utils/storage';
import { monthKey } from '../utils/monthKey';

interface AppContextValue {
  roster: MonthlyRoster;
  /** Every month's grid data at once, keyed by 'YYYY-MM' — lets pages build cross-month master lists (e.g. Leave List view) instead of being limited to the currently selected month's slice. */
  monthlyGrids: Record<string, Record<string, DayEntry[]>>;
  setRosterMonth: (year: number, month: number) => void;
  /**
   * Updates a single day's cell. By default this writes into whichever month/year is
   * currently selected in Settings (unchanged behavior for Grid views). Pass an explicit
   * targetYear/targetMonth to write into a different month — needed when editing/deleting
   * a Leave List entry that belongs to a month other than the one currently selected.
   */
  updateRosterCell: (employeeId: string, dayIndex: number, updates: Partial<{ duty: DutyCode, leave: LeaveCode, shortLeave: number }>, targetYear?: number, targetMonth?: number) => void;
  resetField: (field: 'duty' | 'leave' | 'shortLeave') => void;
  updateEmployees: (employees: Employee[]) => void;
  updatePublicHolidays: (holidays: PublicHoliday[]) => void;
  updateCepDirectory: (entries: CepEntry[]) => void;
  updateOvertime: (entries: OvertimeEntry[]) => void;
  updateShortLeaveEntries: (entries: ShortLeaveEntry[]) => void;
  /** Clears only the overtime entries that fall within the currently selected month. */
  clearOvertimeForCurrentMonth: () => void;
  /** Clears only the short leave entries that fall within the currently selected month. */
  clearShortLeaveForCurrentMonth: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // `store` holds EVERY month's data at once (monthlyGrids is keyed by 'YYYY-MM').
  // `roster`, derived below, exposes just the currently selected month's slice
  // in the same shape pages already consume, so no page needed to change.
  const [store, setStore] = useState<RosterStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch the roster from Supabase once on mount.
  useEffect(() => {
    let cancelled = false;
    loadRoster()
      .then((s) => { if (!cancelled) setStore(s); })
      .catch((err) => {
        console.error('Failed to load roster:', err);
        if (!cancelled) setLoadError('Could not connect to the database. Check your Supabase configuration.');
      });
    return () => { cancelled = true; };
  }, []);

  // Fire-and-forget background save; UI already updated optimistically via setStore.
  const persist = useCallback((updated: RosterStore) => {
    saveRoster(updated).catch((err) => console.error('Failed to save roster:', err));
  }, []);

  const setRosterMonth = useCallback((year: number, month: number) => {
    setStore((prev) => {
      if (!prev) return prev;
      // Only the "which month am I viewing" pointer changes here — each
      // month's grid data lives under its own key and is left untouched.
      const updated = { ...prev, year, month };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateRosterCell = useCallback((
    employeeId: string,
    dayIndex: number,
    updates: Partial<{ duty: DutyCode, leave: LeaveCode, shortLeave: number }>,
    targetYear?: number,
    targetMonth?: number,
  ) => {
    setStore((prev) => {
      if (!prev) return prev;
      const y = targetYear ?? prev.year;
      const m = targetMonth ?? prev.month;
      const key = monthKey(y, m);
      const monthGrid = prev.monthlyGrids[key] || {};
      const empGrid = [...(monthGrid[employeeId] || [])];
      empGrid[dayIndex] = { ...empGrid[dayIndex], ...(updates as any) };
      const updated = {
        ...prev,
        monthlyGrids: { ...prev.monthlyGrids, [key]: { ...monthGrid, [employeeId]: empGrid } },
      };
      persist(updated);
      return updated;
    });
  }, [persist]);

  // Clears the given field for the CURRENTLY SELECTED month's grid only —
  // every other month's data is left completely untouched.
  const resetField = useCallback((field: 'duty' | 'leave' | 'shortLeave') => {
    setStore((prev) => {
      if (!prev) return prev;
      const key = monthKey(prev.year, prev.month);
      const monthGrid = prev.monthlyGrids[key];
      if (!monthGrid) return prev; // nothing recorded for this month yet

      const newMonthGrid: Record<string, DayEntry[]> = {};
      Object.entries(monthGrid).forEach(([empId, days]) => {
        newMonthGrid[empId] = days.map(entry => {
          const copy = { ...entry };
          if (field === 'duty') copy.duty = '';
          else if (field === 'leave') copy.leave = '';
          else if (field === 'shortLeave') delete copy.shortLeave;
          return copy;
        });
      });
      const updated = { ...prev, monthlyGrids: { ...prev.monthlyGrids, [key]: newMonthGrid } };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateEmployees = useCallback((employees: Employee[]) => {
    setStore((prev) => {
      if (!prev) return prev;
      // Employee roster is global, but if someone is removed we drop their
      // grid rows across every month so no orphaned data lingers.
      const employeeIds = new Set(employees.map((e) => e.id));
      const newMonthlyGrids: Record<string, Record<string, DayEntry[]>> = {};
      Object.entries(prev.monthlyGrids).forEach(([mKey, monthGrid]) => {
        const filtered: Record<string, DayEntry[]> = {};
        Object.entries(monthGrid).forEach(([empId, days]) => {
          if (employeeIds.has(empId)) filtered[empId] = days;
        });
        newMonthlyGrids[mKey] = filtered;
      });

      const updated = { ...prev, employees, monthlyGrids: newMonthlyGrids };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateCepDirectory = useCallback((entries: CepEntry[]) => {
    setStore((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, cepDirectory: entries };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updatePublicHolidays = useCallback((holidays: PublicHoliday[]) => {
    setStore((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, publicHolidays: holidays };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateOvertime = useCallback((entries: OvertimeEntry[]) => {
    setStore((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, overtime: entries };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateShortLeaveEntries = useCallback((entries: ShortLeaveEntry[]) => {
    setStore((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, shortLeaveEntries: entries };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const clearOvertimeForCurrentMonth = useCallback(() => {
    setStore((prev) => {
      if (!prev) return prev;
      const remaining = (prev.overtime || []).filter((ot) => {
        const d = new Date(ot.date + 'T00:00:00');
        return !(d.getFullYear() === prev.year && d.getMonth() === prev.month);
      });
      const updated = { ...prev, overtime: remaining };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const clearShortLeaveForCurrentMonth = useCallback(() => {
    setStore((prev) => {
      if (!prev) return prev;
      const remaining = (prev.shortLeaveEntries || []).filter((sl) => {
        const d = new Date(sl.date + 'T00:00:00');
        return !(d.getFullYear() === prev.year && d.getMonth() === prev.month);
      });
      const updated = { ...prev, shortLeaveEntries: remaining };
      persist(updated);
      return updated;
    });
  }, [persist]);

  // Derive the page-facing roster: identical shape to before, with `grid`
  // scoped to whichever month is currently selected.
  const roster: MonthlyRoster | null = useMemo(() => {
    if (!store) return null;
    const key = monthKey(store.year, store.month);
    return {
      year: store.year,
      month: store.month,
      employees: store.employees,
      grid: store.monthlyGrids[key] || {},
      publicHolidays: store.publicHolidays,
      cepDirectory: store.cepDirectory,
      overtime: store.overtime,
      shortLeaveEntries: store.shortLeaveEntries,
    };
  }, [store]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center px-6">
          <p className="text-sm font-semibold text-rose-600">{loadError}</p>
          <p className="text-xs text-slate-400 mt-2">See .env.example for the required Supabase settings.</p>
        </div>
      </div>
    );
  }

  if (!roster) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <p className="text-sm text-slate-400">Loading roster…</p>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      roster,
      monthlyGrids: store?.monthlyGrids ?? {},
      setRosterMonth,
      updateRosterCell,
      resetField,
      updateEmployees,
      updatePublicHolidays,
      updateCepDirectory,
      updateOvertime,
      updateShortLeaveEntries,
      clearOvertimeForCurrentMonth,
      clearShortLeaveForCurrentMonth,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
