import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatDateTime, timeAgo } from '../../lib/format';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';

export default function AccountPage() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['account-sessions'],
    queryFn: () => apiFetch('/account/sessions'),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => apiFetch('/account/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      queryClient.invalidateQueries({ queryKey: ['account-sessions'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id) => apiFetch(`/account/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-sessions'] }),
  });

  async function handleLogoutEverywhere() {
    await apiFetch('/account/sessions/revoke-all', { method: 'POST' });
    await apiFetch('/auth/logout', { method: 'POST' });
    navigate('/login');
  }

  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader eyebrow="Account" title="Account settings." description="Your profile, password, and active sessions." icon={UserRound} />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:p-6">
        <h2 className="font-semibold">Profile</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name</label>
            <input disabled value={user?.name || '—'} className="w-full rounded-lg border border-border bg-black/10 px-3 py-2 text-sm text-muted" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <input disabled value={user?.email || ''} className="w-full rounded-lg border border-border bg-black/10 px-3 py-2 text-sm text-muted" />
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">To change your name or email, <a href="/support" className="text-accent-hover hover:underline">contact support</a>.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:p-6">
        <h2 className="font-semibold">Change password</h2>
        {changePasswordMutation.isSuccess && (
          <div className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            Password changed. Your other sessions have been signed out.
          </div>
        )}
        {changePasswordMutation.isError && (
          <div className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{changePasswordMutation.error.message}</div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-sm text-muted">Min 8 characters, one uppercase letter, one number.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => changePasswordMutation.mutate()}
            disabled={changePasswordMutation.isPending || !currentPassword || !newPassword}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {changePasswordMutation.isPending ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center sm:p-6 sm:pb-4">
          <div>
            <h2 className="font-semibold">Active sessions</h2>
            <p className="mt-1 text-sm text-muted">Devices and browsers currently signed in to your account.</p>
          </div>
          <button
            onClick={handleLogoutEverywhere}
            className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5"
          >
            Log out everywhere
          </button>
        </div>

        {isLoading ? (
          <div role="status" aria-label="Loading active sessions" className="space-y-3 p-4 sm:p-6">
            <span className="sr-only">Loading sessions…</span>
            <div className="grid grid-cols-1 gap-4 border-b border-accent/15 pb-3 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-3 w-2/3" />)}
            </div>
            {Array.from({ length: 3 }, (_, row) => (
              <div key={row} className="grid grid-cols-1 items-center gap-4 border-b border-accent/10 py-2 last:border-0 sm:grid-cols-4">
                {Array.from({ length: 4 }, (_, column) => <Skeleton key={column} className={`h-4 ${column === 0 ? 'w-4/5' : 'w-3/5'}`} />)}
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState compact title="No active sessions" description="There are no other signed-in devices on this account." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-2 font-medium">Device / IP</th>
                <th className="px-6 py-2 font-medium">Started</th>
                <th className="px-6 py-2 font-medium">Last active</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3">
                    <p className="truncate text-sm" title={s.userAgent}>{s.userAgent || 'Unknown device'}</p>
                    <p className="font-mono text-xs text-muted">{s.ip || '—'}</p>
                  </td>
                  <td className="px-6 py-3 text-muted">{formatDateTime(s.createdAt)}</td>
                  <td className="px-6 py-3 text-muted">{timeAgo(s.lastUsedAt)}</td>
                  <td className="px-6 py-3 text-right">
                    {s.current ? (
                      <span className="text-xs text-success">This device</span>
                    ) : (
                      <button
                        onClick={() => revokeMutation.mutate(s.id)}
                        className="text-sm text-muted hover:text-danger"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
