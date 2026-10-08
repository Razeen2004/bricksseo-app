import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Download, MoreHorizontal } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatMoney, timeAgo } from '../../lib/format';
import StatCard from '../../components/ui/StatCard';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';

const FILTERS = ['all', 'active', 'expired', 'refunded'];

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-customers', search, status, sort, page],
    queryFn: () => apiFetch(`/admin/customers?search=${encodeURIComponent(search)}&status=${status}&sort=${sort}&page=${page}`),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, password }) => apiFetch(`/admin/customers/${id}/${action}`, {
      method: 'POST',
      body: password !== undefined ? JSON.stringify({ password }) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      setConfirmAction(null);
    },
  });

  function runAction(customer, action, needsPassword) {
    setOpenMenuId(null);
    if (needsPassword) {
      setConfirmAction({ customer, action });
    } else {
      actionMutation.mutate({ id: customer.id, action });
    }
  }

  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  const customers = data?.customers ?? [];
  const stats = data?.stats ?? {};
  const allSelected = customers.length > 0 && selectedIds.length === customers.length;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : customers.map(c => c.id));
  }

  function toggleOne(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-1 font-serif text-4xl italic">Customers.</h1>
        <p className="mt-1 text-muted">Every customer who has purchased a Bricks SEO license.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total customers" value={stats.total ?? 0} />
        <StatCard label="Active" value={stats.active ?? 0} valueClassName="text-success" sub={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% of total` : ''} />
        <StatCard label="Churned" value={stats.churned ?? 0} sub="No active license" />
        <StatCard label="Avg LTV" value={formatMoney(stats.avgLtvMinor ?? 0)} sub="Across all customers" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 p-6 pb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by email or domain..."
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
                {f}
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
            href="/v1/admin/customers/export.csv"
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
                <th className="px-6 py-2 font-medium">Email</th>
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="px-6 py-2 font-medium">Plan</th>
                <th className="px-6 py-2 font-medium">Licenses</th>
                <th className="px-6 py-2 font-medium">Sites</th>
                <th className="px-6 py-2 font-medium">LTV</th>
                <th className="px-6 py-2 font-medium">Last active</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3">
                    <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleOne(c.id)} className="rounded border-border bg-black/30" />
                  </td>
                  <td className="px-6 py-3 font-mono text-sm">{c.email}{c.flagged && <span className="ml-2 text-xs text-danger">flagged</span>}</td>
                  <td className="px-6 py-3 text-muted">{c.name || '—'}</td>
                  <td className="px-6 py-3 text-muted">{c.plan}</td>
                  <td className="px-6 py-3 text-muted">{c.licenses}</td>
                  <td className="px-6 py-3 text-muted">{c.sitesUsed} / {c.sitesLimit || '∞'}</td>
                  <td className="px-6 py-3 font-mono">{formatMoney(c.ltvMinor)}</td>
                  <td className="px-6 py-3 text-muted">{timeAgo(c.lastActive)}</td>
                  <td className="relative px-6 py-3 text-right">
                    <button onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)} className="text-muted hover:text-ink">
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenuId === c.id && (
                      <div className="absolute right-6 top-10 z-10 w-52 rounded-lg border border-border bg-card py-1 text-left shadow-xl">
                        <button onClick={() => runAction(c, 'resend-credentials', false)} className="block w-full px-3 py-2 text-sm hover:bg-white/5">Resend credentials</button>
                        <button onClick={() => runAction(c, 'reset-password', false)} className="block w-full px-3 py-2 text-sm hover:bg-white/5">Send password reset</button>
                        <button onClick={() => runAction(c, 'toggle-status', true)} className="block w-full px-3 py-2 text-sm hover:bg-white/5">{c.status === 'active' ? 'Disable account' : 'Enable account'}</button>
                        <button onClick={() => runAction(c, 'toggle-flag', true)} className="block w-full px-3 py-2 text-sm text-danger hover:bg-white/5">{c.flagged ? 'Unflag' : 'Flag'} customer</button>
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

      <p className="text-sm text-muted">Impersonation and bulk revocations are written to the activity log. <a href="/admin/logs" className="text-accent-hover hover:underline">View logs →</a></p>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.action === 'toggle-status' ? 'Change account status?' : 'Change flag status?'}
        description={`This will affect ${confirmAction?.customer?.email}.`}
        requirePassword
        pending={actionMutation.isPending}
        error={actionMutation.isError ? actionMutation.error.message : null}
        onCancel={() => setConfirmAction(null)}
        onConfirm={({ password }) => actionMutation.mutate({ id: confirmAction.customer.id, action: confirmAction.action, password })}
      />
    </div>
  );
}
