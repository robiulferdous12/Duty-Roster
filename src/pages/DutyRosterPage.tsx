import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { X, ChevronsLeft, ChevronsRight, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { DutyCode } from '../types';
import * as ExcelJS from 'exceljs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

// Key used to identify a single (employee, day) cell inside the selectedCells Set
function cellKey(empId: string, day: number): string {
  return `${empId}|${day}`;
}

const DUTY_COLORS: Record<string, string> = {
  A: 'bg-sky-100/80 text-sky-800 border-sky-200/80',
  B: 'bg-emerald-100/80 text-emerald-800 border-emerald-200/80',
  C: 'bg-amber-100/80 text-amber-800 border-amber-200/80',
  M: 'bg-violet-100/80 text-violet-800 border-violet-200/80',
  H: 'bg-rose-50 text-rose-700 border-rose-200/80',
};

const DUTY_CODES: DutyCode[] = ['A', 'B', 'C', 'M', 'H'];
const DUTY_LABELS: Record<string, string> = {
  A: 'Morning',
  B: 'Evening',
  C: 'Night',
  M: 'General',
  H: 'Holiday / Off',
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

export default function DutyRosterPage() {
  const { roster, updateRosterCell } = useApp();
  const { year, month, employees, grid } = roster;

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
  // Selection is a Set of "empId|day" keys, so cells across multiple employees
  // and multiple days can all be selected together (not just one row at a time).
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ empId: string; day: number } | null>(null);
  // Anchor cell used as the "from" point for Shift+Click range selection
  const anchorRef = useRef<{ empId: string; day: number } | null>(null);

  // ── Dropdown ──
  const [dropdown, setDropdown] = useState<{ x: number; y: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Export modal ──
  const [showExport, setShowExport] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');


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

  // Row index of each employee within the currently filtered list, so a
  // rectangular block of cells can be computed between any two employees.
  const employeeRowIndex = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEmployees.forEach((emp, i) => { map[emp.id] = i; });
    return map;
  }, [filteredEmployees]);

  // Build the set of "empId|day" cell keys for the rectangular block spanning
  // from cell A to cell B (inclusive), across employee rows and day columns.
  const buildRectSelection = (aEmpId: string, aDay: number, bEmpId: string, bDay: number): Set<string> => {
    const rowA = employeeRowIndex[aEmpId];
    const rowB = employeeRowIndex[bEmpId];
    if (rowA === undefined || rowB === undefined) return new Set([cellKey(bEmpId, bDay)]);

    const rowLo = Math.min(rowA, rowB);
    const rowHi = Math.max(rowA, rowB);
    const dayLo = Math.min(aDay, bDay);
    const dayHi = Math.max(aDay, bDay);

    const next = new Set<string>();
    for (let r = rowLo; r <= rowHi; r++) {
      const emp = filteredEmployees[r];
      if (!emp) continue;
      for (let d = dayLo; d <= dayHi; d++) {
        next.add(cellKey(emp.id, d));
      }
    }
    return next;
  };

  // ── Close dropdown ──
  const closeDropdown = useCallback(() => setDropdown(null), []);

  // ── Mouse handlers ──
  const handleCellMouseDown = (e: React.MouseEvent, empId: string, day: number) => {
    if (e.button !== 0) return;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    // Clicking a cell that's already part of the current selection (no modifier
    // keys) shouldn't reset it — just let the click handler open the dropdown.
    if (!isCtrl && !isShift && selectedCells.has(cellKey(empId, day))) return;

    closeDropdown();

    // Shift+Click: select the rectangular range from the anchor to this cell
    // (spans multiple employees and days if the anchor is on a different row).
    if (isShift && anchorRef.current) {
      setSelectedCells(buildRectSelection(anchorRef.current.empId, anchorRef.current.day, empId, day));
      return;
    }

    // Ctrl/Cmd+Click: toggle just this one cell in/out of the selection
    if (isCtrl) {
      setSelectedCells(prev => {
        const next = new Set(prev);
        const key = cellKey(empId, day);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      anchorRef.current = { empId, day };
      return;
    }

    // Plain click: start a fresh drag/range selection
    setIsDragging(true);
    dragStartRef.current = { empId, day };
    anchorRef.current = { empId, day };
    setSelectedCells(new Set([cellKey(empId, day)]));
  };

  const handleCellMouseEnter = (empId: string, day: number) => {
    setHoverRow(empId);
    setHoverCol(day);
    if (isDragging && dragStartRef.current) {
      setSelectedCells(buildRectSelection(dragStartRef.current.empId, dragStartRef.current.day, empId, day));
    }
  };

  const handleCellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Selection is already finalized by mousedown (plain click, drag, Shift, or
    // Ctrl) — this just positions and opens the dropdown for what's selected.
    if (selectedCells.size === 0) { closeDropdown(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdown({ x: rect.left, y: rect.bottom });
  };

  // ── Global listeners ──
  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    const onMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setSelectedCells(new Set());
        anchorRef.current = null;
        closeDropdown();
      } else if (dropdown) {
        closeDropdown();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedCells(new Set()); anchorRef.current = null; closeDropdown(); }
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
  const applyCode = (code: DutyCode) => {
    if (selectedCells.size === 0) return;
    selectedCells.forEach(key => {
      const sep = key.lastIndexOf('|');
      const empId = key.slice(0, sep);
      const day = Number(key.slice(sep + 1));
      updateRosterCell(empId, day - 1, { duty: code });
    });
    closeDropdown();
    setSelectedCells(new Set());
    anchorRef.current = null;
  };

  // ── Export ──
  const openExportModal = () => {
    setExportFrom(toISODate(year, month, 1));
    setExportTo(toISODate(year, month, daysInMonth));
    setShowExport(true);
  };

  const handleExportConfirm = async () => {
    if (!exportFrom || !exportTo) return;

    const fd = new Date(exportFrom + 'T00:00:00');
    const td = new Date(exportTo + 'T00:00:00');

    // Clamp to the days available in the currently loaded month
    let fromDay = (fd.getFullYear() === year && fd.getMonth() === month) ? fd.getDate() : 1;
    let toDay = (td.getFullYear() === year && td.getMonth() === month) ? td.getDate() : daysInMonth;
    if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];

    type Row = { sl: number; id: string; name: string; designation: string; from: Date; to: Date; shift: string; unit: string };
    const rows: Row[] = [];
    let sl = 1;

    filteredEmployees.forEach(emp => {
      const empGrid = grid[emp.id] || [];
      let runStartDay: number | null = null;
      let runShift = '';

      const closeRun = (endDay: number) => {
        if (runStartDay !== null) {
          rows.push({
            sl: sl++,
            id: emp.id,
            name: emp.name,
            designation: emp.designation,
            from: new Date(Date.UTC(year, month, runStartDay)),
            to: new Date(Date.UTC(year, month, endDay)),
            shift: runShift,
            unit: '',
          });
        }
        runStartDay = null;
        runShift = '';
      };

      for (let day = fromDay; day <= toDay; day++) {
        const duty = empGrid[day - 1]?.duty || '';
        if (duty === runShift && runStartDay !== null) continue; // still in the same run
        closeRun(day - 1);
        if (duty) {
          runStartDay = day;
          runShift = duty;
        }
      }
      closeRun(toDay);
    });

    if (rows.length === 0) {
      alert('No shifts found in the selected date range.');
      return;
    }

    const FONT = { name: 'Cambria', size: 11 };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Duty Roster');

    sheet.columns = [
      { header: 'SL', key: 'sl', width: 6 },
      { header: 'ID', key: 'id', width: 12 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'From', key: 'from', width: 13, style: { numFmt: 'dd-mmm-yyyy' } },
      { header: 'To', key: 'to', width: 13, style: { numFmt: 'dd-mmm-yyyy' } },
      { header: 'Shift', key: 'shift', width: 8 },
      { header: 'Unit', key: 'unit', width: 14 },
    ];

    rows.forEach(r => sheet.addRow(r));

    // Apply Cambria to every cell, bold on the header row
    sheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = rowNumber === 1 ? { ...FONT, bold: true } : FONT;
      });
    });
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DutyRoster_${MONTHS[month]}${year}_${pad2(fromDay)}-${pad2(toDay)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setShowExport(false);
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
            {MONTHS[month]} {year} — Duty Schedule
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {filteredEmployees.length} staff · {daysInMonth} days · Drag or Shift+Click for a range · Ctrl+Click to multi-select
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
            onClick={openExportModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200/60 rounded transition-colors"
          >
            <Download className="w-3 h-3" /> Export
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto" ref={gridRef} onMouseLeave={() => { setHoverRow(null); setHoverCol(null); }}>
        <table
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
                    const isColHovered = hoverCol === day;
                    const isSelected = selectedCells.has(cellKey(emp.id, day));

                    // Crosshair: row+col tint without covering shift badges
                    const crosshair = (isRowHovered && isColHovered && !isSelected)
                      ? '!bg-slate-200/60'
                      : (isColHovered && !isSelected)
                        ? 'bg-slate-100/50'
                        : '';

                    const isCurrentDay = day === currentDay;
                    const holidayTitle = activeHolidays[day];
                    const holidayHighlight = holidayTitle && !isCurrentDay && !duty && !isSelected ? 'bg-rose-50/30' : '';
                    const currentDayHighlight = isCurrentDay && !isSelected ? 'bg-emerald-50' : '';
                    const fridayTint = isFriday && !holidayTitle && !isCurrentDay && !duty && !isSelected ? 'bg-rose-50/30' : '';

                    return (
                      <td
                        key={day}
                        title={holidayTitle ? `Public Holiday: ${holidayTitle}` : undefined}
                        className={`relative w-9 min-w-[36px] max-w-[36px] h-6 p-0 text-center align-middle border-r border-b border-slate-200/60 cursor-cell transition-colors
                          ${currentDayHighlight} ${holidayHighlight} ${fridayTint} ${crosshair}
                          ${isSelected ? '!bg-sky-100/60 shadow-[inset_0_0_0_1.5px_#3b82f6]' : ''}`}
                        onMouseDown={e => handleCellMouseDown(e, emp.id, day)}
                        onMouseEnter={() => handleCellMouseEnter(emp.id, day)}
                        onClick={e => handleCellClick(e)}
                      >
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          {duty && (
                            <span className={`inline-flex items-center justify-center w-[30px] h-[18px] text-[11px] font-bold rounded-sm border ${DUTY_COLORS[duty] || ''}`}>
                              {duty}
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
              {selectedCells.size > 1 ? `Set ${selectedCells.size} cells` : 'Assign Code'}
            </span>
            <button onClick={closeDropdown} className="p-0.5 hover:bg-slate-700 rounded">
              <X className="w-3 h-3" />
            </button>
          </div>
          {/* Options */}
          <div className="p-2 space-y-1">
            {DUTY_CODES.map(code => (
              <button
                key={code}
                onClick={() => applyCode(code)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors hover:opacity-80 border ${DUTY_COLORS[code]}`}
              >
                <span className="w-5 text-center">{code}</span>
                <span className="text-[10px] font-normal opacity-70">{DUTY_LABELS[code]}</span>
              </button>
            ))}
            <div className="border-t border-slate-100 mt-1.5 pt-1.5">
              <button
                onClick={() => applyCode('' as DutyCode)}
                className="w-full py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded transition-colors"
              >
                Clear cell{selectedCells.size > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export Date Range Modal ── */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={() => setShowExport(false)} />
          <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-sm animate-fade-in border border-slate-200/60">
            <div className="bg-slate-800 px-5 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-sm font-bold text-white">Export Duty Roster List</h2>
              <button onClick={() => setShowExport(false)} className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Select the date range to export. Consecutive days with the same shift are merged into a single row.
                {filterTeam !== 'All' && <span className="block mt-1 font-semibold text-slate-600">Team filter active: {filterTeam}</span>}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">From</label>
                  <input
                    type="date"
                    value={exportFrom}
                    min={toISODate(year, month, 1)}
                    max={toISODate(year, month, daysInMonth)}
                    onChange={e => setExportFrom(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">To</label>
                  <input
                    type="date"
                    value={exportTo}
                    min={toISODate(year, month, 1)}
                    max={toISODate(year, month, daysInMonth)}
                    onChange={e => setExportTo(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-slate-400"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowExport(false)}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExportConfirm}
                  disabled={!exportFrom || !exportTo}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-40 rounded-lg transition-colors"
                >
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
