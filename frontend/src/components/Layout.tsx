import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, Bell, Sparkles, FileText, ShieldCheck, LogOut, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AlertToaster } from './AlertToaster';
import { useIdleLogout, IdleWarningModal } from '../lib/idle';
import { BrandWordmark } from './Brand';

export function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { t } = useTranslation();
  const onIdle = useCallback(() => { logout(); nav('/login'); }, [logout, nav]);
  const { warning, stayIn } = useIdleLogout(onIdle);

  const roleLabel =
    user?.role === 'school_admin' ? t('auth.role_admin')
    : user?.role === 'parent' ? t('auth.role_parent')
    : user?.role === 'teacher' ? t('auth.role_teacher')
    : t('auth.role_psychologist');

  const isAdmin = user?.role === 'school_admin';
  const isParent = user?.role === 'parent';

  // Light/dark theme. Persist on localStorage; default = dark.
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('socialmind.theme') : null;
    return stored === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') root.classList.add('light');
    else root.classList.remove('light');
    localStorage.setItem('socialmind.theme', theme);
  }, [theme]);

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-line/60 bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
          <BrandWordmark />
          <div className="hidden md:block h-6 w-px bg-line" />
          <nav className="flex gap-0.5 overflow-x-auto scrollbar-thin">
            {!isAdmin && (
              <NavItem to="/" icon={<LayoutDashboard size={15} strokeWidth={2} />} label={t('nav.dashboard')} end />
            )}
            {!isAdmin && (
              <NavItem to="/children" icon={<Users size={15} strokeWidth={2} />} label={t('nav.children')} />
            )}
            {!isParent && (
              <NavItem to="/alerts" icon={<Bell size={15} strokeWidth={2} />} label={t('nav.alerts')} />
            )}
            <NavItem to="/assistant" icon={<Sparkles size={15} strokeWidth={2} />} label={t('nav.assistant')} />
            {isAdmin && (
              <NavItem to="/audit" icon={<FileText size={15} strokeWidth={2} />} label={t('nav.audit')} />
            )}
            {isAdmin && (
              <NavItem to="/admin" icon={<ShieldCheck size={15} strokeWidth={2} />} label={t('admin.nav')} />
            )}
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            <button
              onClick={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? t('common.theme_light') : t('common.theme_dark')}
              className="size-8 grid place-items-center rounded-md border border-line text-slate-300 hover:bg-white/5"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <LanguageSwitcher />
            <div className="text-end hidden sm:block">
              <div className="text-slate-100 font-medium leading-tight">{user?.name}</div>
              <div className="text-[11px] text-muted leading-tight">
                {roleLabel} · {user?.school_name}
              </div>
            </div>
            <button
              onClick={() => { logout(); nav('/login'); }}
              title={t('auth.signout')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line text-slate-300 hover:text-slate-100 hover:bg-white/5 text-xs transition"
            >
              <LogOut size={13} strokeWidth={2} />
              <span className="hidden sm:inline">{t('auth.signout')}</span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-7xl mx-auto px-6 py-7">
          <Outlet />
        </div>
      </main>
      <AlertToaster />
      {warning && <IdleWarningModal secondsLeft={warning.secondsLeft} onStay={stayIn} />}
    </div>
  );
}

function NavItem({
  to, icon, label, end,
}: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
          isActive
            ? 'bg-accent/15 text-white shadow-[inset_0_-2px_0_0] shadow-accent'
            : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
