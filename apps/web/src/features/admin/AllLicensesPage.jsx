import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Download, Copy, Eye, MoreHorizontal } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/format';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';

const FILTERS = ['all', 'active', 'expires_soon', 'expired', 'revoked'];

export default function AllLicensesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [revealed, setRevealed] = useState({});
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-licenses', search, status, sort, page],
    queryFn: () => apiFetch(`/admin/licenses?search=${encodeURIComponent(search)}&status=${status}&sort=${sort}&page=${page}`),
  });

  const revealMutation = useMutation({
    mutationFn: (id) => apiFetch(`/admin/licenses/${id}/reveal`, { method: 'POST' }),
    onSuccess: (res, id) => setRevealed(prev => ({ ...prev, [id]: res.key })),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, password }) => apiFetch(`/admin/licenses/${id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-licenses'] });
      setConfirmAction(null);
    },
  });

  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  const licenses = data?.licenses ?? [];
  const stats = data?.stats ?? {};
  const allSelected = licenses.length > 0 && selectedIds.length === licenses.length;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : licenses.map(l => l.id));
  }

  function toggleOne(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-1 font-serif text-4xl italic">All licenses.</h1>
        <p className="mt-1 text-muted">Every Bricks SEO license across all customers.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={stats.total ?? 0} sub={`${stats.customers ?? 0} customers`} />
        <StatCard label="Active" value={stats.active ?? 0} valueClassName="text-success" sub={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% of total` : ''} />
        <StatCard label="Expiring soon" value={stats.expiringSoon ?? 0} valueClassName="text-amber-400" sub="Next 30 days" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 p-6 pb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by key or email..."
              className="w-full rounded-lg border border-border bg-black/30 py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => updateFilter(setStatus)(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${status === f ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:text-ink'}`}
              >
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>Sort</span>
            <select
              value={sort}
              onChange={e => updateFilter(setSort)(e.target.value)}
              className="rounded-lg border border-border bg-black/30 px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          <a
            href="/v1/admin/licenses/export.csv"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white/5"
          >
            <Download size={14} /> Export CSV
          </a>
        </div>

        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted">Loading…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
                <th className="w-10 px-6 py-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-border bg-black/30" />
                </th>
                <th className="px-6 py-2 font-medium">License key</th>
                <th className="px-6 py-2 font-medium">Customer</th>
                <th className="px-6 py-2 font-medium">Plan</th>
                <th className="px-6 py-2 font-medium">Sites</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Renews</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {licenses.map(l => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3">
                    <input type="checkbox" checked={selectedIds.includes(l.id)} onChange={() => toggleOne(l.id)} className="rounded border-border bg-black/30" />
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 font-mono text-sm">
                      {revealed[l.id] || l.keyHint}
                      <button onClick={() => revealMutation.mutate(l.id)} className="text-muted hover:text-ink">
                        <Eye size={14} />
                      </button>
                      {revealed[l.id] && (
                        <button onClick={() => navigator.clipboard.writeText(revealed[l.id])} className="text-muted hover:text-ink">
                          <Copy size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-muted">{l.customerEmail}</td>
                  <td className="px-6 py-3 text-muted">{l.planName}</td>
                  <td className="px-6 py-3 text-muted">{l.sitesUsed} / {l.siteLimit ?? '∞'}</td>
                  <td className="px-6 py-3"><Badge status={l.status} /></td>
                  <td className="px-6 py-3 text-muted">{formatDate(l.expiresAt)}</td>
                  <td className="relative px-6 py-3 text-right">
                    <button onClick={() => setOpenMenuId(openMenuId === l.id ? null : l.id)} className="text-muted hover:text-ink">
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenuId === l.id && (
                      <div className="absolute right-6 top-10 z-10 w-44 rounded-lg border border-border bg-card py-1 text-left shadow-xl">
                        {l.status === 'revoked' ? (
                          <button onClick={() => { setOpenMenuId(null); setConfirmAction({ license: l, action: 'reinstate' }); }} className="block w-full px-3 py-2 text-sm hover:bg-white/5">Reinstate</button>
                        ) : (
                          <button onClick={() => { setOpenMenuId(null); setConfirmAction({ license: l, action: 'revoke' }); }} className="block w-full px-3 py-2 text-sm text-danger hover:bg-white/5">Revoke</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />}
      </div>

      <p className="text-sm text-muted">Revoking or deleting a license deactivates its sites straight away. Every action is written to the activity log. <a href="/admin/logs" className="text-accent-hover hover:underline">View logs →</a></p>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.action === 'revoke' ? 'Revoke this license?' : 'Reinstate this license?'}
        description={confirmAction?.action === 'revoke' ? 'This deactivates all of its sites immediately.' : 'This restores access for the customer.'}
        danger={confirmAction?.action === 'revoke'}
        confirmLabel={confirmAction?.action === 'revoke' ? 'Revoke' : 'Reinstate'}
        requirePassword
        pending={actionMutation.isPending}
        error={actionMutation.isError ? actionMutation.error.message : null}
        onCancel={() => setConfirmAction(null)}
        onConfirm={({ password }) => actionMutation.mutate({ id: confirmAction.license.id, action: confirmAction.action, password })}
      />
    </div>
  );
}
