import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { X, ChevronsLeft, ChevronsRight, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { exportElementAsImage } from '../utils/exportImage';
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

export default function ShortLeavePage() {
  const { roster, updateRosterCell } = useApp();
  const { year, month, employees, grid } = roster;

  const [inputValue, setInputValue] = useState<string>('');

  // ── Column visibility & Team filter ──
  const [showDesig, setShowDesig] = useState<boolean>(true);
  const [showTeam, setShowTeam] = useState<boolean>(true);
  const [filterTeam, setFilterTeam] = useState<string>('All');

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
      await exportElementAsImage(tableRef.current, `ShortLeave_${MONTHS[month]}${year}.png`);
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
    let currentVal = '';
    if (!selection || selection.empId !== empId || !selection.days.includes(day)) {
      setSelection({ empId, days: [day] });
      dragStartRef.current = { empId, day };
      const entry = grid[empId]?.[day - 1];
      currentVal = entry?.shortLeave !== undefined ? String(entry.shortLeave) : '';
    } else {
      const entry = grid[selection.empId]?.[selection.days[0] - 1];
      currentVal = entry?.shortLeave !== undefined ? String(entry.shortLeave) : '';
    }
    setInputValue(currentVal);
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

  // ── Apply short leave hours ──
  const applyHours = (hoursStr: string) => {
    if (!selection) return;
    const hours = hoursStr === '' ? undefined : parseFloat(hoursStr);
    selection.days.forEach(d => updateRosterCell(selection.empId, d - 1, { shortLeave: hours }));
    closeDropdown();
    setSelection(null);
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
            {MONTHS[month]} {year} — Short Leave Hours
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {filteredEmployees.length} staff · {daysInMonth} days · Drag or Shift+Click to bulk-edit
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200/60 rounded transition-colors disabled:opacity-50"
          >
            <Download className="w-3 h-3" /> {isExporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto" ref={gridRef} onMouseLeave={() => { setHoverRow(null); setHoverCol(null); }}>
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
                    const shortLeave = entry?.shortLeave;
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
                    const holidayHighlight = holidayTitle && !isCurrentDay && shortLeave === undefined && !isSelected ? 'bg-rose-50/30' : '';
                    const currentDayHighlight = isCurrentDay && !isSelected ? 'bg-emerald-50' : '';
                    const fridayTint = isFriday && !holidayTitle && !isCurrentDay && shortLeave === undefined && !isSelected ? 'bg-rose-50/30' : '';

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
                          {shortLeave !== undefined && (
                            <span className={`inline-flex items-center justify-center w-[30px] h-[18px] text-[11px] font-bold rounded-sm border ${
                              shortLeave > 2
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
      </div>

      {/* ── Floating Popover ── */}
      {dropdown && (
        <div
          ref={dropdownRef}
          className="fixed z-50 w-48 bg-white border border-slate-200/80 shadow-lg shadow-slate-200/50 rounded animate-fade-in"
          style={{
            top: Math.min(dropdown.y + 4, window.innerHeight - 220),
            left: Math.min(dropdown.x - 50, window.innerWidth - 190),
          }}
        >
          {/* Header */}
          <div className="px-3 py-2 bg-slate-800 text-white flex items-center justify-between rounded-t">
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {selection && selection.days.length > 1 ? `Set ${selection.days.length} days` : 'Enter Hours'}
            </span>
            <button onClick={closeDropdown} className="p-0.5 hover:bg-slate-700 rounded">
              <X className="w-3 h-3" />
            </button>
          </div>
          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyHours(inputValue);
            }}
            className="p-3 space-y-3"
          >
            <div>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                autoFocus
                placeholder="Hours (e.g. 2)"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-slate-400 font-semibold text-slate-700"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => applyHours('')}
                className="flex-1 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 border border-slate-200 rounded transition-colors"
              >
                Clear
              </button>
              <button
                type="submit"
                className="flex-1 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
              >
                Apply
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
