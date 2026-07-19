import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { X, ChevronsLeft, ChevronsRight, Download, Plus, Trash2, Edit2, LayoutGrid, List } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { LeaveCode } from '../types';
import { exportElementAsImage } from '../utils/exportImage';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const LEAVE_COLORS: Record<string, string> = {
  SL: 'bg-indigo-100/80 text-indigo-800 border-indigo-200/80',
  PL: 'bg-lime-100/80 text-lime-800 border-lime-200/80',
  LFA: 'bg-pink-100/80 text-pink-800 border-pink-200/80',
  ADJ: 'bg-orange-100/80 text-orange-800 border-orange-200/80',
  A: 'bg-red-500 text-white border-red-600',
};

const LEAVE_CODES: LeaveCode[] = ['SL', 'PL', 'LFA', 'ADJ', 'A'];
const LEAVE_LABELS: Record<string, string> = {
  SL: 'Sick Leave',
  PL: 'Privilege Leave',
  LFA: 'Leave Fare Assistance',
  ADJ: 'Adjustment',
  A: 'Absent',
};

const TEAM_COLORS: Record<string, string> = {
  Electrical: 'text-amber-600 font-semibold',
  Mechanical: 'text-slate-600 font-semibold',
  Store: 'text-emerald-600 font-semibold',
  Substation: 'text-violet-600 font-semibold',
  Painter: 'text-pink-600 font-semibold', // Fallback styling for existing data
  Paints: 'text-pink-600 font-semibold',
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Build an ISO 'YYYY-MM-DD' string from a roster year/month(0-idx)/day-of-month */
function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function formatDateToDMY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/** A contiguous run of identical leave codes for one employee, used for the List view */
interface LeaveListEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeDesig: string;
  employeeTeam: string;
  startDay: number;
  endDay: number;
  totalDays: number;
  leaveType: LeaveCode;
  fromIso: string;
  toIso: string;
}

