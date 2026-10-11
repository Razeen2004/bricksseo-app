import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Download, MoreHorizontal, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../../lib/api';
import AdminTableSkeleton from '../../components/ui/AdminTableSkeleton';
import AdminStatsSkeleton from '../../components/ui/AdminStatsSkeleton';
import { formatMoney, timeAgo } from '../../lib/format';
import StatCard from '../../components/ui/StatCard';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';

const FILTERS = ['all', 'active', 'expired', 'refunded'];

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
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

  const deleteMutation = useMutation({
    mutationFn: ({ ids, password }) => apiFetch('/admin/customers', {
      method: 'DELETE',
      body: JSON.stringify({ ids, password }),
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-licenses'] });
      queryClient.invalidateQueries({ queryKey: ['admin-sites'] });
      setSelectedIds([]);
      setConfirmDelete(null);
      toast.success(`${result.deleted} customer${result.deleted === 1 ? '' : 's'} deleted.`);
    },
    onError: (error) => toast.error(error.message || 'Could not delete customers'),
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
    return (value) => { setter(value); setPage(1); setSelectedIds([]); };
  }

  const customers = data?.customers ?? [];
  const stats = data?.stats ?? {};
  const allSelected = customers.length > 0 && customers.every(customer => selectedIds.includes(customer.id));

  function toggleAll() {
    setSelectedIds(current => {
      const next = allSelected
        ? current.filter(id => !customers.some(customer => customer.id === id))
        : [...new Set([...current, ...customers.map(customer => customer.id)])];
      if (next.length > 500) {
        toast.error('You can delete up to 500 customers at a time.');
        return current;
      }
      return next;
    });
  }

  function toggleOne(id) {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 500) {
        toast.error('You can delete up to 500 customers at a time.');
        return prev;
      }
      return [...prev, id];
    });
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader eyebrow="Admin" title="Customers." description="Every customer who has purchased a Bricks SEO license." icon={Users} />

      {isLoading ? <AdminStatsSkeleton count={4} /> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard label="Total customers" value={stats.total ?? 0} />
        <StatCard label="Active" value={stats.active ?? 0} valueClassName="text-success" sub={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% of total` : ''} />
        <StatCard label="Churned" value={stats.churned ?? 0} sub="No active license" />
        <StatCard label="Avg LTV" value={formatMoney(stats.avgLtvMinor ?? 0)} sub="Across all customers" />
      </div>}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6 sm:pb-4">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); setSelectedIds([]); }}
              placeholder="Search by email or domain..."
              className="w-full rounded-lg border border-border bg-black/30 py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border p-1">
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
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => { deleteMutation.reset(); setConfirmDelete({ ids: selectedIds, email: null }); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10"
            >
              <Trash2 size={14} /> Delete selected ({selectedIds.length})
            </button>
          )}
        </div>

        {isLoading ? (
          <AdminTableSkeleton columns={7} />
        ) : customers.length === 0 ? (
          <EmptyState compact title={search || status !== 'all' ? 'No customers match these filters' : 'No customers yet'} description={search || status !== 'all' ? 'Try changing the search or status filter.' : 'New customer accounts will appear here after a purchase.'} />
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
                        <button
                          onClick={() => { setOpenMenuId(null); deleteMutation.reset(); setConfirmDelete({ ids: [c.id], email: c.email }); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-white/5"
                        >
                          <Trash2 size={14} /> Delete customer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={nextPage => { setPage(nextPage); setSelectedIds([]); }} />}
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
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete?.email ? 'Delete this customer?' : `Delete ${confirmDelete?.ids.length ?? 0} customers?`}
        description="This permanently deletes the selected customer accounts, licenses, activations, sessions, and related purchase records. Type the confirmation text and enter your admin password."
        requireText={confirmDelete?.email ?? 'DELETE USERS'}
        requirePassword
        danger
        confirmLabel="Delete customers"
        pending={deleteMutation.isPending}
        error={deleteMutation.error?.message}
        onCancel={() => { setConfirmDelete(null); deleteMutation.reset(); }}
        onConfirm={({ password }) => deleteMutation.mutate({ ids: confirmDelete.ids, password })}
      />
    </div>
  );
}
