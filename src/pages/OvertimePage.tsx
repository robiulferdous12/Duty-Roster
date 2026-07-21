import { useState, useMemo, useEffect, useRef } from 'react';
import { X, ChevronsLeft, ChevronsRight, Plus, Trash2, Edit2, LayoutGrid, List, Contact, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { OvertimeEntry } from '../types';
import { exportElementAsImage } from '../utils/exportImage';
import TeamFilterDropdown from '../components/TeamFilterDropdown';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TEAM_COLORS: Record<string, string> = {
  Electrical: 'text-amber-600 font-semibold',
  Mechanical: 'text-slate-600 font-semibold',
  Store: 'text-emerald-600 font-semibold',
  Substation: 'text-violet-600 font-semibold',
  Paints: 'text-pink-600 font-semibold',
  Painter: 'text-pink-600 font-semibold',
};

/* ── Sticky column widths (px) ── */
const COL_W = { sl: 32, id: 64, name: 128, desig: 104, team: 96 };
const BASE_LEFT = COL_W.sl + COL_W.id + COL_W.name; // 224px — after Name

const COL = {
  sl: { w: 'w-8 min-w-[32px]', left: 'left-0' },
  id: { w: 'w-16 min-w-[64px]', left: 'left-[32px]' },
  name: { w: 'w-32 min-w-[128px]', left: 'left-[96px]' },
  desig: { w: 'w-26 min-w-[104px]' },
  team: { w: 'w-24 min-w-[96px]' },
};

function formatDateToDMY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function formatTimeTo12H(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, '0')}:${mStr} ${ampm}`;
}

// Helper to calculate total hours from from/to strings (HH:mm)
function calculateDuration(from: string, to: string): number {
  if (!from || !to) return 0;
  const [fH, fM] = from.split(':').map(Number);
  let [tH, tM] = to.split(':').map(Number);

  if (isNaN(fH) || isNaN(fM) || isNaN(tH) || isNaN(tM)) return 0;

  let fromMin = fH * 60 + fM;
  let toMin = tH * 60 + tM;

  if (toMin < fromMin) {
    // Crosses midnight
    toMin += 24 * 60;
  }

  return parseFloat(((toMin - fromMin) / 60).toFixed(2));
}

export default function OvertimePage() {
  const { roster, updateOvertime } = useApp();
  const { year, month, employees, cepDirectory = [], overtime = [] } = roster;

  // View mode: 'grid' | 'list' | 'cep'
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'cep'>('grid');

  // ── Export ──
  const tableRef = useRef<HTMLTableElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    if (!tableRef.current) return;
    setIsExporting(true);
    try {
      await exportElementAsImage(tableRef.current, `Overtime_${viewMode}_${MONTHS[month]}${year}.png`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const [selectedCepIds, setSelectedCepIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('overtime_selected_cep_ids');
    return saved ? JSON.parse(saved) : ['', '', '', '', ''];
  });

  // Sync chosen CEP column dropdowns to localStorage
  useEffect(() => {
    localStorage.setItem('overtime_selected_cep_ids', JSON.stringify(selectedCepIds));
  }, [selectedCepIds]);

  // Column visibility & Team filter
  const [showDesig, setShowDesig] = useState<boolean>(true);
  const [showTeam, setShowTeam] = useState<boolean>(true);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [filterCep, setFilterCep] = useState<string>('All');
  const [filterDatePreset, setFilterDatePreset] = useState<'all' | 'today' | 'thisMonth' | 'lastMonth' | 'custom'>('thisMonth');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // Hover states
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  // Dialogs
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null>(null);

  // Form State
  const [formEmpIds, setFormEmpIds] = useState<string[]>([]);
  const [formEmpSearch, setFormEmpSearch] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formFrom, setFormFrom] = useState('');
  const [formTo, setFormTo] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formCepId, setFormCepId] = useState('');
  const [formCepName, setFormCepName] = useState('');
  const [formCepNumber, setFormCepNumber] = useState('');
  const [formLunchBreak, setFormLunchBreak] = useState(false);
  const [formError, setFormError] = useState('');

  // Computed properties
  const today = useMemo(() => new Date(), []);
  const currentDay = useMemo(() => {
    return (today.getFullYear() === year && today.getMonth() === month) ? today.getDate() : null;
  }, [year, month, today]);

  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);

  const dayHeaders = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return { day: i + 1, dow: DAYS_SHORT[d.getDay()], isFriday: d.getDay() === 5 };
    }), [year, month, daysInMonth]);

  const filteredEmployees = useMemo(() => {
    if (selectedEmpIds.size === 0) return employees;
    return employees.filter(emp => selectedEmpIds.has(emp.id));
  }, [employees, selectedEmpIds]);

  // Month-scoped record summary: total Overtime entries & hours this month
  const monthOvertimeSummary = useMemo(() => {
    let count = 0;
    let hours = 0;
    overtime.forEach(ot => {
      const d = new Date(ot.date + 'T00:00:00');
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      if (selectedEmpIds.size > 0 && !selectedEmpIds.has(ot.employeeId)) return;
      count++;
      hours += ot.totalHours || 0;
    });
    return { count, hours };
  }, [overtime, year, month, selectedEmpIds]);

  const monthOvertimeSummaryText = useMemo(() => {
    const hrsDisplay = Number.isInteger(monthOvertimeSummary.hours) ? monthOvertimeSummary.hours : monthOvertimeSummary.hours.toFixed(1);
    return `${monthOvertimeSummary.count} total entries recorded · ${hrsDisplay} hours Overtime this month`;
  }, [monthOvertimeSummary]);

  // Map of active public holidays for column highlights
  const activeHolidays = useMemo(() => {
    const map: Record<number, string> = {};
    const { publicHolidays = [] } = roster;
    publicHolidays.forEach(h => {
      const start = new Date(h.startDate + 'T00:00:00');
      const end = new Date(h.endDate + 'T00:00:00');
      const cur = new Date(start);
      while (cur <= end) {
        if (cur.getFullYear() === year && cur.getMonth() === month) {
          map[cur.getDate()] = h.title;
        }
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [roster.publicHolidays, year, month]);

  // Overtime entries filtered for current month to display on Grid view
  const currentMonthOvertimeMap = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    overtime.forEach(entry => {
      const entryDate = new Date(entry.date + 'T00:00:00');
      if (entryDate.getFullYear() === year && entryDate.getMonth() === month) {
        const day = entryDate.getDate();
        if (!map[entry.employeeId]) map[entry.employeeId] = {};
        map[entry.employeeId][day] = (map[entry.employeeId][day] || 0) + entry.totalHours;
      }
    });
    return map;
  }, [overtime, year, month]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const thisMonthRange = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(yyyy, d.getMonth() + 1, 0).getDate();
    return {
      start: `${yyyy}-${mm}-01`,
      end: `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`
    };
  }, []);

  const lastMonthRange = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(yyyy, d.getMonth() + 1, 0).getDate();
    return {
      start: `${yyyy}-${mm}-01`,
      end: `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`
    };
  }, []);

  const filteredOvertimeList = useMemo(() => {
    return overtime.map(ot => {
      const emp = employees.find(e => e.id === ot.employeeId);
      return {
        ...ot,
        employeeName: emp ? emp.name : 'Unknown',
        employeeDesig: emp ? emp.designation : '-',
        employeeTeam: emp ? (emp.team || 'Electrical') : '-',
      };
    }).filter(ot => {
      if (selectedEmpIds.size > 0 && !selectedEmpIds.has(ot.employeeId)) return false;

      if (filterCep !== 'All') {
        if (filterCep === 'None') {
          if (ot.cepId || ot.cepName || ot.cepNumber) return false;
        } else {
          if (ot.cepId !== filterCep) return false;
        }
      }

      // Date preset filtering
      if (filterDatePreset === 'today') {
        if (ot.date !== todayStr) return false;
      } else if (filterDatePreset === 'thisMonth') {
        if (ot.date < thisMonthRange.start || ot.date > thisMonthRange.end) return false;
      } else if (filterDatePreset === 'lastMonth') {
        if (ot.date < lastMonthRange.start || ot.date > lastMonthRange.end) return false;
      } else if (filterDatePreset === 'custom') {
        if (filterStartDate && ot.date < filterStartDate) return false;
        if (filterEndDate && ot.date > filterEndDate) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [overtime, employees, selectedEmpIds, filterCep, filterDatePreset, filterStartDate, filterEndDate, todayStr, thisMonthRange, lastMonthRange]);

  const totalVisibleHours = useMemo(() => {
    return filteredOvertimeList.reduce((sum, ot) => sum + ot.totalHours, 0);
  }, [filteredOvertimeList]);

  const getEmployeeCepOvertime = (empId: string, cepIndex: number) => {
    const selectedCepId = selectedCepIds[cepIndex];
    if (!selectedCepId) return 0;
    const selectedCep = cepDirectory.find(c => c.id === selectedCepId);
    if (!selectedCep) return 0;
    return overtime
      .filter(ot => {
        if (ot.employeeId !== empId) return false;

        // Same Date filter used by the Master List view, decoupled from whichever month is
        // selected in Settings. 'all' turns this into a true cross-month master summary.
        if (filterDatePreset === 'today') {
          if (ot.date !== todayStr) return false;
        } else if (filterDatePreset === 'thisMonth') {
          if (ot.date < thisMonthRange.start || ot.date > thisMonthRange.end) return false;
        } else if (filterDatePreset === 'lastMonth') {
          if (ot.date < lastMonthRange.start || ot.date > lastMonthRange.end) return false;
        } else if (filterDatePreset === 'custom') {
          if (filterStartDate && ot.date < filterStartDate) return false;
          if (filterEndDate && ot.date > filterEndDate) return false;
        }
        // filterDatePreset === 'all' → no date restriction at all

        const matchesId = ot.cepId === selectedCep.id;
        const matchesName = ot.cepName?.toLowerCase() === selectedCep.name.toLowerCase();
        const matchesNumber = ot.cepNumber === selectedCep.number;
        return matchesId || matchesName || matchesNumber;
      })
      .reduce((sum, ot) => sum + ot.totalHours, 0);
  };

  // Human-readable label for whichever Date filter is active, used in the CEP Summary header
  // so it's clear the grid no longer always reflects the Settings-selected month.
  const dateFilterLabel = useMemo(() => {
    switch (filterDatePreset) {
      case 'today': return 'Today';
      case 'thisMonth': return 'This Month';
      case 'lastMonth': return 'Last Month';
      case 'custom':
        return filterStartDate && filterEndDate
          ? `${formatDateToDMY(filterStartDate)} – ${formatDateToDMY(filterEndDate)}`
          : 'Custom Range';
      case 'all':
      default:
        return 'All Dates — Master Summary';
    }
  }, [filterDatePreset, filterStartDate, filterEndDate]);

  // Sticky columns configuration
  const desigLeft = BASE_LEFT;
  const desigW = showDesig ? COL_W.desig : 20;
  const teamLeft = BASE_LEFT + desigW;
  const teamW = showTeam ? COL_W.team : 20;
  const frozenWidth = BASE_LEFT + desigW + teamW;

  // Handle times change to autocalculate hours
  const handleTimesChange = (from: string, to: string, hasLunch = formLunchBreak) => {
    setFormFrom(from);
    setFormTo(to);
    let duration = calculateDuration(from, to);
    if (hasLunch && duration >= 1) {
      duration = parseFloat((duration - 1).toFixed(2));
    }
    setFormHours(duration > 0 ? String(duration) : '');
  };

  const handleLunchToggle = (checked: boolean) => {
    setFormLunchBreak(checked);
    let duration = calculateDuration(formFrom, formTo);
    if (checked && duration >= 1) {
      duration = parseFloat((duration - 1).toFixed(2));
    }
    setFormHours(duration > 0 ? String(duration) : '');
  };

  // Handle CEP selection
  const handleCepSelect = (id: string) => {
    setFormCepId(id);
    if (id === 'custom') {
      setFormCepName('');
      setFormCepNumber('');
    } else {
      const cep = cepDirectory.find(c => c.id === id);
      if (cep) {
        setFormCepName(cep.name);
        setFormCepNumber(cep.number);
      }
    }
  };

  // Find an existing overtime entry for a given employee on a given date (used by Grid cell clicks)
  const findEntryForCell = (empId: string, dateStr: string) =>
    overtime.find(ot => ot.employeeId === empId && ot.date === dateStr);

  // Open modal for Adding
  const openAddModal = (initialEmpId = '', initialDate = '') => {
    setEditingEntry(null);
    setFormEmpIds(initialEmpId ? [initialEmpId] : []);
    setFormEmpSearch('');
    setFormDate(initialDate || new Date().toISOString().split('T')[0]);
    setFormFrom('18:00');
    setFormTo('22:00');
    setFormHours('4');
    setFormCepId('');
    setFormCepName('');
    setFormCepNumber('');
    setFormLunchBreak(false);
    setFormError('');
    setShowAddModal(true);
  };

  // Open modal for Editing
  const openEditModal = (entry: OvertimeEntry) => {
    setEditingEntry(entry);
    setFormEmpIds([entry.employeeId]);
    setFormEmpSearch('');
    setFormDate(entry.date);
    setFormFrom(entry.from);
    setFormTo(entry.to);
    setFormHours(String(entry.totalHours));
    setFormCepId(entry.cepId || '');
    setFormCepName(entry.cepName || '');
    setFormCepNumber(entry.cepNumber || '');
    setFormLunchBreak(entry.lunchBreak || false);
    setFormError('');
    setShowAddModal(true);
  };

  // Save/Submit Form
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const empIds = formEmpIds;
    const date = formDate;
    const from = formFrom;
    const to = formTo;
    const hours = parseFloat(formHours);

    if (empIds.length === 0) { setFormError('Please select at least one employee.'); return; }
    if (!date) { setFormError('Please select a date.'); return; }
    if (!from || !to) { setFormError('Please fill in both From and To times.'); return; }
    if (isNaN(hours) || hours <= 0) { setFormError('Please enter a valid hours value.'); return; }

    const sharedFields = {
      date,
      from,
      to,
      totalHours: hours,
      cepId: formCepId === 'custom' ? undefined : formCepId,
      cepName: formCepName.trim() || undefined,
      cepNumber: formCepNumber.trim() || undefined,
      lunchBreak: formLunchBreak,
    };

    let updated: OvertimeEntry[];
    if (editingEntry) {
      // Editing always applies to the single original employee
      const newEntry: OvertimeEntry = {
        id: editingEntry.id,
        employeeId: editingEntry.employeeId,
        ...sharedFields,
      };
      updated = overtime.map(ot => ot.id === editingEntry.id ? newEntry : ot);
    } else {
      // Adding: create one entry per selected employee, all sharing the same date/time/hours/CEP
      const newEntries: OvertimeEntry[] = empIds.map((empId, i) => ({
        id: `ot_${Date.now()}_${i}_${empId}`,
        employeeId: empId,
        ...sharedFields,
      }));
      updated = [...overtime, ...newEntries];
    }

    updateOvertime(updated);
    setShowAddModal(false);
  };

  // Delete the entry being edited (and close the modal), or — if there's no
  // existing entry yet (Add mode) — just clear the editable fields instead.
  const handleDeleteOrClear = () => {
    if (editingEntry) {
      if (confirm('Are you sure you want to delete this Overtime entry?')) {
        updateOvertime(overtime.filter(ot => ot.id !== editingEntry.id));
        setShowAddModal(false);
      }
      return;
    }
    setFormEmpIds([]);
    setFormEmpSearch('');
    setFormDate('');
    setFormFrom('');
    setFormTo('');
    setFormHours('');
    setFormCepId('');
    setFormCepName('');
    setFormCepNumber('');
    setFormLunchBreak(false);
    setFormError('');
  };

  // Toggle a single employee's checkbox in the multi-select picker
  const toggleFormEmpId = (empId: string) => {
    setFormEmpIds(prev => prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]);
  };

  // Employees shown in the picker, filtered by the search box
  const pickerEmployees = useMemo(() => {
    const q = formEmpSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(emp =>
      emp.name.toLowerCase().includes(q) ||
      emp.id.toLowerCase().includes(q) ||
      (emp.designation || '').toLowerCase().includes(q)
    );
  }, [employees, formEmpSearch]);

  const allPickerSelected = pickerEmployees.length > 0 && pickerEmployees.every(emp => formEmpIds.includes(emp.id));

  const toggleSelectAllPicker = () => {
    if (allPickerSelected) {
      setFormEmpIds(prev => prev.filter(id => !pickerEmployees.some(emp => emp.id === id)));
    } else {
      setFormEmpIds(prev => Array.from(new Set([...prev, ...pickerEmployees.map(emp => emp.id)])));
    }
  };

  // Delete Overtime record
  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this Overtime entry?')) {
      updateOvertime(overtime.filter(ot => ot.id !== id));
    }
  };

  const shadowDivider = 'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]';
  const shadowDividerBody = 'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200/60">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
            {viewMode === 'grid' ? `${MONTHS[month]} ${year} — Overtime Grid` : viewMode === 'cep' ? `${dateFilterLabel} — Overtime CEP Summary` : 'Overtime Log — Master Directory'}
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {viewMode === 'grid'
              ? `${filteredEmployees.length} staff · ${daysInMonth} days · Click a cell to log overtime`
              : viewMode === 'cep'
                ? `${filteredEmployees.length} staff · 5 CEP Columns · ${dateFilterLabel}`
                : `${filteredOvertimeList.length} total entries recorded · ${totalVisibleHours} hours Overtime`}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            {monthOvertimeSummaryText}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Add Staff Overtime Button (shows in List mode) */}
          {viewMode === 'list' && (
            <button
              onClick={() => openAddModal()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Log Overtime
            </button>
          )}

          {/* View Switcher Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200/60">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-all flex items-center gap-1 text-[11.5px] font-semibold ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              title="List Table"
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-all flex items-center gap-1 text-[11.5px] font-semibold ${viewMode === 'grid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              title="Grid Table"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button
              onClick={() => setViewMode('cep')}
              className={`p-1.5 rounded transition-all flex items-center gap-1 text-[11.5px] font-semibold ${viewMode === 'cep' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              title="CEP Summary Grid"
            >
              <Contact className="w-3.5 h-3.5" />
              <span>CEP</span>
            </button>
          </div>

          {/* Team Filter */}
          <TeamFilterDropdown
            employees={employees}
            selected={selectedEmpIds}
            onChange={setSelectedEmpIds}
          />

          {/* CEP Filter */}
          {viewMode === 'list' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">CEP:</span>
              <select
                value={filterCep}
                onChange={e => setFilterCep(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 font-semibold text-slate-700 max-w-[120px] truncate"
              >
                <option value="All">All CEPs</option>
                <option value="None">No CEP</option>
                {cepDirectory.map(cep => (
                  <option key={cep.id} value={cep.id}>
                    {cep.number} - {cep.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Filter (List view's own filter, also drives the CEP Summary grid below) */}
          {(viewMode === 'list' || viewMode === 'cep') && (
            <div className="flex items-center gap-1.5 animate-fadeIn">
              <span className="text-xs text-slate-500 font-medium">Date:</span>
              <select
                value={filterDatePreset}
                onChange={e => {
                  setFilterDatePreset(e.target.value as any);
                  if (e.target.value !== 'custom') {
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }
                }}
                className="px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 font-semibold text-slate-700"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
                <option value="custom">Custom (Range)</option>
              </select>

              {filterDatePreset === 'custom' && (
                <div className="flex items-center gap-1 animate-fadeIn">
                  <span className="text-[11px] text-slate-400 font-medium ml-1">From:</span>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={e => setFilterStartDate(e.target.value)}
                    className="px-1.5 py-0.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 font-semibold text-slate-700"
                  />
                  <span className="text-[11px] text-slate-400 font-medium">To:</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={e => setFilterEndDate(e.target.value)}
                    className="px-1.5 py-0.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 font-semibold text-slate-700"
                  />
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200/60 rounded transition-colors disabled:opacity-50"
          >
            <Download className="w-3 h-3" /> {isExporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      {/* ── View Content ── */}
      <div className="flex-1 overflow-auto" onMouseLeave={() => { setHoverRow(null); setHoverCol(null); }}>
        {viewMode === 'grid' ? (
          /* ── GRID TABLE VIEW ── */
          <table
            ref={tableRef}
            className="border-separate border-spacing-0 text-[13px] select-none mx-auto"
            style={{ width: `${frozenWidth + 36 * daysInMonth}px`, minWidth: `${frozenWidth + 36 * daysInMonth}px` }}
          >
            <thead>
              <tr className="bg-slate-800 text-white">
                <th rowSpan={2} className={`sticky top-0 ${COL.sl.left} z-40 bg-slate-800 ${COL.sl.w} text-center align-middle text-[14px] font-medium border-r border-slate-700`}>#</th>
                <th rowSpan={2} className={`sticky top-0 ${COL.id.left} z-40 bg-slate-800 ${COL.id.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-700`}>Staff ID</th>
                <th rowSpan={2} className={`sticky top-0 ${COL.name.left} z-40 bg-slate-800 ${COL.name.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-700`}>Name</th>

                {showDesig ? (
                  <th rowSpan={2} className={`sticky top-0 z-40 bg-slate-800 ${COL.desig.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-600`} style={{ left: desigLeft }}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Designation</span>
                      <button onClick={() => setShowDesig(false)} className="p-0 ml-0.5 text-slate-400 hover:text-white transition-colors">
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ) : (
                  <th rowSpan={2} className={`sticky top-0 z-40 bg-slate-700 w-5 min-w-[20px] max-w-[20px] text-center align-middle border-r border-slate-600 cursor-pointer hover:bg-slate-600 transition-colors`} style={{ left: desigLeft }} onClick={() => setShowDesig(true)}>
                    <ChevronsRight className="w-3 h-3 mx-auto text-slate-400" />
                  </th>
                )}

                {showTeam ? (
                  <th rowSpan={2} className={`sticky top-0 z-40 bg-slate-800 ${COL.team.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-600 ${shadowDivider}`} style={{ left: teamLeft }}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Team</span>
                      <button onClick={() => setShowTeam(false)} className="p-0 ml-0.5 text-slate-400 hover:text-white transition-colors">
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ) : (
                  <th rowSpan={2} className={`sticky top-0 z-40 bg-slate-700 w-5 min-w-[20px] max-w-[20px] text-center align-middle border-r border-slate-600 cursor-pointer hover:bg-slate-600 transition-colors ${shadowDivider}`} style={{ left: teamLeft }} onClick={() => setShowTeam(true)}>
                    <ChevronsRight className="w-3 h-3 mx-auto text-slate-400" />
                  </th>
                )}

                {dayHeaders.map(({ day, dow, isFriday }) => {
                  const holidayTitle = activeHolidays[day];
                  return (
                    <th
                      key={day}
                      title={holidayTitle ? `Public Holiday: ${holidayTitle}` : undefined}
                      className={`sticky top-0 z-30 w-9 min-w-[36px] max-w-[36px] h-7 text-center font-medium border-r border-slate-700/40 text-[13px] leading-tight transition-colors bg-slate-800
                        ${holidayTitle ? '!bg-red-900 text-red-50' : day === currentDay ? '!bg-emerald-700 text-emerald-50' : isFriday ? '!bg-red-900' : ''}
                        ${hoverCol === day ? '!bg-slate-600' : ''}`}
                    >
                      {dow}
                    </th>
                  );
                })}
              </tr>
              <tr className="bg-slate-700 text-white">
                {dayHeaders.map(({ day, isFriday }) => {
                  const holidayTitle = activeHolidays[day];
                  return (
                    <th
                      key={day}
                      title={holidayTitle ? `Public Holiday: ${holidayTitle}` : undefined}
                      className={`sticky top-[28px] z-30 w-9 min-w-[36px] max-w-[36px] h-6 text-center text-[13.5px] font-semibold border-r border-slate-600/30 transition-colors bg-slate-700
                        ${holidayTitle ? '!bg-red-800 text-white' : day === currentDay ? '!bg-emerald-600 text-white' : isFriday ? '!bg-red-800' : ''}
                        ${hoverCol === day ? '!bg-slate-500' : ''}`}
                    >
                      {String(day).padStart(2, '0')}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((emp, idx) => {
                const empOvertime = currentMonthOvertimeMap[emp.id] || {};
                const isRowHovered = hoverRow === emp.id;
                const bgBase = isRowHovered ? 'bg-slate-300' : idx % 2 === 1 ? 'bg-slate-100' : 'bg-slate-50';

                return (
                  <tr
                    key={emp.id}
                    className={`transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : ''} ${isRowHovered ? '!bg-slate-100/70' : ''}`}
                  >
                    <td className={`sticky ${COL.sl.left} z-20 ${COL.sl.w} h-6 text-center text-slate-400 border-r border-b border-slate-200/60 transition-colors ${bgBase}`}>{idx + 1}</td>
                    <td className={`sticky ${COL.id.left} z-20 ${COL.id.w} h-6 px-2 text-slate-700 font-semibold border-r border-b border-slate-200/60 whitespace-nowrap transition-colors ${bgBase}`}>{emp.id}</td>
                    <td className={`sticky ${COL.name.left} z-20 ${COL.name.w} h-6 px-2 text-[13.5px] font-bold text-slate-800 border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${bgBase}`}>{emp.name}</td>

                    {showDesig ? (
                      <td className={`sticky z-20 ${COL.desig.w} h-6 px-2 text-slate-500 text-xs border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${bgBase}`} style={{ left: desigLeft }}>{emp.designation}</td>
                    ) : (
                      <td className={`sticky z-20 w-5 min-w-[20px] max-w-[20px] h-6 border-r border-b border-slate-200/60 transition-colors ${bgBase}`} style={{ left: desigLeft }} />
                    )}

                    {showTeam ? (
                      <td className={`sticky z-20 ${COL.team.w} h-6 px-2 text-xs border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${shadowDividerBody} ${bgBase} ${TEAM_COLORS[emp.team || 'Electrical'] || 'text-slate-500'}`} style={{ left: teamLeft }}>
                        {emp.team || 'Electrical'}
                      </td>
                    ) : (
                      <td className={`sticky z-20 w-5 min-w-[20px] max-w-[20px] h-6 border-r border-b border-slate-200/60 transition-colors ${shadowDividerBody} ${bgBase}`} style={{ left: teamLeft }} />
                    )}

                    {dayHeaders.map(({ day, isFriday }) => {
                      const totalHrs = empOvertime[day] || 0;
                      const isColHovered = hoverCol === day;
                      const crosshair = (isRowHovered && isColHovered) ? '!bg-slate-200/60' : isColHovered ? 'bg-slate-100/50' : '';

                      const isCurrentDay = day === currentDay;
                      const holidayTitle = activeHolidays[day];
                      const holidayHighlight = holidayTitle && !isCurrentDay ? 'bg-rose-50/30' : '';
                      const currentDayHighlight = isCurrentDay ? 'bg-emerald-50' : '';
                      const fridayTint = isFriday && !holidayTitle && !isCurrentDay ? 'bg-rose-50/30' : '';

                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                      return (
                        <td
                          key={day}
                          title={holidayTitle ? `Public Holiday: ${holidayTitle}` : undefined}
                          className={`relative w-9 min-w-[36px] max-w-[36px] h-6 p-0 text-center align-middle border-r border-b border-slate-200/60 cursor-pointer transition-colors
                            ${currentDayHighlight} ${holidayHighlight} ${fridayTint} ${crosshair}`}
                          onMouseEnter={() => { setHoverRow(emp.id); setHoverCol(day); }}
                          onClick={() => {
                            const existing = findEntryForCell(emp.id, dateStr);
                            if (existing) {
                              openEditModal(existing);
                            } else {
                              openAddModal(emp.id, dateStr);
                            }
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {totalHrs > 0 && (
                              <span className="inline-flex items-center justify-center w-[30px] h-[18px] text-[11px] font-bold rounded-sm border bg-violet-100/80 text-violet-800 border-violet-200/80">
                                {totalHrs}h
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : viewMode === 'cep' ? (
          /* ── CEP SUMMARY GRID VIEW ── */
          <table
            ref={tableRef}
            className="border-separate border-spacing-0 text-[13px] select-none mx-auto"
            style={{ width: `${frozenWidth + 144 * 5}px`, minWidth: `${frozenWidth + 144 * 5}px` }}
          >
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className={`sticky top-0 ${COL.sl.left} z-40 bg-slate-800 ${COL.sl.w} text-center align-middle text-[14px] font-medium border-r border-slate-700`}>#</th>
                <th className={`sticky top-0 ${COL.id.left} z-40 bg-slate-800 ${COL.id.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-700`}>Staff ID</th>
                <th className={`sticky top-0 ${COL.name.left} z-40 bg-slate-800 ${COL.name.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-700`}>Name</th>

                {showDesig ? (
                  <th className={`sticky top-0 z-40 bg-slate-800 ${COL.desig.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-600`} style={{ left: desigLeft }}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Designation</span>
                      <button onClick={() => setShowDesig(false)} className="p-0 ml-0.5 text-slate-400 hover:text-white transition-colors">
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ) : (
                  <th className={`sticky top-0 z-40 bg-slate-700 w-5 min-w-[20px] max-w-[20px] text-center align-middle border-r border-slate-600 cursor-pointer hover:bg-slate-600 transition-colors`} style={{ left: desigLeft }} onClick={() => setShowDesig(true)}>
                    <ChevronsRight className="w-3 h-3 mx-auto text-slate-400" />
                  </th>
                )}

                {showTeam ? (
                  <th className={`sticky top-0 z-40 bg-slate-800 ${COL.team.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-600 ${shadowDivider}`} style={{ left: teamLeft }}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Team</span>
                      <button onClick={() => setShowTeam(false)} className="p-0 ml-0.5 text-slate-400 hover:text-white transition-colors">
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ) : (
                  <th className={`sticky top-0 z-40 bg-slate-700 w-5 min-w-[20px] max-w-[20px] text-center align-middle border-r border-slate-600 cursor-pointer hover:bg-slate-600 transition-colors ${shadowDivider}`} style={{ left: teamLeft }} onClick={() => setShowTeam(true)}>
                    <ChevronsRight className="w-3 h-3 mx-auto text-slate-400" />
                  </th>
                )}

                {Array.from({ length: 5 }).map((_, colIdx) => {
                  const selectedId = selectedCepIds[colIdx];
                  const selectedCep = cepDirectory.find(c => c.id === selectedId);
                  const displayLabel = selectedCep ? selectedCep.number : '-- Select CEP --';

                  return (
                    <th
                      key={colIdx}
                      className="w-36 min-w-[144px] max-w-[144px] h-12 text-center font-medium border-r border-slate-700 bg-slate-800 p-1"
                    >
                      <div className="flex flex-col gap-0.5 w-full">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CEP Column {colIdx + 1}</span>
                        <div className="relative w-full">
                          <select
                            value={selectedCepIds[colIdx]}
                            onChange={e => {
                              const next = [...selectedCepIds];
                              next[colIdx] = e.target.value;
                              setSelectedCepIds(next);
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 text-slate-900 bg-white"
                          >
                            <option value="" className="bg-white text-slate-900">-- Select CEP --</option>
                            {cepDirectory.map(cep => (
                              <option key={cep.id} value={cep.id} className="bg-white text-slate-900">
                                {cep.number} - {cep.name}
                              </option>
                            ))}
                          </select>
                          <div className="w-full px-1.5 py-0.5 text-[11px] border border-slate-600 bg-slate-900 text-white rounded font-medium text-center truncate min-h-[22px] flex items-center justify-center">
                            {displayLabel}
                          </div>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((emp, idx) => {
                const isRowHovered = hoverRow === emp.id;
                const bgBase = isRowHovered ? 'bg-slate-300' : idx % 2 === 1 ? 'bg-slate-100' : 'bg-slate-50';

                return (
                  <tr
                    key={emp.id}
                    className={`transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : ''} ${isRowHovered ? '!bg-slate-100/70' : ''}`}
                    onMouseEnter={() => setHoverRow(emp.id)}
                  >
                    <td className={`sticky ${COL.sl.left} z-20 ${COL.sl.w} h-8 text-center text-slate-400 border-r border-b border-slate-200/60 transition-colors ${bgBase}`}>{idx + 1}</td>
                    <td className={`sticky ${COL.id.left} z-20 ${COL.id.w} h-8 px-2 text-slate-700 font-semibold border-r border-b border-slate-200/60 whitespace-nowrap transition-colors ${bgBase}`}>{emp.id}</td>
                    <td className={`sticky ${COL.name.left} z-20 ${COL.name.w} h-8 px-2 text-[13.5px] font-bold text-slate-800 border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${bgBase}`}>{emp.name}</td>

                    {showDesig ? (
                      <td className={`sticky z-20 ${COL.desig.w} h-8 px-2 text-slate-500 text-xs border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${bgBase}`} style={{ left: desigLeft }}>{emp.designation}</td>
                    ) : (
                      <td className={`sticky z-20 w-5 min-w-[20px] max-w-[20px] h-8 border-r border-b border-slate-200/60 transition-colors ${bgBase}`} style={{ left: desigLeft }} />
                    )}

                    {showTeam ? (
                      <td className={`sticky z-20 ${COL.team.w} h-8 px-2 text-xs border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${shadowDividerBody} ${bgBase} ${TEAM_COLORS[emp.team || 'Electrical'] || 'text-slate-500'}`} style={{ left: teamLeft }}>
                        {emp.team || 'Electrical'}
                      </td>
                    ) : (
                      <td className={`sticky z-20 w-5 min-w-[20px] max-w-[20px] h-8 border-r border-b border-slate-200/60 transition-colors ${shadowDividerBody} ${bgBase}`} style={{ left: teamLeft }} />
                    )}

                    {Array.from({ length: 5 }).map((_, colIdx) => {
                      const totalHrs = getEmployeeCepOvertime(emp.id, colIdx);
                      return (
                        <td
                          key={colIdx}
                          className="w-36 min-w-[144px] max-w-[144px] h-8 p-0 text-center align-middle border-r border-b border-slate-200/60"
                        >
                          {totalHrs > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded bg-violet-100/80 text-violet-800 border border-violet-200/80">
                              {totalHrs}h
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* ── MASTER LIST VIEW ── */
          <div className="max-w-[1600px] mx-auto p-5">
            <div className="bg-white border border-slate-200/60 rounded overflow-x-auto">
              <table ref={tableRef} className="min-w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/60 border-b border-slate-200/60 text-slate-500 font-semibold">
                    <th className="px-4 py-1.5 w-12 text-center whitespace-nowrap">#</th>
                    <th className="px-4 py-1.5 w-24 text-center whitespace-nowrap">Staff ID</th>
                    <th className="px-4 py-1.5 text-center whitespace-nowrap">Name</th>
                    <th className="px-4 py-1.5 text-center whitespace-nowrap">Designation</th>
                    <th className="px-4 py-1.5 text-center whitespace-nowrap">Team</th>
                    <th className="px-4 py-1.5 text-center whitespace-nowrap">Date</th>
                    <th className="px-4 py-1.5 text-center whitespace-nowrap">From</th>
                    <th className="px-4 py-1.5 text-center whitespace-nowrap">To</th>
                    <th className="px-4 py-1.5 text-center whitespace-nowrap">Total Hours</th>
                    <th className="px-4 py-1.5 text-center w-[340px]">CEP Name</th>
                    <th className="px-4 py-1.5 text-center whitespace-nowrap">CEP Number</th>
                    <th className="px-4 py-1.5 text-center w-24 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOvertimeList.map((ot, idx) => (
                    <tr key={ot.id} className="border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-1 text-slate-400 whitespace-nowrap">{idx + 1}</td>
                      <td className="px-4 py-1 text-slate-700 font-semibold whitespace-nowrap">{ot.employeeId}</td>
                      <td className="px-4 py-1 font-bold text-slate-800 whitespace-nowrap">{ot.employeeName}</td>
                      <td className="px-4 py-1 text-slate-600 whitespace-nowrap">{ot.employeeDesig}</td>
                      <td className="px-4 py-1 text-slate-600 whitespace-nowrap">{ot.employeeTeam}</td>
                      <td className="px-4 py-1 text-slate-700 font-medium whitespace-nowrap">{formatDateToDMY(ot.date)}</td>
                      <td className="px-4 py-1 text-slate-600 font-mono whitespace-nowrap">{formatTimeTo12H(ot.from)}</td>
                      <td className="px-4 py-1 text-slate-600 font-mono whitespace-nowrap">{formatTimeTo12H(ot.to)}</td>
                      <td className="px-4 py-1 text-slate-800 font-bold whitespace-nowrap">{ot.totalHours}h</td>
                      <td className="px-4 py-1 text-slate-600 w-[340px]">
                        <span
                          className="block leading-snug"
                          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}
                          title={ot.cepName || undefined}
                        >
                          {ot.cepName || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-1 text-slate-600 font-mono whitespace-nowrap">{ot.cepNumber || '-'}</td>
                      <td className="px-4 py-1 text-center whitespace-nowrap">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => openEditModal(ot)}
                            className="p-1 text-sky-600 hover:bg-sky-50 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(ot.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredOvertimeList.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-xs">
                        No overtime records logged.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Log/Edit Overtime Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/15 backdrop-blur-[2px]" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md animate-fade-in border border-slate-200/60">
            <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center rounded-t-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {editingEntry ? 'Edit Overtime Entry' : 'Log Overtime Hours'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-300 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-3">
              {formError && <p className="text-[11px] text-rose-500 font-semibold">{formError}</p>}

              {/* Employee Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-500">
                    Employee(s) *{!editingEntry && formEmpIds.length > 0 && (
                      <span className="ml-1 font-normal text-slate-400">({formEmpIds.length} selected)</span>
                    )}
                  </label>
                  {!editingEntry && (
                    <button
                      type="button"
                      onClick={toggleSelectAllPicker}
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 underline"
                    >
                      {allPickerSelected ? 'Clear All' : 'Select All'}
                    </button>
                  )}
                </div>

                {editingEntry ? (
                  // Locked to the original employee while editing an existing entry
                  <div className="w-full px-3 py-2 text-xs border border-slate-200 rounded bg-slate-50 text-slate-600">
                    {(() => {
                      const emp = employees.find(e => e.id === editingEntry.employeeId);
                      return emp ? `${emp.name} (${emp.id}) — ${emp.designation}` : editingEntry.employeeId;
                    })()}
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={formEmpSearch}
                      onChange={e => setFormEmpSearch(e.target.value)}
                      placeholder="Search by name, ID or designation…"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded mb-1.5 focus:outline-none focus:border-slate-400"
                    />
                    <div className="border border-slate-200 rounded max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {pickerEmployees.map(emp => (
                        <label
                          key={emp.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={formEmpIds.includes(emp.id)}
                            onChange={() => toggleFormEmpId(emp.id)}
                            className="rounded border-slate-300 text-slate-800 focus:ring-slate-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                          />
                          <span className="flex-1 font-semibold text-slate-700 truncate">{emp.name} ({emp.id})</span>
                          <span className="text-slate-400 shrink-0">{emp.designation}</span>
                        </label>
                      ))}
                      {pickerEmployees.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-400 text-center">No employees match.</div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Date *</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                />
              </div>

              {/* Time Interval & Hours */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">From *</label>
                  <input
                    type="time"
                    value={formFrom}
                    onChange={e => handleTimesChange(e.target.value, formTo)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">To *</label>
                  <input
                    type="time"
                    value={formTo}
                    onChange={e => handleTimesChange(formFrom, e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Total Hours *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formHours}
                    onChange={e => setFormHours(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400 font-bold"
                  />
                </div>
              </div>

              {/* Lunch Break checkbox */}
              <div className="flex items-center gap-2 pt-1 pb-1">
                <input
                  type="checkbox"
                  id="lunchBreak"
                  checked={formLunchBreak}
                  onChange={e => handleLunchToggle(e.target.checked)}
                  className="rounded border-slate-300 text-slate-800 focus:ring-slate-500 h-3.5 w-3.5 cursor-pointer"
                />
                <label htmlFor="lunchBreak" className="text-[11px] text-slate-600 font-semibold select-none cursor-pointer">
                  Lunch Break Included (Deduct 1 Hour)
                </label>
              </div>

              {/* CEP Association */}
              <div className="border-t border-slate-100 pt-2.5 mt-2.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-600">CEP Contact Association</label>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Link CEP from Directory</label>
                  <select
                    value={formCepId}
                    onChange={e => handleCepSelect(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400"
                  >
                    <option value="">-- Do Not Associate CEP --</option>
                    {cepDirectory.map(cep => (
                      <option key={cep.id} value={cep.id}>
                        {cep.name} ({cep.number})
                      </option>
                    ))}
                    <option value="custom">-- Custom CEP Number --</option>
                  </select>
                </div>

                {formCepId === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 animate-fade-in">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">CEP Name</label>
                      <input
                        type="text"
                        value={formCepName}
                        onChange={e => setFormCepName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">CEP Number</label>
                      <input
                        type="text"
                        value={formCepNumber}
                        onChange={e => setFormCepNumber(e.target.value)}
                        placeholder="e.g. 01700000000"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleDeleteOrClear}
                  className="px-3 py-1.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-50 rounded"
                >
                  {editingEntry ? 'Delete' : 'Clear'}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded shadow-sm"
                  >
                    {!editingEntry && formEmpIds.length > 1 ? `Save ${formEmpIds.length} Entries` : 'Save Entry'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
