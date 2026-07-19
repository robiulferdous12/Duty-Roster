import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
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
  const [roster, setRoster] = useState<MonthlyRoster>(() => loadRoster());

  const setRosterMonth = useCallback((year: number, month: number) => {
    setRoster((prev) => {
      const updated = { ...prev, year, month };
      saveRoster(updated);
      return updated;
    });
  }, []);

  const updateRosterCell = useCallback((
    employeeId: string,
    dayIndex: number,
    updates: Partial<{ duty: DutyCode, leave: LeaveCode, shortLeave: number }>
  ) => {
    setRoster((prev) => {
      const empGrid = [...(prev.grid[employeeId] || [])];
      empGrid[dayIndex] = { ...empGrid[dayIndex], ...(updates as any) };
      const updated = { ...prev, grid: { ...prev.grid, [employeeId]: empGrid } };
      saveRoster(updated);
      return updated;
    });
  }, []);

  const resetField = useCallback((field: 'duty' | 'leave' | 'shortLeave') => {
    setRoster((prev) => {
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
      saveRoster(updated);
      return updated;
    });
  }, []);

  const updateEmployees = useCallback((employees: Employee[]) => {
    setRoster((prev) => {
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
      saveRoster(updated);
      return updated;
    });
  }, []);

  const updateCepDirectory = useCallback((entries: CepEntry[]) => {
    setRoster((prev) => {
      const updated = { ...prev, cepDirectory: entries };
      saveRoster(updated);
      return updated;
    });
  }, []);

  const updatePublicHolidays = useCallback((holidays: PublicHoliday[]) => {
    setRoster((prev) => {
      const updated = { ...prev, publicHolidays: holidays };
      saveRoster(updated);
      return updated;
    });
  }, []);

  const updateOvertime = useCallback((entries: OvertimeEntry[]) => {
    setRoster((prev) => {
      const updated = { ...prev, overtime: entries };
      saveRoster(updated);
      return updated;
    });
  }, []);

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
