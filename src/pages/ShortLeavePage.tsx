import { useState, useMemo, useRef } from 'react';
import { X, ChevronsLeft, ChevronsRight, Download, Plus, Trash2, Edit2, LayoutGrid, List } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ShortLeaveEntry } from '../types';
import { exportElementAsImage } from '../utils/exportImage';
import TeamFilterDropdown from '../components/TeamFilterDropdown';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

  const fromMin = fH * 60 + fM;
  let toMin = tH * 60 + tM;

  if (toMin < fromMin) {
    // Crosses midnight
    toMin += 24 * 60;
  }

  return parseFloat(((toMin - fromMin) / 60).toFixed(2));
}

export default function ShortLeavePage() {
  const { roster, updateShortLeaveEntries } = useApp();
  const { year, month, employees, shortLeaveEntries = [] } = roster;

  // ── View mode: 'grid' (day-by-day view) | 'list' (clock-time log) ──
  // Both views read/write the SAME shortLeaveEntries array AND share the same
  // Log/Edit modal, so they always stay in sync — no separate grid-only UI.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // ── Column visibility & Team filter ──
  const [showDesig, setShowDesig] = useState<boolean>(true);
  const [showTeam, setShowTeam] = useState<boolean>(true);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [filterDatePreset, setFilterDatePreset] = useState<'all' | 'today' | 'thisMonth' | 'lastMonth' | 'custom'>('thisMonth');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // ── Log/Edit Short Leave modal (List view) ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ShortLeaveEntry | null>(null);
  const [formEmpId, setFormEmpId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formFrom, setFormFrom] = useState('');
  const [formTo, setFormTo] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formError, setFormError] = useState('');

  // ── Dynamic sticky offsets ──
  const desigLeft = BASE_LEFT; // always 304 (right after Name)
  const desigW = showDesig ? COL_W.desig : 20; // 128px or 20px collapsed
  const teamLeft = BASE_LEFT + desigW;
  const teamW = showTeam ? COL_W.team : 20;
  const frozenWidth = BASE_LEFT + desigW + teamW;

  // ── Crosshair (Grid view hover highlight) ──
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  // ── Export ──
  const tableRef = useRef<HTMLTableElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    if (!tableRef.current) return;
    setIsExporting(true);
    try {
      await exportElementAsImage(tableRef.current, `ShortLeave_${viewMode}_${MONTHS[month]}${year}.png`);
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

  // ── Grid view reads from the SAME shortLeaveEntries array as the List view ──
  const currentMonthShortLeaveMap = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    shortLeaveEntries.forEach(entry => {
      const entryDate = new Date(entry.date + 'T00:00:00');
      if (entryDate.getFullYear() === year && entryDate.getMonth() === month) {
        const day = entryDate.getDate();
        if (!map[entry.employeeId]) map[entry.employeeId] = {};
        map[entry.employeeId][day] = (map[entry.employeeId][day] || 0) + entry.totalHours;
      }
    });
    return map;
  }, [shortLeaveEntries, year, month]);

  const filteredEmployees = useMemo(() => {
    if (selectedEmpIds.size === 0) return employees;
    return employees.filter(emp => selectedEmpIds.has(emp.id));
  }, [employees, selectedEmpIds]);

  // ── Date preset helpers (List view) ──
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }, []);

  const thisMonthRange = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const lastDay = new Date(yyyy, d.getMonth() + 1, 0).getDate();
    return { start: `${yyyy}-${mm}-01`, end: `${yyyy}-${mm}-${pad2(lastDay)}` };
  }, []);

  const lastMonthRange = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const lastDay = new Date(yyyy, d.getMonth() + 1, 0).getDate();
    return { start: `${yyyy}-${mm}-01`, end: `${yyyy}-${mm}-${pad2(lastDay)}` };
  }, []);

  const filteredShortLeaveList = useMemo(() => {
    return shortLeaveEntries.map(sl => {
      const emp = employees.find(e => e.id === sl.employeeId);
      return {
        ...sl,
        employeeName: emp ? emp.name : 'Unknown',
        employeeDesig: emp ? emp.designation : '-',
        employeeTeam: emp ? (emp.team || 'Electrical') : '-',
      };
    }).filter(sl => {
      if (selectedEmpIds.size > 0 && !selectedEmpIds.has(sl.employeeId)) return false;

      if (filterDatePreset === 'today') {
        if (sl.date !== todayStr) return false;
      } else if (filterDatePreset === 'thisMonth') {
        if (sl.date < thisMonthRange.start || sl.date > thisMonthRange.end) return false;
      } else if (filterDatePreset === 'lastMonth') {
        if (sl.date < lastMonthRange.start || sl.date > lastMonthRange.end) return false;
      } else if (filterDatePreset === 'custom') {
        if (filterStartDate && sl.date < filterStartDate) return false;
        if (filterEndDate && sl.date > filterEndDate) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [shortLeaveEntries, employees, selectedEmpIds, filterDatePreset, filterStartDate, filterEndDate, todayStr, thisMonthRange, lastMonthRange]);

  const totalVisibleHours = useMemo(() => {
    return filteredShortLeaveList.reduce((sum, sl) => sum + sl.totalHours, 0);
  }, [filteredShortLeaveList]);

  // ── List view: time change auto-calculates hours ──
  const handleTimesChange = (from: string, to: string) => {
    setFormFrom(from);
    setFormTo(to);
    const duration = calculateDuration(from, to);
    setFormHours(duration > 0 ? String(duration) : '');
  };

  // ── Grid view: find an existing entry for an employee/date, so clicking a
  // filled cell edits (and keeps) the existing values instead of overwriting them ──
  const findEntryForCell = (empId: string, dateStr: string) =>
    shortLeaveEntries.find(sl => sl.employeeId === empId && sl.date === dateStr);

  // ── List view: open modal for Adding ──
  const openAddModal = (initialEmpId = '', initialDate = '') => {
    setEditingEntry(null);
    setFormEmpId(initialEmpId || (employees[0]?.id || ''));
    setFormDate(initialDate || new Date().toISOString().split('T')[0]);
    setFormFrom('10:00');
    setFormTo('12:00');
    setFormHours('2');
    setFormError('');
    setShowAddModal(true);
  };

  // ── List view: open modal for Editing ──
  const openEditModal = (entry: ShortLeaveEntry) => {
    setEditingEntry(entry);
    setFormEmpId(entry.employeeId);
    setFormDate(entry.date);
    setFormFrom(entry.from);
    setFormTo(entry.to);
    setFormHours(String(entry.totalHours));
    setFormError('');
    setShowAddModal(true);
  };

  // ── List view: save/submit form ──
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const empId = formEmpId;
    const date = formDate;
    const from = formFrom;
    const to = formTo;
    const hours = parseFloat(formHours);

    if (!empId) { setFormError('Please select an employee.'); return; }
    if (!date) { setFormError('Please select a date.'); return; }
    if (!from || !to) { setFormError('Please fill in both From and To times.'); return; }
    if (isNaN(hours) || hours <= 0) { setFormError('Please enter a valid hours value.'); return; }

    const newEntry: ShortLeaveEntry = {
      id: editingEntry ? editingEntry.id : `sl_${Date.now()}`,
      employeeId: empId,
      date,
      from,
      to,
      totalHours: hours,
    };

    let updated: ShortLeaveEntry[];
    if (editingEntry) {
      updated = shortLeaveEntries.map(sl => sl.id === editingEntry.id ? newEntry : sl);
    } else {
      updated = [...shortLeaveEntries, newEntry];
    }

    updateShortLeaveEntries(updated);
    setShowAddModal(false);
  };

  // ── List view: delete record ──
  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this Short Leave entry?')) {
      updateShortLeaveEntries(shortLeaveEntries.filter(sl => sl.id !== id));
    }
  };

  // Delete the entry being edited (and close the modal), or — if there's no
  // existing entry yet (Add mode) — just clear the editable fields instead.
  const handleDeleteOrClear = () => {
    if (editingEntry) {
      if (confirm('Are you sure you want to delete this Short Leave entry?')) {
        updateShortLeaveEntries(shortLeaveEntries.filter(sl => sl.id !== editingEntry.id));
        setShowAddModal(false);
      }
      return;
    }
    setFormEmpId('');
    setFormDate('');
    setFormFrom('');
    setFormTo('');
    setFormHours('');
    setFormError('');
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
            {viewMode === 'grid' ? `${MONTHS[month]} ${year} — Short Leave Hours` : 'Short Leave Log — Master Directory'}
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {viewMode === 'grid'
              ? `${filteredEmployees.length} staff · ${daysInMonth} days · Click a day to log Short Leave`
              : `${filteredShortLeaveList.length} total entries recorded · ${totalVisibleHours} hours Short Leave`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Add Short Leave Button (shows in List mode) */}
          {viewMode === 'list' && (
            <button
              onClick={() => openAddModal()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Log Short Leave
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
          </div>

          {/* Team Filter */}
          <TeamFilterDropdown
            employees={employees}
            selected={selectedEmpIds}
            onChange={setSelectedEmpIds}
          />

          {/* Date Filter (List view) */}
          {viewMode === 'list' && (
            <div className="flex items-center gap-1.5 animate-fade-in">
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
                <div className="flex items-center gap-1 animate-fade-in">
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
          /* ── GRID TABLE VIEW (day-by-day view of shortLeaveEntries) ── */
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
                const empShortLeave = currentMonthShortLeaveMap[emp.id] || {};
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
                      const shortLeave = empShortLeave[day];
                      const isColHovered = hoverCol === day;

                      // Crosshair: row+col hover tint
                      const crosshair = (isRowHovered && isColHovered)
                        ? '!bg-slate-200/60'
                        : isColHovered
                          ? 'bg-slate-100/50'
                          : '';

                      const isCurrentDay = day === currentDay;
                      const holidayTitle = activeHolidays[day];
                      const holidayHighlight = holidayTitle && !isCurrentDay && shortLeave === undefined ? 'bg-rose-50/30' : '';
                      const currentDayHighlight = isCurrentDay ? 'bg-emerald-50' : '';
                      const fridayTint = isFriday && !holidayTitle && !isCurrentDay && shortLeave === undefined ? 'bg-rose-50/30' : '';

                      const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;

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
                            {shortLeave !== undefined && (
                              <span className={`inline-flex items-center justify-center w-[30px] h-[18px] text-[11px] font-bold rounded-sm border ${shortLeave > 2
                                ? 'bg-rose-100/80 text-rose-800 border-rose-200/80'
                                : 'bg-sky-100/80 text-sky-800 border-sky-200/80'
                                }`}>
                                {shortLeave}h
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
          /* ── MASTER LIST VIEW (clock-time log) ── */
          <div className="max-w-6xl mx-auto p-5">
            <div className="bg-white border border-slate-200/60 rounded overflow-hidden">
              <table ref={tableRef} className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/60 border-b border-slate-200/60 text-slate-500 font-semibold">
                    <th className="px-4 py-1.5 w-12 text-center">#</th>
                    <th className="px-4 py-1.5 w-24 text-center">Staff ID</th>
                    <th className="px-4 py-1.5 text-center">Name</th>
                    <th className="px-4 py-1.5 text-center">Designation</th>
                    <th className="px-4 py-1.5 text-center">Team</th>
                    <th className="px-4 py-1.5 text-center">Date</th>
                    <th className="px-4 py-1.5 text-center">From</th>
                    <th className="px-4 py-1.5 text-center">To</th>
                    <th className="px-4 py-1.5 text-center">Total Hours</th>
                    <th className="px-4 py-1.5 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShortLeaveList.map((sl, idx) => (
                    <tr key={sl.id} className="border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-1 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-1 text-slate-700 font-semibold">{sl.employeeId}</td>
                      <td className="px-4 py-1 font-bold text-slate-800">{sl.employeeName}</td>
                      <td className="px-4 py-1 text-slate-600">{sl.employeeDesig}</td>
                      <td className={`px-4 py-1 ${TEAM_COLORS[sl.employeeTeam] || 'text-slate-500'}`}>{sl.employeeTeam}</td>
                      <td className="px-4 py-1 text-slate-700 font-medium">{formatDateToDMY(sl.date)}</td>
                      <td className="px-4 py-1 text-slate-600 font-mono">{formatTimeTo12H(sl.from)}</td>
                      <td className="px-4 py-1 text-slate-600 font-mono">{formatTimeTo12H(sl.to)}</td>
                      <td className="px-4 py-1 text-slate-800 font-bold">{sl.totalHours}h</td>
                      <td className="px-4 py-1 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => openEditModal(sl)}
                            className="p-1 text-sky-600 hover:bg-sky-50 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(sl.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredShortLeaveList.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-xs">
                        No short leave records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Log/Edit Short Leave Modal (shared by Grid and List views) ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/15 backdrop-blur-[2px]" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md animate-fade-in border border-slate-200/60">
            <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center rounded-t-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {editingEntry ? 'Edit Short Leave Entry' : 'Log Short Leave Hours'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-300 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-3">
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
              <p className="text-[10px] text-slate-400 -mt-1">
                Total Hours auto-fills from From/To but can be overridden manually.
              </p>

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
                    Save Entry
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