export default function LeaveStatusPage() {
  const { roster, updateRosterCell } = useApp();
  const { year, month, employees, grid } = roster;

  // ── View mode: 'grid' (calendar) | 'list' (master log) ──
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // ── Column visibility & Team filter ──
  const [showDesig, setShowDesig] = useState<boolean>(true);
  const [showTeam, setShowTeam] = useState<boolean>(true);
  const [filterTeam, setFilterTeam] = useState<string>('All');
  const [filterLeaveType, setFilterLeaveType] = useState<string>('All');
  const [filterDatePreset, setFilterDatePreset] = useState<'all' | 'today' | 'thisMonth' | 'lastMonth' | 'custom'>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // ── Add/Edit Leave modal (List view) ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LeaveListEntry | null>(null);
  const [formEmpId, setFormEmpId] = useState('');
  const [formLeaveType, setFormLeaveType] = useState<LeaveCode>('SL');
  const [formFrom, setFormFrom] = useState('');
  const [formTo, setFormTo] = useState('');
  const [formError, setFormError] = useState('');

  // ── Dynamic sticky offsets ──
  const desigLeft = BASE_LEFT; // always 304 (right after Name)
  const desigW = showDesig ? COL_W.desig : 20; // 128px or 20px collapsed
  const teamLeft = BASE_LEFT + desigW;
  const teamW = showTeam ? COL_W.team : 20;
  const frozenWidth = BASE_LEFT + desigW + teamW;

  // ── Crosshair ──
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  // ── Multi-select ──
  const [selection, setSelection] = useState<{ empId: string; days: number[] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ empId: string; day: number } | null>(null);

  // ── Dropdown ──
  const [dropdown, setDropdown] = useState<{ x: number; y: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Export ──
  const tableRef = useRef<HTMLTableElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    if (!tableRef.current) return;
    setIsExporting(true);
    try {
      await exportElementAsImage(tableRef.current, `LeaveStatus_${MONTHS[month]}${year}.png`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Computed ──
  const today = useMemo(() => new Date(), []);
  const currentDay = useMemo(() => {
    return (today.getFullYear() === year && today.getMonth() === month) ? today.getDate() : null;
  }, [year, month, today]);

  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);

  // ── Map days in this month to any active public holidays ──
  const activeHolidays = useMemo(() => {
    const map: Record<number, string> = {};
    const { publicHolidays = [] } = roster;
    publicHolidays.forEach(h => {
      const start = new Date(h.startDate + 'T00:00:00');
      const end = new Date(h.endDate + 'T00:00:00');
      // Loop over dates in the holiday range
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

  const dayHeaders = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return { day: i + 1, dow: DAYS_SHORT[d.getDay()], isFriday: d.getDay() === 5 };
    }), [year, month, daysInMonth]);

  const filteredEmployees = useMemo(() => {
    if (filterTeam === 'All') return employees;
    return employees.filter(emp => (emp.team || 'Electrical') === filterTeam);
  }, [employees, filterTeam]);

  // ── Date preset helpers (List view) ──
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }, []);

  const thisMonthRange = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(yyyy, d.getMonth() + 1, 0).getDate();
    return { start: `${yyyy}-${mm}-01`, end: `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}` };
  }, []);

  const lastMonthRange = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(yyyy, d.getMonth() + 1, 0).getDate();
    return { start: `${yyyy}-${mm}-01`, end: `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}` };
  }, []);

  // ── Derive List-view rows: group each employee's consecutive same-code leave days into ranges ──
  const leaveEntries = useMemo((): LeaveListEntry[] => {
    const entries: LeaveListEntry[] = [];
    employees.forEach(emp => {
      const empGrid = grid[emp.id] || [];
      let curCode: LeaveCode | '' = '';
      let curStart = 0;
      for (let d = 1; d <= daysInMonth + 1; d++) {
        const code = d <= daysInMonth ? (empGrid[d - 1]?.leave || '') : '';
        if (code !== curCode) {
          if (curCode) {
            const endDay = d - 1;
            entries.push({
              id: `${emp.id}_${curStart}`,
              employeeId: emp.id,
              employeeName: emp.name,
              employeeDesig: emp.designation,
              employeeTeam: emp.team || 'Electrical',
              startDay: curStart,
              endDay,
              totalDays: endDay - curStart + 1,
              leaveType: curCode as LeaveCode,
              fromIso: isoDate(year, month, curStart),
              toIso: isoDate(year, month, endDay),
            });
          }
          curCode = code;
          curStart = d;
        }
      }
    });
    return entries;
  }, [employees, grid, daysInMonth, year, month]);

  const filteredLeaveList = useMemo(() => {
    return leaveEntries.filter(en => {
      if (filterTeam !== 'All' && en.employeeTeam !== filterTeam) return false;
      if (filterLeaveType !== 'All' && en.leaveType !== filterLeaveType) return false;

      if (filterDatePreset === 'today') {
        if (en.fromIso !== todayStr) return false;
      } else if (filterDatePreset === 'thisMonth') {
        if (en.fromIso < thisMonthRange.start || en.fromIso > thisMonthRange.end) return false;
      } else if (filterDatePreset === 'lastMonth') {
        if (en.fromIso < lastMonthRange.start || en.fromIso > lastMonthRange.end) return false;
      } else if (filterDatePreset === 'custom') {
        if (filterStartDate && en.fromIso < filterStartDate) return false;
        if (filterEndDate && en.fromIso > filterEndDate) return false;
      }

      return true;
    }).sort((a, b) => b.fromIso.localeCompare(a.fromIso));
  }, [leaveEntries, filterTeam, filterLeaveType, filterDatePreset, filterStartDate, filterEndDate, todayStr, thisMonthRange, lastMonthRange]);

  const totalVisibleDays = useMemo(() => {
    return filteredLeaveList.reduce((sum, en) => sum + en.totalDays, 0);
  }, [filteredLeaveList]);

  // ── Close dropdown ──
  const closeDropdown = useCallback(() => setDropdown(null), []);

  // ── Mouse handlers ──
  const handleCellMouseDown = (e: React.MouseEvent, empId: string, day: number) => {
    if (e.button !== 0) return;
    if (selection?.empId === empId && selection.days.includes(day) && !e.shiftKey) return;

    closeDropdown();

    // Shift-extend
    if (e.shiftKey && selection?.empId === empId) {
      const anchor = dragStartRef.current?.day ?? selection.days[0];
      const lo = Math.min(anchor, day);
      const hi = Math.max(anchor, day);
      setSelection({ empId, days: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) });
      return;
    }

    // Start fresh drag
    setIsDragging(true);
    dragStartRef.current = { empId, day };
    setSelection({ empId, days: [day] });
  };

  const handleCellMouseEnter = (empId: string, day: number) => {
    setHoverRow(empId);
    setHoverCol(day);
    if (isDragging && dragStartRef.current?.empId === empId) {
      const anchor = dragStartRef.current.day;
      const lo = Math.min(anchor, day);
      const hi = Math.max(anchor, day);
      setSelection({ empId, days: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) });
    }
  };

  const handleCellClick = (e: React.MouseEvent, empId: string, day: number) => {
    e.stopPropagation();
    if (!selection || selection.empId !== empId || !selection.days.includes(day)) {
      setSelection({ empId, days: [day] });
      dragStartRef.current = { empId, day };
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdown({ x: rect.left, y: rect.bottom });
  };

  // ── Global listeners ──
  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    const onMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setSelection(null);
        closeDropdown();
      } else if (dropdown) {
        closeDropdown();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelection(null); closeDropdown(); }
    };
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dropdown, closeDropdown]);

  // ── Apply duty code ──
  const applyCode = (code: LeaveCode) => {
    if (!selection) return;
    selection.days.forEach(d => updateRosterCell(selection.empId, d - 1, { leave: code }));
    closeDropdown();
    setSelection(null);
  };

  // ── List view: open modal for adding a new leave range ──
  const openAddModal = () => {
    setEditingEntry(null);
    setFormEmpId(employees[0]?.id || '');
    setFormLeaveType('SL');
    const defaultDay = currentDay || 1;
    setFormFrom(isoDate(year, month, defaultDay));
    setFormTo(isoDate(year, month, defaultDay));
    setFormError('');
    setShowAddModal(true);
  };

  // ── List view: open modal for editing an existing leave range ──
  const openEditModal = (entry: LeaveListEntry) => {
    setEditingEntry(entry);
    setFormEmpId(entry.employeeId);
    setFormLeaveType(entry.leaveType);
    setFormFrom(entry.fromIso);
    setFormTo(entry.toIso);
    setFormError('');
    setShowAddModal(true);
  };

  // ── List view: save (add or edit) a leave range ──
  const handleSaveLeave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formEmpId) { setFormError('Please select an employee.'); return; }
    if (!formLeaveType) { setFormError('Please select a leave type.'); return; }
    if (!formFrom || !formTo) { setFormError('Please fill in both From and To dates.'); return; }
    if (formFrom > formTo) { setFormError('From date must be on or before To date.'); return; }

    const parseDay = (iso: string): number | null => {
      const [y, m, d] = iso.split('-').map(Number);
      if (y !== year || (m - 1) !== month) return null;
      return d;
    };

    const fromDay = parseDay(formFrom);
    const toDay = parseDay(formTo);
    if (fromDay === null || toDay === null) {
      setFormError(`Dates must fall within ${MONTHS[month]} ${year}, the currently selected roster month.`);
      return;
    }

    // If editing, clear out the original range first (in case it shrank or moved)
    if (editingEntry) {
      for (let d = editingEntry.startDay; d <= editingEntry.endDay; d++) {
        updateRosterCell(editingEntry.employeeId, d - 1, { leave: '' as LeaveCode });
      }
    }

    for (let d = fromDay; d <= toDay; d++) {
      updateRosterCell(formEmpId, d - 1, { leave: formLeaveType });
    }

    setShowAddModal(false);
  };

  // ── List view: delete a leave range ──
  const handleDeleteLeave = (entry: LeaveListEntry) => {
    if (!confirm('Are you sure you want to delete this leave record?')) return;
    for (let d = entry.startDay; d <= entry.endDay; d++) {
      updateRosterCell(entry.employeeId, d - 1, { leave: '' as LeaveCode });
    }
  };

  // ── Shared shadow class for last frozen column ──
  const shadowDivider = 'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]';
  const shadowDividerBody = 'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]';

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200/60">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
            {viewMode === 'grid' ? `${MONTHS[month]} ${year} — Leave Status` : 'Leave Log — Master Directory'}
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {viewMode === 'grid'
              ? `${filteredEmployees.length} staff · ${daysInMonth} days · Drag or Shift+Click to bulk-edit`
              : `${filteredLeaveList.length} total records · ${totalVisibleDays} days on leave`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Add Leave Button (shows in List mode) */}
          {viewMode === 'list' && (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Log Leave
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
              title="Grid Calendar"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
          </div>

          {/* Team Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Team:</span>
            <select
              value={filterTeam}
              onChange={e => setFilterTeam(e.target.value)}
              className="px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 font-semibold text-slate-700"
            >
              <option value="All">All Teams</option>
              <option value="Electrical">Electrical</option>
              <option value="Mechanical">Mechanical</option>
              <option value="Store">Store</option>
              <option value="Substation">Substation</option>
              <option value="Paints">Paints</option>
            </select>
          </div>

          {/* Leave Type Filter (replaces CEP filter from Overtime) */}
          {viewMode === 'list' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">Leave Type:</span>
              <select
                value={filterLeaveType}
                onChange={e => setFilterLeaveType(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 font-semibold text-slate-700 max-w-[130px] truncate"
              >
                <option value="All">All Types</option>
                {LEAVE_CODES.map(code => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Filter */}
          {viewMode === 'list' && (
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

      {/* ── Grid / List Content ── */}
      <div className="flex-1 overflow-auto" ref={gridRef} onMouseLeave={() => { setHoverRow(null); setHoverCol(null); }}>
        {viewMode === 'grid' ? (
          <table
            ref={tableRef}
            className="border-separate border-spacing-0 text-[13px] select-none mx-auto"
            style={{ width: `${frozenWidth + 36 * daysInMonth}px`, minWidth: `${frozenWidth + 36 * daysInMonth}px` }}
          >
            {/* ── Header row 1: Day names ── */}
            <thead>
              <tr className="bg-slate-800 text-white">
                {/* SL */}
                <th rowSpan={2} className={`sticky top-0 ${COL.sl.left} z-40 bg-slate-800 ${COL.sl.w} text-center align-middle text-[14px] font-medium border-r border-slate-700`}>#</th>
                {/* Staff ID */}
                <th rowSpan={2} className={`sticky top-0 ${COL.id.left} z-40 bg-slate-800 ${COL.id.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-700`}>Staff ID</th>
                {/* Name */}
                <th rowSpan={2} className={`sticky top-0 ${COL.name.left} z-40 bg-slate-800 ${COL.name.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-700`}>Name</th>
                {/* Designation */}
                {showDesig ? (
                  <th rowSpan={2} className={`sticky top-0 z-40 bg-slate-800 ${COL.desig.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-600`} style={{ left: desigLeft }}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Designation</span>
                      <button onClick={() => setShowDesig(false)} className="p-0 ml-0.5 text-slate-400 hover:text-white transition-colors" title="Collapse">
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ) : (
                  <th rowSpan={2} className={`sticky top-0 z-40 bg-slate-700 w-5 min-w-[20px] max-w-[20px] text-center align-middle border-r border-slate-600 cursor-pointer hover:bg-slate-600 transition-colors`} style={{ left: desigLeft }} onClick={() => setShowDesig(true)} title="Expand Designation">
                    <ChevronsRight className="w-3 h-3 mx-auto text-slate-400" />
                  </th>
                )}
                {/* Team */}
                {showTeam ? (
                  <th rowSpan={2} className={`sticky top-0 z-40 bg-slate-800 ${COL.team.w} px-2 text-center align-middle text-[14px] font-medium border-r border-slate-600 ${shadowDivider}`} style={{ left: teamLeft }}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Team</span>
                      <button onClick={() => setShowTeam(false)} className="p-0 ml-0.5 text-slate-400 hover:text-white transition-colors" title="Collapse">
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ) : (
                  <th rowSpan={2} className={`sticky top-0 z-40 bg-slate-700 w-5 min-w-[20px] max-w-[20px] text-center align-middle border-r border-slate-600 cursor-pointer hover:bg-slate-600 transition-colors ${shadowDivider}`} style={{ left: teamLeft }} onClick={() => setShowTeam(true)} title="Expand Team">
                    <ChevronsRight className="w-3 h-3 mx-auto text-slate-400" />
                  </th>
                )}
                {/* Day columns */}
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
              {/* ── Header row 2: Day numbers ── */}
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

            {/* ── Body ── */}
            <tbody>
              {filteredEmployees.map((emp, idx) => {
                const empGrid = grid[emp.id] || [];
                const isRowHovered = hoverRow === emp.id;
                const bgBase = isRowHovered ? 'bg-slate-300' : idx % 2 === 1 ? 'bg-slate-100' : 'bg-slate-50';

                return (
                  <tr
                    key={emp.id}
                    className={`transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : ''} ${isRowHovered ? '!bg-slate-100/70' : ''}`}
                  >
                    {/* SL */}
                    <td className={`sticky ${COL.sl.left} z-20 ${COL.sl.w} h-6 text-center text-slate-400 border-r border-b border-slate-200/60 transition-colors ${bgBase}`}>
                      {idx + 1}
                    </td>
                    {/* Staff ID */}
                    <td className={`sticky ${COL.id.left} z-20 ${COL.id.w} h-6 px-2 text-slate-700 font-semibold border-r border-b border-slate-200/60 whitespace-nowrap transition-colors ${bgBase}`}>
                      {emp.id}
                    </td>
                    {/* Name */}
                    <td className={`sticky ${COL.name.left} z-20 ${COL.name.w} h-6 px-2 text-[13.5px] font-bold text-slate-800 border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${bgBase}`}>
                      {emp.name}
                    </td>
                    {/* Designation */}
                    {showDesig ? (
                      <td className={`sticky z-20 ${COL.desig.w} h-6 px-2 text-slate-500 text-xs border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${bgBase}`} style={{ left: desigLeft }}>
                        {emp.designation}
                      </td>
                    ) : (
                      <td className={`sticky z-20 w-5 min-w-[20px] max-w-[20px] h-6 border-r border-b border-slate-200/60 transition-colors ${bgBase}`} style={{ left: desigLeft }} />
                    )}
                    {/* Team */}
                    {showTeam ? (
                      <td className={`sticky z-20 ${COL.team.w} h-6 px-2 text-xs border-r border-b border-slate-200/60 whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${shadowDividerBody} ${bgBase} ${TEAM_COLORS[emp.team || 'Electrical'] || 'text-slate-500'}`} style={{ left: teamLeft }}>
                        {emp.team || 'Electrical'}
                      </td>
                    ) : (
                      <td className={`sticky z-20 w-5 min-w-[20px] max-w-[20px] h-6 border-r border-b border-slate-200/60 transition-colors ${shadowDividerBody} ${bgBase}`} style={{ left: teamLeft }} />
                    )}

                    {/* Day cells */}
                    {dayHeaders.map(({ day, isFriday }) => {
                      const entry = empGrid[day - 1];
                      const leave = entry?.leave || '';
                      const isColHovered = hoverCol === day;
                      const isSelected = selection?.empId === emp.id && selection.days.includes(day);

                      // Crosshair: row+col tint without covering shift badges
                      const crosshair = (isRowHovered && isColHovered && !isSelected)
                        ? '!bg-slate-200/60'
                        : (isColHovered && !isSelected)
                          ? 'bg-slate-100/50'
                          : '';

                      const isCurrentDay = day === currentDay;
                      const holidayTitle = activeHolidays[day];
                      const holidayHighlight = holidayTitle && !isCurrentDay && !leave && !isSelected ? 'bg-rose-50/30' : '';
                      const currentDayHighlight = isCurrentDay && !isSelected ? 'bg-emerald-50' : '';
                      const fridayTint = isFriday && !holidayTitle && !isCurrentDay && !leave && !isSelected ? 'bg-rose-50/30' : '';

                      return (
                        <td
                          key={day}
                          title={holidayTitle ? `Public Holiday: ${holidayTitle}` : undefined}
                          className={`relative w-9 min-w-[36px] max-w-[36px] h-6 p-0 text-center align-middle border-r border-b border-slate-200/60 cursor-cell transition-colors
                          ${currentDayHighlight} ${holidayHighlight} ${fridayTint} ${crosshair}
                          ${isSelected ? '!bg-sky-100/60 shadow-[inset_0_0_0_1.5px_#3b82f6]' : ''}`}
                          onMouseDown={e => handleCellMouseDown(e, emp.id, day)}
                          onMouseEnter={() => handleCellMouseEnter(emp.id, day)}
                          onClick={e => handleCellClick(e, emp.id, day)}
                        >
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {leave && (
                              <span className={`inline-flex items-center justify-center w-[30px] h-[18px] text-[11px] font-bold rounded-sm border ${LEAVE_COLORS[leave] || ''}`}>
                                {leave}
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
        ) : (
          /* ── MASTER LIST VIEW ── */
          <div className="max-w-7xl mx-auto p-5">
            <div className="bg-white border border-slate-200/60 rounded overflow-hidden">
              <table ref={tableRef} className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/60 border-b border-slate-200/60 text-slate-500 font-semibold">
                    <th className="px-4 py-1.5 w-12 text-center">#</th>
                    <th className="px-4 py-1.5 w-24 text-center">Staff ID</th>
                    <th className="px-4 py-1.5 text-center">Name</th>
                    <th className="px-4 py-1.5 text-center">Designation</th>
                    <th className="px-4 py-1.5 text-center">Team</th>
                    <th className="px-4 py-1.5 text-center">From</th>
                    <th className="px-4 py-1.5 text-center">To</th>
                    <th className="px-4 py-1.5 text-center">Total Days</th>
                    <th className="px-4 py-1.5 text-center">Leave Type</th>
                    <th className="px-4 py-1.5 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaveList.map((en, idx) => (
                    <tr key={en.id} className="border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-1 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-1 text-slate-700 font-semibold">{en.employeeId}</td>
                      <td className="px-4 py-1 font-bold text-slate-800">{en.employeeName}</td>
                      <td className="px-4 py-1 text-slate-600">{en.employeeDesig}</td>
                      <td className={`px-4 py-1 ${TEAM_COLORS[en.employeeTeam] || 'text-slate-500'}`}>{en.employeeTeam}</td>
                      <td className="px-4 py-1 text-slate-700 font-medium">{formatDateToDMY(en.fromIso)}</td>
                      <td className="px-4 py-1 text-slate-700 font-medium">{formatDateToDMY(en.toIso)}</td>
                      <td className="px-4 py-1 text-slate-800 font-bold">{en.totalDays}d</td>
                      <td className="px-4 py-1">
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-bold rounded-sm border ${LEAVE_COLORS[en.leaveType] || ''}`}>
                          {en.leaveType}
                        </span>
                      </td>
                      <td className="px-4 py-1 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => openEditModal(en)}
                            className="p-1 text-sky-600 hover:bg-sky-50 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteLeave(en)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredLeaveList.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-xs">
                        No leave records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Dropdown ── */}
      {dropdown && (
        <div
          ref={dropdownRef}
          className="fixed z-50 w-44 bg-white border border-slate-200/80 shadow-lg shadow-slate-200/50 rounded animate-fade-in"
          style={{
            top: Math.min(dropdown.y + 4, window.innerHeight - 220),
            left: Math.min(dropdown.x - 50, window.innerWidth - 190),
          }}
        >
          {/* Header */}
          <div className="px-3 py-2 bg-slate-800 text-white flex items-center justify-between rounded-t">
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {selection && selection.days.length > 1 ? `Set ${selection.days.length} cells` : 'Assign Code'}
            </span>
            <button onClick={closeDropdown} className="p-0.5 hover:bg-slate-700 rounded">
              <X className="w-3 h-3" />
            </button>
          </div>
          {/* Options */}
          <div className="p-2 space-y-1">
            {LEAVE_CODES.map(code => (
              <button
                key={code}
                onClick={() => applyCode(code)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors hover:opacity-80 border ${LEAVE_COLORS[code]}`}
              >
                <span className="w-5 text-center">{code}</span>
                <span className="text-[10px] font-normal opacity-70">{LEAVE_LABELS[code]}</span>
              </button>
            ))}
            <div className="border-t border-slate-100 mt-1.5 pt-1.5">
              <button
                onClick={() => applyCode('' as LeaveCode)}
                className="w-full py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded transition-colors"
              >
                Clear cell{selection && selection.days.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log/Edit Leave Modal (List view) ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/15 backdrop-blur-[2px]" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md animate-fade-in border border-slate-200/60">
            <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center rounded-t-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {editingEntry ? 'Edit Leave Record' : 'Log Leave'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-300 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeave} className="p-4 space-y-3">
              {formError && <p className="text-[11px] text-rose-500 font-semibold">{formError}</p>}

              {/* Employee Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Employee *</label>
                <select
                  value={formEmpId}
                  onChange={e => setFormEmpId(e.target.value)}
                  disabled={!!editingEntry}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id}) — {emp.designation}
                    </option>
                  ))}
                </select>
              </div>

              {/* Leave Type */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Leave Type *</label>
                <select
                  value={formLeaveType}
                  onChange={e => setFormLeaveType(e.target.value as LeaveCode)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400"
                >
                  {LEAVE_CODES.map(code => (
                    <option key={code} value={code}>
                      {code} - {LEAVE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">From *</label>
                  <input
                    type="date"
                    value={formFrom}
                    onChange={e => setFormFrom(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">To *</label>
                  <input
                    type="date"
                    value={formTo}
                    onChange={e => setFormTo(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 -mt-1">
                Dates must fall within {MONTHS[month]} {year}, the currently selected roster month.
              </p>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
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
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
