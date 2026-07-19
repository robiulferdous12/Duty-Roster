import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarRange, Settings, CalendarDays, Clock, Timer, LayoutList } from 'lucide-react';

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
        <div className="flex items-center justify-between px-6 h-12">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-slate-800 rounded flex items-center justify-center">
              <CalendarRange className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="leading-none">
              <span className="text-sm font-bold text-slate-800 tracking-tight">Duty Roster</span>
              <span className="text-[9px] text-slate-400 ml-1.5">Anti Gravity</span>
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
                  `flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-wide transition-all rounded ${
                    isActive
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
