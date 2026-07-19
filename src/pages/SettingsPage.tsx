import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Plus, Trash2, Save, X, Edit2, Calendar, PartyPopper, Users, Contact, RotateCcw, AlertCircle } from 'lucide-react';
import type { Employee, PublicHoliday, CepEntry } from '../types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TEAMS = ['Electrical', 'Mechanical', 'Store', 'Substation', 'Paints'] as const;
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type TabId = 'employees' | 'holidays' | 'cep' | 'reset';

// ── Helper: expand a date range into individual dates ──
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function expandDateRange(start: string, end: string): { date: string; day: string }[] {
  const dates: { date: string; day: string }[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    dates.push({
      date: toLocalISODate(cur),
      day: DAYS_FULL[cur.getDay()],
    });
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function formatDateToDMY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export default function SettingsPage() {
  const { roster, updateEmployees, setRosterMonth, updatePublicHolidays, updateCepDirectory, resetField, clearOvertimeForCurrentMonth, clearShortLeaveForCurrentMonth } = useApp();
  const { employees, year, month, publicHolidays = [], cepDirectory = [] } = roster;

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState<TabId>('employees');

  // ── Reset states ──
  const [resetDuty, setResetDuty] = useState(false);
  const [resetLeave, setResetLeave] = useState(false);
  const [resetShortLeave, setResetShortLeave] = useState(false);
  const [resetOvertime, setResetOvertime] = useState(false);
  const [resetPin, setResetPin] = useState('');
  const [resetError, setResetError] = useState('');

  const handlePerformReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetDuty && !resetLeave && !resetShortLeave && !resetOvertime) {
      setResetError('Please select at least one page/data to reset.');
      return;
    }
    if (resetPin !== '982165') {
      setResetError('Incorrect PIN. Access denied.');
      return;
    }

    if (resetDuty) resetField('duty');
    if (resetLeave) resetField('leave');
    if (resetShortLeave) { resetField('shortLeave'); clearShortLeaveForCurrentMonth(); }
    if (resetOvertime) clearOvertimeForCurrentMonth();

    alert(`Selected data for ${MONTHS[month]} ${year} has been reset successfully. Other months are unaffected.`);
    setResetDuty(false);
    setResetLeave(false);
    setResetShortLeave(false);
    setResetOvertime(false);
    setResetPin('');
    setResetError('');
  };

  // ── Local employee state ──
  const [localEmployees, setLocalEmployees] = useState<Employee[]>(employees);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesig, setEditDesig] = useState('');
  const [editTeam, setEditTeam] = useState<string>('Electrical');
  const [editPhone, setEditPhone] = useState('');

  // ── Add employee dialog ──
  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesig, setNewDesig] = useState('');
  const [newTeam, setNewTeam] = useState<string>('Electrical');
  const [newPhone, setNewPhone] = useState('');
  const [addError, setAddError] = useState('');

  // ── Month/Year selector ──
  const [selMonth, setSelMonth] = useState(month);
  const [selYear, setSelYear] = useState(year);
  const daysInSelected = new Date(selYear, selMonth + 1, 0).getDate();

  // ── Public Holidays state ──
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
  const [holTitle, setHolTitle] = useState('');
  const [holStart, setHolStart] = useState('');
  const [holEnd, setHolEnd] = useState('');
  const [holError, setHolError] = useState('');

  // ── CEP Directory state ──
  const [localCep, setLocalCep] = useState<CepEntry[]>(cepDirectory);
  const [showAddCep, setShowAddCep] = useState(false);
  const [editingCepId, setEditingCepId] = useState<string | null>(null);
  const [cepName, setCepName] = useState('');
  const [cepNumber, setCepNumber] = useState('');
  const [cepEditName, setCepEditName] = useState('');
  const [cepEditNumber, setCepEditNumber] = useState('');
  const [cepError, setCepError] = useState('');

  // ── Flattened holiday rows for display ──
  const holidayRows = useMemo(() => {
    const rows: { holidayId: string; title: string; date: string; day: string; isFirst: boolean; span: number }[] = [];
    publicHolidays.forEach((h) => {
      const dates = expandDateRange(h.startDate, h.endDate);
      dates.forEach((d, i) => {
        rows.push({
          holidayId: h.id,
          title: h.title,
          date: d.date,
          day: d.day,
          isFirst: i === 0,
          span: dates.length,
        });
      });
    });
    return rows;
  }, [publicHolidays]);

  // ── Employee handlers ──
  const commitEmployees = (updated: Employee[]) => {
    setLocalEmployees(updated);
    updateEmployees(updated);
  };

  const handleAdd = () => {
    const id = newId.trim();
    const name = newName.trim();
    if (!id || !name) { setAddError('Staff ID and Name are required.'); return; }
    if (localEmployees.some(e => e.id === id)) { setAddError('Staff ID already exists.'); return; }
    commitEmployees([...localEmployees, { id, name, designation: newDesig.trim(), team: newTeam, phone: newPhone.trim() }]);
    setShowAdd(false); setNewId(''); setNewName(''); setNewDesig(''); setNewTeam('Electrical'); setNewPhone(''); setAddError('');
  };

  const handleDelete = (id: string) => {
    if (confirm(`Remove employee ${id}? This will clear their roster data.`)) {
      commitEmployees(localEmployees.filter(e => e.id !== id));
    }
  };

  const startEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setEditName(emp.name);
    setEditDesig(emp.designation);
    setEditTeam(emp.team || 'Electrical');
    setEditPhone(emp.phone || '');
  };

  const saveEdit = () => {
    commitEmployees(localEmployees.map(e =>
      e.id === editingId ? { ...e, name: editName.trim(), designation: editDesig.trim(), team: editTeam, phone: editPhone.trim() } : e
    ));
    setEditingId(null);
  };

  const applyMonth = () => {
    setRosterMonth(selYear, selMonth);
  };

  // ── Holiday handlers ──
  const handleAddHoliday = () => {
    const title = holTitle.trim();
    if (!title) { setHolError('Title is required.'); return; }
    if (!holStart) { setHolError('Start date is required.'); return; }
    const end = holEnd || holStart;
    if (end < holStart) { setHolError('End date cannot be before start date.'); return; }
    const newHoliday: PublicHoliday = {
      id: `hol_${Date.now()}`,
      title,
      startDate: holStart,
      endDate: end,
    };
    updatePublicHolidays([...publicHolidays, newHoliday]);
    setShowAddHoliday(false);
    setHolTitle(''); setHolStart(''); setHolEnd(''); setHolError('');
  };

  const startEditHoliday = (h: PublicHoliday) => {
    setEditingHoliday(h);
    setHolTitle(h.title);
    setHolStart(h.startDate);
    setHolEnd(h.endDate);
    setHolError('');
  };

  const handleSaveHoliday = () => {
    const title = holTitle.trim();
    if (!title) { setHolError('Title is required.'); return; }
    if (!holStart) { setHolError('Start date is required.'); return; }
    const end = holEnd || holStart;
    if (end < holStart) { setHolError('End date cannot be before start date.'); return; }

    if (editingHoliday) {
      updatePublicHolidays(publicHolidays.map(h =>
        h.id === editingHoliday.id ? { ...h, title, startDate: holStart, endDate: end } : h
      ));
      setEditingHoliday(null);
    }
    setHolTitle(''); setHolStart(''); setHolEnd(''); setHolError('');
  };

  const handleDeleteHoliday = (id: string) => {
    if (confirm('Remove this holiday?')) {
      updatePublicHolidays(publicHolidays.filter(h => h.id !== id));
    }
  };

  // ── CEP handlers ──
  const commitCep = (updated: CepEntry[]) => {
    setLocalCep(updated);
    updateCepDirectory(updated);
  };

  const handleAddCep = () => {
    const name = cepName.trim();
    const number = cepNumber.trim();
    if (!name || !number) { setCepError('Both CEP Name and Number are required.'); return; }
    commitCep([...localCep, { id: `cep_${Date.now()}`, name, number }]);
    setShowAddCep(false); setCepName(''); setCepNumber(''); setCepError('');
  };

  const startEditCep = (entry: CepEntry) => {
    setEditingCepId(entry.id);
    setCepEditName(entry.name);
    setCepEditNumber(entry.number);
  };

  const saveEditCep = () => {
    commitCep(localCep.map(e =>
      e.id === editingCepId ? { ...e, name: cepEditName.trim(), number: cepEditNumber.trim() } : e
    ));
    setEditingCepId(null);
  };

  const handleDeleteCep = (id: string) => {
    if (confirm('Remove this CEP entry?')) {
      commitCep(localCep.filter(e => e.id !== id));
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-5 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">System Settings</h1>
        <p className="text-[11px] text-slate-400 mt-0.5">Configure personnel roster and scheduling timeline.</p>
      </div>

      {/* ── Active Month Setup ── */}
      <div className="bg-white border border-slate-200/60 rounded">
        <div className="px-4 py-3 border-b border-slate-200/60 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Active Month Setup</h2>
          </div>
        </div>
        <div className="px-4 py-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Month</label>
            <select
              value={selMonth}
              onChange={e => setSelMonth(Number(e.target.value))}
              className="px-3 py-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 min-w-[140px]"
            >
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Year</label>
            <select
              value={selYear}
              onChange={e => setSelYear(Number(e.target.value))}
              className="px-3 py-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400 min-w-[90px]"
            >
              {Array.from({ length: 10 }, (_, i) => 2024 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <button
              onClick={applyMonth}
              disabled={selMonth === month && selYear === year}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
            >
              Apply
            </button>
            <span className="text-[11px] text-slate-400 pb-0.5">
              {daysInSelected} days in {MONTHS[selMonth]} {selYear}
            </span>
          </div>
        </div>
      </div>

      {/* ── Tabbed Section: Employee Directory / Public Holidays ── */}
      <div className="bg-white border border-slate-200/60 rounded">
        {/* Tab header bar */}
        <div className="px-4 border-b border-slate-200/60 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center -mb-px">
            <button
              onClick={() => setActiveTab('employees')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'employees'
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
            >
              <Users className="w-3.5 h-3.5" />
              Employee Directory ({localEmployees.length})
            </button>
            <button
              onClick={() => setActiveTab('holidays')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'holidays'
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
            >
              <PartyPopper className="w-3.5 h-3.5" />
              Public Holidays ({publicHolidays.length})
            </button>
            <button
              onClick={() => setActiveTab('cep')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'cep'
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
            >
              <Contact className="w-3.5 h-3.5" />
              CEP Directory ({localCep.length})
            </button>
            <button
              onClick={() => setActiveTab('reset')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'reset'
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Data
            </button>
          </div>

          {/* Action button aligned to the right */}
          {activeTab === 'employees' && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Staff
            </button>
          )}
          {activeTab === 'holidays' && (
            <button
              onClick={() => setShowAddHoliday(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Holiday
            </button>
          )}
          {activeTab === 'cep' && (
            <button
              onClick={() => setShowAddCep(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Add CEP
            </button>
          )}
        </div>

        {/* ── Employee Directory Content ── */}
        {activeTab === 'employees' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200/60 text-slate-500">
                  <th className="px-4 py-2.5 font-semibold w-12">#</th>
                  <th className="px-4 py-2.5 font-semibold w-24">Staff ID</th>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Designation</th>
                  <th className="px-4 py-2.5 font-semibold w-32">Team</th>
                  <th className="px-4 py-2.5 font-semibold">Phone Number</th>
                  <th className="px-4 py-2.5 font-semibold text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {localEmployees.map((emp, idx) => (
                  <tr key={emp.id} className="border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-2 text-slate-700 font-semibold">{emp.id}</td>
                    <td className="px-4 py-2">
                      {editingId === emp.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-400"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        />
                      ) : (
                        <span className="font-bold text-slate-800">{emp.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {editingId === emp.id ? (
                        <input
                          type="text"
                          value={editDesig}
                          onChange={e => setEditDesig(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-400"
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        />
                      ) : (
                        emp.designation
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {editingId === emp.id ? (
                        <select
                          value={editTeam}
                          onChange={e => setEditTeam(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:border-slate-400"
                        >
                          {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        emp.team || 'Electrical'
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {editingId === emp.id ? (
                        <input
                          type="text"
                          value={editPhone}
                          onChange={e => setEditPhone(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-400"
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        />
                      ) : (
                        emp.phone || '-'
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editingId === emp.id ? (
                        <div className="flex justify-end gap-1">
                          <button onClick={saveEdit} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Save"><Save className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => startEdit(emp)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(emp.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {localEmployees.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">No employees configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Public Holidays Content ── */}
        {activeTab === 'holidays' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200/60 text-slate-500">
                  <th className="px-4 py-2.5 font-semibold w-12">#</th>
                  <th className="px-4 py-2.5 font-semibold w-36">Title</th>
                  <th className="px-4 py-2.5 font-semibold w-32">Date</th>
                  <th className="px-4 py-2.5 font-semibold w-28">Day</th>
                  <th className="px-4 py-2.5 font-semibold text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidayRows.map((row, idx) => {
                  const holItem = publicHolidays.find(h => h.id === row.holidayId);
                  return (
                    <tr
                      key={`${row.holidayId}-${row.date}`}
                      className={`border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors ${row.day === 'Friday' ? 'bg-rose-50/30' : ''}`}
                    >
                      <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                      {row.isFirst ? (
                        <td className="px-4 py-2 font-bold text-slate-800 w-36 truncate max-w-[144px]" rowSpan={row.span} title={row.title}>
                          {row.title}
                        </td>
                      ) : null}
                      <td className="px-4 py-2 text-slate-700 font-mono text-[11px]">{formatDateToDMY(row.date)}</td>
                      <td className="px-4 py-2 text-slate-600">{row.day}</td>
                      {row.isFirst ? (
                        <td className="px-4 py-2 text-right" rowSpan={row.span}>
                          <div className="flex justify-end gap-1">
                            {holItem && (
                              <button
                                onClick={() => startEditHoliday(holItem)}
                                className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteHoliday(row.holidayId)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {holidayRows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">No public holidays configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── CEP Directory Content ── */}
        {activeTab === 'cep' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200/60 text-slate-500">
                  <th className="px-4 py-2.5 font-semibold w-12">#</th>
                  <th className="px-4 py-2.5 font-semibold">CEP Name</th>
                  <th className="px-4 py-2.5 font-semibold">CEP Number</th>
                  <th className="px-4 py-2.5 font-semibold text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {localCep.map((entry, idx) => (
                  <tr key={entry.id} className="border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-2">
                      {editingCepId === entry.id ? (
                        <input
                          type="text"
                          value={cepEditName}
                          onChange={e => setCepEditName(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-400"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveEditCep(); if (e.key === 'Escape') setEditingCepId(null); }}
                        />
                      ) : (
                        <span className="font-bold text-slate-800">{entry.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {editingCepId === entry.id ? (
                        <input
                          type="text"
                          value={cepEditNumber}
                          onChange={e => setCepEditNumber(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-400"
                          onKeyDown={e => { if (e.key === 'Enter') saveEditCep(); if (e.key === 'Escape') setEditingCepId(null); }}
                        />
                      ) : (
                        entry.number
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editingCepId === entry.id ? (
                        <div className="flex justify-end gap-1">
                          <button onClick={saveEditCep} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Save"><Save className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingCepId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => startEditCep(entry)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteCep(entry.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {localCep.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-xs">No CEP entries configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Reset Data Content ── */}
        {activeTab === 'reset' && (
          <div className="max-w-lg mx-auto py-8 px-4">
            <div className="bg-white border border-slate-200/60 rounded-lg overflow-hidden">
              <div className="bg-rose-600 px-5 py-4 text-center">
                <AlertCircle className="w-7 h-7 text-white mx-auto mb-1.5" />
                <h2 className="text-base font-bold text-white">Reset Roster Data</h2>
                <p className="text-[11px] text-rose-100 mt-1">Select which data you want to permanently wipe for {MONTHS[month]} {year}, then enter the security PIN to confirm. Other months are never affected.</p>
              </div>
              <form onSubmit={handlePerformReset} className="p-5 space-y-5">
                {resetError && <p className="text-rose-500 text-[11px] font-semibold text-center">{resetError}</p>}

                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Select pages to reset:</p>

                  <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200/80 hover:bg-slate-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={resetDuty} onChange={e => setResetDuty(e.target.checked)} className="w-4 h-4 accent-rose-600 rounded" />
                    <div>
                      <span className="text-xs font-bold text-slate-800">Duty Roster</span>
                      <p className="text-[10px] text-slate-400">Clears all duty shift assignments (A/B/C/M/H) for {MONTHS[month]} {year}</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200/80 hover:bg-slate-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={resetLeave} onChange={e => setResetLeave(e.target.checked)} className="w-4 h-4 accent-rose-600 rounded" />
                    <div>
                      <span className="text-xs font-bold text-slate-800">Leave Status</span>
                      <p className="text-[10px] text-slate-400">Clears all leave assignments for {MONTHS[month]} {year}</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200/80 hover:bg-slate-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={resetShortLeave} onChange={e => setResetShortLeave(e.target.checked)} className="w-4 h-4 accent-rose-600 rounded" />
                    <div>
                      <span className="text-xs font-bold text-slate-800">Short Leave</span>
                      <p className="text-[10px] text-slate-400">Clears all short leave hours for {MONTHS[month]} {year}</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200/80 hover:bg-slate-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={resetOvertime} onChange={e => setResetOvertime(e.target.checked)} className="w-4 h-4 accent-rose-600 rounded" />
                    <div>
                      <span className="text-xs font-bold text-slate-800">Overtime Log</span>
                      <p className="text-[10px] text-slate-400">Clears overtime entries for {MONTHS[month]} {year} only</p>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Security PIN</label>
                  <input
                    type="password"
                    value={resetPin}
                    onChange={e => { setResetPin(e.target.value); setResetError(''); }}
                    placeholder="••••••"
                    className={`w-full px-4 py-2.5 text-center text-lg tracking-[0.3em] border rounded-lg outline-none transition-colors ${resetError && resetPin ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 focus:border-slate-400'}`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!resetPin || (!resetDuty && !resetLeave && !resetShortLeave && !resetOvertime)}
                  className="w-full px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 rounded-lg transition-colors"
                >
                  Confirm Reset
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Employee Dialog ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/15 backdrop-blur-[2px]" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm animate-fade-in border border-slate-200/60">
            <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center rounded-t-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider">Add Employee</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-300 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-4 space-y-3">
              {addError && <p className="text-[11px] text-rose-500 font-semibold">{addError}</p>}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Staff ID *</label>
                <input type="text" value={newId} onChange={e => setNewId(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400" placeholder="e.g. 12345" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Full Name *</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400" placeholder="e.g. Abdul Rahman" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Designation</label>
                <input type="text" value={newDesig} onChange={e => setNewDesig(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400" placeholder="e.g. Technician" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Team</label>
                <select
                  value={newTeam}
                  onChange={e => setNewTeam(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400"
                >
                  {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Phone Number</label>
                <input type="text" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400" placeholder="e.g. 01700000000" />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                <button onClick={handleAdd} className="px-4 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded shadow-sm">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Holiday Dialog ── */}
      {(showAddHoliday || editingHoliday) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/15 backdrop-blur-[2px]" onClick={() => { setShowAddHoliday(false); setEditingHoliday(null); }} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm animate-fade-in border border-slate-200/60">
            <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center rounded-t-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}
              </h3>
              <button onClick={() => { setShowAddHoliday(false); setEditingHoliday(null); }} className="text-slate-300 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-4 space-y-3">
              {holError && <p className="text-[11px] text-rose-500 font-semibold">{holError}</p>}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Holiday Title *</label>
                <input
                  type="text"
                  value={holTitle}
                  onChange={e => setHolTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                  placeholder="e.g. Eid ul-Fitr"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={holStart}
                    onChange={e => setHolStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={holEnd}
                    onChange={e => setHolEnd(e.target.value)}
                    min={holStart}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">Leave End Date empty for a single-day holiday.</p>
              <div className="pt-2 flex justify-end gap-2">
                <button onClick={() => { setShowAddHoliday(false); setEditingHoliday(null); }} className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                <button onClick={editingHoliday ? handleSaveHoliday : handleAddHoliday} className="px-4 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded shadow-sm">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add CEP Dialog ── */}
      {showAddCep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/15 backdrop-blur-[2px]" onClick={() => setShowAddCep(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm animate-fade-in border border-slate-200/60">
            <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center rounded-t-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider">Add CEP Entry</h3>
              <button onClick={() => setShowAddCep(false)} className="text-slate-300 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-4 space-y-3">
              {cepError && <p className="text-[11px] text-rose-500 font-semibold">{cepError}</p>}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">CEP Name *</label>
                <input type="text" value={cepName} onChange={e => setCepName(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400" placeholder="e.g. John Doe" autoFocus />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">CEP Number *</label>
                <input type="text" value={cepNumber} onChange={e => setCepNumber(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400" placeholder="e.g. 01700000000" />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button onClick={() => setShowAddCep(false)} className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                <button onClick={handleAddCep} className="px-4 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded shadow-sm">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
