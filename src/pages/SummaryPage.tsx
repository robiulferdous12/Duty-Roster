import { useState, useMemo, useRef } from 'react';
import { ChevronsLeft, ChevronsRight, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { DutyCode, LeaveCode } from '../types';
import { exportElementAsImage } from '../utils/exportImage';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DUTY_COLORS: Record<string, string> = {
  A: 'bg-sky-100/80 text-sky-800 border-sky-200/80',
  B: 'bg-emerald-100/80 text-emerald-800 border-emerald-200/80',
  C: 'bg-amber-100/80 text-amber-800 border-amber-200/80',
  M: 'bg-violet-100/80 text-violet-800 border-violet-200/80',
  H: 'bg-rose-50 text-rose-700 border-rose-200/80',
};

const LEAVE_COLORS: Record<string, string> = {
  SL: 'bg-indigo-100/80 text-indigo-800 border-indigo-200/80',
  PL: 'bg-lime-100/80 text-lime-800 border-lime-200/80',
  LFA: 'bg-pink-100/80 text-pink-800 border-pink-200/80',
  ADJ: 'bg-orange-100/80 text-orange-800 border-orange-200/80',
  A: 'bg-red-500 text-white border-red-500',
};

// Overtime and Short Leave cells always use their own distinct, refined color — never the shift's pastel color
const OT_COLOR = 'bg-teal-700/90 text-white border-teal-800/90';
const SHORT_LEAVE_COLOR = 'bg-violet-800/90 text-white border-violet-900/90';

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

// ── Format hours without a trailing ".0" ──
function fmtHrs(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

export default function SummaryPage() {
  const { roster } = useApp();
  const { year, month, employees, grid } = roster;

  // ── Column visibility & Team filter ──
  const [showDesig, setShowDesig] = useState<boolean>(true);
  const [showTeam, setShowTeam] = useState<boolean>(true);
  const [filterTeam, setFilterTeam] = useState<string>('All');

  // ── Export ──
  const tableRef = useRef<HTMLTableElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    if (!tableRef.current) return;
    setIsExporting(true);
    try {
      await exportElementAsImage(tableRef.current, `Summary_${MONTHS[month]}${year}.png`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Dynamic sticky offsets ──
  const desigLeft = BASE_LEFT;
  const desigW = showDesig ? COL_W.desig : 20;
  const teamLeft = BASE_LEFT + desigW;
  const teamW = showTeam ? COL_W.team : 20;
  const frozenWidth = BASE_LEFT + desigW + teamW;

  // ── Crosshair ──
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

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

  // ── Map overtime entries in this month to { empId: { day: totalHours } } ──
  const activeOvertime = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    const entries = roster.overtime || [];
    entries.forEach(ot => {
      const d = new Date(ot.date + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map[ot.employeeId]) map[ot.employeeId] = {};
        map[ot.employeeId][day] = (map[ot.employeeId][day] || 0) + (ot.totalHours || 0);
      }
    });
    return map;
  }, [roster.overtime, year, month]);

  // ── Map short leave entries (from the Short Leave page) in this month to { empId: { day: totalHours } } ──
  const activeShortLeave = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    const entries = roster.shortLeaveEntries || [];
    entries.forEach(sl => {
      const d = new Date(sl.date + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map[sl.employeeId]) map[sl.employeeId] = {};
        map[sl.employeeId][day] = (map[sl.employeeId][day] || 0) + (sl.totalHours || 0);
      }
    });
    return map;
  }, [roster.shortLeaveEntries, year, month]);

  const dayHeaders = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return { day: i + 1, dow: DAYS_SHORT[d.getDay()], isFriday: d.getDay() === 5 };
    }), [year, month, daysInMonth]);

  const filteredEmployees = useMemo(() => {
    if (filterTeam === 'All') return employees;
    return employees.filter(emp => (emp.team || 'Electrical') === filterTeam);
  }, [employees, filterTeam]);

  // ── Merge logic: leave > overtime ± short leave > plain shift ──
  // Friday/Public Holiday override: for every team except Substation, the column
  // is forced to 'H' regardless of the assigned shift — unless overtime was
  // logged that day, in which case the normal Shift+Overtime formatting is kept.
  function getCellDisplay(
    empId: string,
    day: number,
    duty: DutyCode | '',
    leave: LeaveCode | '',
    team: string,
    isHolidayOrFriday: boolean
  ) {
    const otHrs = activeOvertime[empId]?.[day];
    const shortLeaveHrs = activeShortLeave[empId]?.[day];

    if (leave) {
      return { text: leave, className: LEAVE_COLORS[leave] || '' };
    }

    const isSubstation = team === 'Substation';
    const forceHoliday = isHolidayOrFriday && !isSubstation;

    if (otHrs !== undefined && shortLeaveHrs !== undefined) {
      return { text: `${duty}+${fmtHrs(otHrs)}-${fmtHrs(shortLeaveHrs)}`, className: OT_COLOR };
    }
    if (otHrs !== undefined) {
      return { text: `${duty}+${fmtHrs(otHrs)}`, className: OT_COLOR };
    }

    // No overtime logged — Friday/Holiday override wins over shift/short-leave display.
    if (forceHoliday) {
      return { text: 'H', className: DUTY_COLORS.H };
    }

    if (shortLeaveHrs !== undefined) {
      return { text: `${duty}-${fmtHrs(shortLeaveHrs)}`, className: SHORT_LEAVE_COLOR };
    }
    if (duty) {
      return { text: duty, className: DUTY_COLORS[duty] || '' };
    }
    return null;
  }

  // ── Shared shadow class for last frozen column ──
  const shadowDivider = 'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]';
  const shadowDividerBody = 'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]';

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200/60">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
            {MONTHS[month]} {year} — Summary
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {filteredEmployees.length} staff · {daysInMonth} days · Shift ± Hrs = Overtime / Short Leave · Leave code replaces shift · Friday/Holiday auto-fills H (except Substation) unless overtime is logged
          </p>
        </div>

        <div className="flex items-center gap-3">
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
      <div className="flex-1 overflow-auto" onMouseLeave={() => { setHoverRow(null); setHoverCol(null); }}>
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
                      ${holidayTitle ? '!bg-red-900 text-red-50' : day === currentDay ? '!bg-emerald-700 text-emerald-50' : isFriday ? '!bg-red-900 text-red-50' : ''}
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
                      ${holidayTitle ? '!bg-red-800 text-red-50' : day === currentDay ? '!bg-emerald-600 text-emerald-50' : isFriday ? '!bg-red-800 text-red-50' : ''}
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
                    const duty = entry?.duty || '';
                    const leave = entry?.leave || '';
                    const holidayTitle = activeHolidays[day];
                    const cell = getCellDisplay(
                      emp.id,
                      day,
                      duty,
                      leave,
                      emp.team || 'Electrical',
                      Boolean(holidayTitle) || isFriday
                    );
                    const isColHovered = hoverCol === day;

                    const crosshair = (isRowHovered && isColHovered)
                      ? '!bg-slate-200/60'
                      : isColHovered
                        ? 'bg-slate-100/50'
                        : '';

                    const isCurrentDay = day === currentDay;
                    const holidayHighlight = holidayTitle && !isCurrentDay && !cell ? 'bg-rose-50/30' : '';
                    const currentDayHighlight = isCurrentDay ? 'bg-emerald-50' : '';
                    const fridayTint = isFriday && !holidayTitle && !isCurrentDay && !cell ? 'bg-rose-50/30' : '';

                    return (
                      <td
                        key={day}
                        title={holidayTitle ? `Public Holiday: ${holidayTitle}` : undefined}
                        className={`relative w-9 min-w-[36px] max-w-[36px] h-6 p-0 text-center align-middle border-r border-b border-slate-200/60 transition-colors
                          ${currentDayHighlight} ${holidayHighlight} ${fridayTint} ${crosshair}`}
                        onMouseEnter={() => { setHoverRow(emp.id); setHoverCol(day); }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          {cell && (
                            <span className={`inline-flex items-center justify-center min-w-[30px] h-[18px] px-1 text-[11px] font-bold rounded-sm border whitespace-nowrap ${cell.className}`}>
                              {cell.text}
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
    </div>
  );
}
