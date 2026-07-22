import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarRange, Settings, CalendarDays, Clock, Timer, LayoutList, Code2 } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Duty Roster', icon: CalendarRange },
  { to: '/leave', label: 'Leave Status', icon: CalendarDays },
  { to: '/short-leave', label: 'Short Leave', icon: Clock },
  { to: '/overtime', label: 'Overtime', icon: Timer },
  { to: '/summary', label: 'Summary', icon: LayoutList },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* ── Top Navigation Bar ── */}
      <header className="shrink-0 bg-white border-b border-slate-200/60">
        <div className="flex items-center justify-between px-6 h-14">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center shadow-sm">
              <CalendarRange className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold text-slate-900 tracking-tight">Duty Roster</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100/80 border border-slate-200/80 px-2 py-0.5 rounded-full">
                <Code2 className="w-3 h-3 text-slate-400" />
                Robiul Ferdous
              </span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-wide transition-all rounded ${isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Page Content ── */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
