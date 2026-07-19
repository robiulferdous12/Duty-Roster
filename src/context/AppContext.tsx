import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { MonthlyRoster, Employee, DutyCode, LeaveCode, PublicHoliday, CepEntry, OvertimeEntry } from '../types';
import { loadRoster, saveRoster } from '../utils/storage';

interface AppContextValue {
  roster: MonthlyRoster;
  setRosterMonth: (year: number, month: number) => void;
  updateRosterCell: (employeeId: string, dayIndex: number, updates: Partial<{ duty: DutyCode, leave: LeaveCode, shortLeave: number }>) => void;
  resetField: (field: 'duty' | 'leave' | 'shortLeave') => void;
  updateEmployees: (employees: Employee[]) => void;
  updatePublicHolidays: (holidays: PublicHoliday[]) => void;
  updateCepDirectory: (entries: CepEntry[]) => void;
  updateOvertime: (entries: OvertimeEntry[]) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [roster, setRoster] = useState<MonthlyRoster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch the roster from Supabase once on mount.
  useEffect(() => {
    let cancelled = false;
    loadRoster()
      .then((r) => { if (!cancelled) setRoster(r); })
      .catch((err) => {
        console.error('Failed to load roster:', err);
        if (!cancelled) setLoadError('Could not connect to the database. Check your Supabase configuration.');
      });
    return () => { cancelled = true; };
  }, []);

  // Fire-and-forget background save; UI already updated optimistically via setRoster.
  const persist = useCallback((updated: MonthlyRoster) => {
    saveRoster(updated).catch((err) => console.error('Failed to save roster:', err));
  }, []);

  const setRosterMonth = useCallback((year: number, month: number) => {
    setRoster((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, year, month };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateRosterCell = useCallback((
    employeeId: string,
    dayIndex: number,
    updates: Partial<{ duty: DutyCode, leave: LeaveCode, shortLeave: number }>
  ) => {
    setRoster((prev) => {
      if (!prev) return prev;
      const empGrid = [...(prev.grid[employeeId] || [])];
      empGrid[dayIndex] = { ...empGrid[dayIndex], ...(updates as any) };
      const updated = { ...prev, grid: { ...prev.grid, [employeeId]: empGrid } };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const resetField = useCallback((field: 'duty' | 'leave' | 'shortLeave') => {
    setRoster((prev) => {
      if (!prev) return prev;
      const newGrid: Record<string, any[]> = {};
      Object.entries(prev.grid).forEach(([empId, days]) => {
        newGrid[empId] = days.map(entry => {
          const copy = { ...entry };
          if (field === 'duty') copy.duty = '';
          else if (field === 'leave') copy.leave = '';
          else if (field === 'shortLeave') delete copy.shortLeave;
          return copy;
        });
      });
      const updated = { ...prev, grid: newGrid };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateEmployees = useCallback((employees: Employee[]) => {
    setRoster((prev) => {
      if (!prev) return prev;
      const newGrid = { ...prev.grid };
      const daysInMonth = new Date(prev.year, prev.month + 1, 0).getDate();

      employees.forEach((emp) => {
        if (!newGrid[emp.id]) {
          newGrid[emp.id] = Array.from({ length: daysInMonth }, () => ({ duty: '' as DutyCode, leave: '' as LeaveCode, shortLeave: undefined }));
        }
      });

      const employeeIds = new Set(employees.map((e) => e.id));
      Object.keys(newGrid).forEach((id) => {
        if (!employeeIds.has(id)) delete newGrid[id];
      });

      const updated = { ...prev, employees, grid: newGrid };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateCepDirectory = useCallback((entries: CepEntry[]) => {
    setRoster((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, cepDirectory: entries };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updatePublicHolidays = useCallback((holidays: PublicHoliday[]) => {
    setRoster((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, publicHolidays: holidays };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateOvertime = useCallback((entries: OvertimeEntry[]) => {
    setRoster((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, overtime: entries };
      persist(updated);
      return updated;
    });
  }, [persist]);

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
      setRosterMonth,
      updateRosterCell,
      resetField,
      updateEmployees,
      updatePublicHolidays,
      updateCepDirectory,
      updateOvertime,
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
