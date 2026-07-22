import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';

/**
 * Two-stage Team Filter.
 *
 * Stage 1 — pick one or more whole Teams.
 * Stage 2 — expand a Team to hand-pick individual staff within it (multi-select).
 *
 * The result is always a flat Set of selected employee IDs:
 *   - empty Set  → "All Teams" (no filter applied — matches old `filterTeam === 'All'`)
 *   - non-empty  → only employees whose id is in the set pass the filter
 *
 * Drop this in next to the old `<select>` Team Filter block:
 *
 *   <TeamFilterDropdown
 *     employees={employees}
 *     selected={selectedEmpIds}
 *     onChange={setSelectedEmpIds}
 *   />
 *
 * NOTE: adjust the import path below to wherever this file actually lives
 * in your project (this assumes `src/components/TeamFilterDropdown.tsx`
 * next to `src/pages/*.tsx`).
 */

export interface FilterableEmployee {
  id: string;
  name: string;
  team?: string;
}

// Canonical display order — matches the options in the original <select>.
// Any team present in the data but not listed here is appended at the end.
const TEAM_ORDER = ['Electrical', 'Mechanical', 'Store', 'Substation', 'Paints'];

interface TeamFilterDropdownProps {
  employees: FilterableEmployee[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export default function TeamFilterDropdown({ employees, selected, onChange }: TeamFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  const employeesByTeam = useMemo(() => {
    const map: Record<string, FilterableEmployee[]> = {};
    employees.forEach(emp => {
      const team = emp.team || 'Electrical';
      if (!map[team]) map[team] = [];
      map[team].push(emp);
    });
    return map;
  }, [employees]);

  const teams = useMemo(() => {
    const present = Object.keys(employeesByTeam);
    const ordered = TEAM_ORDER.filter(t => present.includes(t));
    const extras = present.filter(t => !TEAM_ORDER.includes(t));
    return [...ordered, ...extras];
  }, [employeesByTeam]);

  // ── Close on outside click / Escape ──
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggleExpand = (team: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team); else next.add(team);
      return next;
    });
  };

  // Selecting a team toggles ALL of its members in/out together.
  const toggleTeam = (team: string) => {
    const members = employeesByTeam[team] || [];
    const allSelected = members.length > 0 && members.every(m => selected.has(m.id));
    const next = new Set(selected);
    if (allSelected) {
      members.forEach(m => next.delete(m.id));
    } else {
      members.forEach(m => next.add(m.id));
    }
    onChange(next);
  };

  const toggleMember = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  // ── Button label ──
  const label = useMemo(() => {
    if (selected.size === 0) return 'All Teams';
    const fullTeams = teams.filter(team => {
      const members = employeesByTeam[team] || [];
      return members.length > 0 && members.every(m => selected.has(m.id));
    });
    const coveredIds = new Set(fullTeams.flatMap(t => (employeesByTeam[t] || []).map(m => m.id)));
    const leftover = [...selected].filter(id => !coveredIds.has(id)).length;
    if (fullTeams.length && leftover === 0) return fullTeams.join(', ');
    if (fullTeams.length === 0) return `${selected.size} Staff`;
    return `${fullTeams.join(', ')} +${leftover}`;
  }, [selected, teams, employeesByTeam]);

  return (
    <div className="relative" ref={rootRef}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 font-medium">Team:</span>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 font-semibold text-slate-700 hover:bg-slate-50 transition-colors max-w-[180px]"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 w-60 max-h-80 overflow-y-auto bg-white border border-slate-200/80 shadow-lg shadow-slate-200/50 rounded animate-fade-in">
          <button
            type="button"
            onClick={clearAll}
            className={`w-full text-left px-3 py-1.5 text-xs font-semibold border-b border-slate-100 transition-colors ${selected.size === 0 ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
          >
            All Teams
          </button>

          {teams.map(team => {
            const members = employeesByTeam[team] || [];
            const allSelected = members.length > 0 && members.every(m => selected.has(m.id));
            const someSelected = !allSelected && members.some(m => selected.has(m.id));
            const isExpanded = expanded.has(team);

            return (
              <div key={team} className="border-b border-slate-50 last:border-b-0">
                <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-slate-50 transition-colors">
                  {/* Team-level checkbox — select/deselect the whole team */}
                  <button
                    type="button"
                    onClick={() => toggleTeam(team)}
                    title={allSelected ? 'Deselect whole team' : 'Select whole team'}
                    className={`w-4 h-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors ${allSelected
                      ? 'bg-slate-800 border-slate-800'
                      : someSelected
                        ? 'bg-slate-300 border-slate-400'
                        : 'bg-white border-slate-300'
                      }`}
                  >
                    {allSelected && <Check className="w-3 h-3 text-white" />}
                    {someSelected && <span className="w-1.5 h-0.5 bg-white rounded-full" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTeam(team)}
                    className="flex-1 text-left text-xs font-semibold text-slate-700"
                  >
                    {team} <span className="text-slate-400 font-normal">({members.length})</span>
                  </button>

                  {/* Expand to reveal individual staff in this team */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(team)}
                    className="p-0.5 text-slate-400 hover:text-slate-700 transition-colors"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="pb-1">
                    {members.map(m => (
                      <label
                        key={m.id}
                        className="flex items-center gap-1.5 pl-7 pr-2 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(m.id)}
                          onChange={() => toggleMember(m.id)}
                          className="w-3 h-3 accent-slate-800"
                        />
                        <span className="truncate">{m.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
