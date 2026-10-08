import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, KeyRound, Globe, CreditCard, LifeBuoy, ChevronDown,
  Activity, Users, Zap, FileText, Settings as SettingsIcon,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import Logo from '../ui/Logo';
import NotificationsBell from './NotificationsBell';

const CUSTOMER_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/licenses', label: 'Licenses', icon: KeyRound },
  { to: '/sites', label: 'Sites', icon: Globe },
  { to: '/billing', label: 'Billing', icon: CreditCard },
  { to: '/support', label: 'Support', icon: LifeBuoy },
];

const ADMIN_NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: Activity, end: true },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/licenses', label: 'All Licenses', icon: KeyRound },
  { to: '/admin/sites', label: 'All Sites', icon: Globe },
  { to: '/admin/webhooks', label: 'Webhooks', icon: Zap },
  { to: '/admin/logs', label: 'Logs', icon: FileText },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
];

function navLinkClass({ isActive }) {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:text-ink hover:bg-white/5',
  ].join(' ');
}

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/account/me'),
    retry: false,
  });

  const isAdmin = data?.user?.role === 'admin';

  const redirectTo = isLoading ? null : error
    ? (error.code === 'password_change_required' ? '/change-password' : '/login')
    : isAdmin && location.pathname === '/' ? '/admin'
    : !isAdmin && location.pathname.startsWith('/admin') ? '/'
    : null;

  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo, navigate]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>;
  }

  if (redirectTo) {
    return null;
  }

  const user = data?.user;
  const primaryLicense = isAdmin ? null : data?.licenses?.[0];
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <div className="flex">
        <aside className="flex h-screen w-64 flex-col justify-between border-r border-border px-4 py-6 sticky top-0">
          <div>
            <Logo className="mb-8 px-2" />
            {!isAdmin && (
              <>
                <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted/70">Customer</p>
                <nav className="space-y-1">
                  {CUSTOMER_NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                    <NavLink key={to} to={to} end={end} className={navLinkClass}>
                      <Icon size={18} />
                      {label}
                    </NavLink>
                  ))}
                </nav>
              </>
            )}

            {isAdmin && (
              <>
                <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted/70">Admin</p>
                <nav className="space-y-1">
                  {ADMIN_NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                    <NavLink key={to} to={to} end={end} className={navLinkClass}>
                      <Icon size={18} />
                      {label}
                    </NavLink>
                  ))}
                </nav>
              </>
            )}
          </div>

          {primaryLicense && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Current plan</p>
              <p className="mt-1 text-lg font-semibold capitalize">{primaryLicense.planName}</p>
              <p className="text-sm text-muted">
                {primaryLicense.siteLimit ?? 'Unlimited'} sites · {primaryLicense.expiresAt ? 'annual' : 'lifetime'}
              </p>
              <NavLink to="/billing" className="mt-2 inline-block text-sm text-accent-hover hover:underline">
                Manage →
              </NavLink>
            </div>
          )}
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-end gap-6 border-b border-border px-8 py-4">
            {!isAdmin && <a href="#" className="text-sm text-muted hover:text-ink">Docs</a>}
            {isAdmin && <NotificationsBell />}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-1 rounded-full"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-dim text-sm font-semibold text-accent-hover">
                  {initial}
                </span>
                <ChevronDown size={14} className="text-muted" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-card py-1 shadow-xl">
                  <div className="truncate px-3 py-2 text-xs text-muted">{user?.email}</div>
                  {!isAdmin && (
                    <NavLink
                      to="/account"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-white/5"
                    >
                      Account settings
                    </NavLink>
                  )}
                  <button
                    onClick={handleLogout}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-white/5"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 px-8 py-8">
            <Outlet context={{ user, licenses: data?.licenses ?? [] }} />
          </main>
        </div>
      </div>
    </div>
  );
}
