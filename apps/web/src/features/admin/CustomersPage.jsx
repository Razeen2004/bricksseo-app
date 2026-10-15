import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Download, MoreHorizontal, Trash2, Users, UserPlus, X } from 'lucide-react';
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
import Skeleton from '../../components/ui/Skeleton';

const FILTERS = ['all', 'active', 'expired', 'refunded'];

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [addLicenseOpen, setAddLicenseOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ email: '', name: '', planCode: '', siteLimit: '', expiresAt: '', notes: '' });
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

  const licenseOptionsQuery = useQuery({
    queryKey: ['admin-customer-license-options'],
    queryFn: () => apiFetch('/admin/customers/license-options'),
    enabled: addLicenseOpen,
  });

  const createLicenseMutation = useMutation({
    mutationFn: (payload) => apiFetch('/admin/customers/create-license', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-licenses'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      setAddLicenseOpen(false);
      setNewCustomer({ email: '', name: '', planCode: '', siteLimit: '', expiresAt: '', notes: '' });
      setStatus('all');
      setSearch('');
      setPage(1);
      setSelectedIds([]);
      if (result.emailSent) {
        toast.success(`License issued and emailed to ${result.customer.email}.`);
      } else {
        toast.error(`License created for ${result.customer.email}, but the email could not be sent: ${result.emailError || 'unknown email error'}`);
      }
    },
  });

  const availablePlans = licenseOptionsQuery.data?.plans ?? [];

  function submitNewCustomer(event) {
    event.preventDefault();
    if (!newCustomer.planCode) return;
    const date = newCustomer.expiresAt ? new Date(`${newCustomer.expiresAt}T00:00:00.000Z`).toISOString() : null;
    createLicenseMutation.mutate({
      email: newCustomer.email,
      name: newCustomer.name,
      planCode: newCustomer.planCode,
      siteLimit: newCustomer.siteLimit === '' ? undefined : Number(newCustomer.siteLimit),
      expiresAt: date,
      notes: newCustomer.notes,
    });
  }

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
      <PageHeader eyebrow="Admin" title="Customers." description="Customer accounts and their Bricks SEO licenses." icon={Users} />

      {isLoading ? <AdminStatsSkeleton count={4} /> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard label="Total customers" value={stats.total ?? 0} />
        <StatCard label="Active" value={stats.active ?? 0} valueClassName="text-success" sub={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% of total` : ''} />
        <StatCard label="Churned" value={stats.churned ?? 0} sub="No active license" />
        <StatCard label="Avg LTV" value={formatMoney(stats.avgLtvMinor ?? 0)} sub="Across all customers" />
      </div>}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6 sm:pb-4">
          <button
            type="button"
            onClick={() => { setNewCustomer({ email: '', name: '', planCode: availablePlans[0]?.code ?? '', siteLimit: '', expiresAt: '', notes: '' }); setAddLicenseOpen(true); }}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            <UserPlus size={15} /> Add customer
          </button>
          <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); setSelectedIds([]); }}
              placeholder="Search by email..."
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

      {addLicenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 sm:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="add-customer-license-title" className="my-auto max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="add-customer-license-title" className="text-lg font-semibold">Add customer and issue a license</h2>
                <p className="mt-1 text-sm text-muted">Creates a customer account if needed, issues an active key, records the admin action, and emails the account details or new key. This does not create a Paddle charge or auto-renewing subscription.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => { setAddLicenseOpen(false); createLicenseMutation.reset(); }} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink"><X size={18} /></button>
            </div>

            {licenseOptionsQuery.isLoading ? (
              <div role="status" aria-label="Loading plans" className="mt-6 space-y-3"><span className="sr-only">Loading plans…</span><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /></div>
            ) : licenseOptionsQuery.isError ? (
              <p role="alert" className="mt-5 rounded-lg bg-danger/10 p-3 text-sm text-danger">{licenseOptionsQuery.error.message}</p>
            ) : availablePlans.length === 0 ? (
              <p className="mt-5 rounded-lg bg-danger/10 p-3 text-sm text-danger">There are no active plans available. Activate a plan in the database before issuing a license.</p>
            ) : (
              <form onSubmit={submitNewCustomer} className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="new-customer-email" className="mb-1.5 block text-sm font-medium">Customer email</label>
                    <input id="new-customer-email" type="email" required maxLength={320} value={newCustomer.email} onChange={event => setNewCustomer({ ...newCustomer, email: event.target.value })} placeholder="customer@example.com" className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                  <div>
                    <label htmlFor="new-customer-name" className="mb-1.5 block text-sm font-medium">Name <span className="font-normal text-muted">(optional)</span></label>
                    <input id="new-customer-name" maxLength={160} value={newCustomer.name} onChange={event => setNewCustomer({ ...newCustomer, name: event.target.value })} placeholder="Customer name" className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                  <div>
                    <label htmlFor="new-customer-plan" className="mb-1.5 block text-sm font-medium">Plan</label>
                    <select id="new-customer-plan" required value={newCustomer.planCode} onChange={event => setNewCustomer({ ...newCustomer, planCode: event.target.value, siteLimit: '' })} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
                      <option value="">Select a plan</option>
                      {availablePlans.map(plan => <option key={plan.code} value={plan.code}>{plan.name} · {plan.interval === 'lifetime' ? 'lifetime' : 'annual'}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="new-customer-site-limit" className="mb-1.5 block text-sm font-medium">Site limit override <span className="font-normal text-muted">(optional)</span></label>
                    <input id="new-customer-site-limit" type="number" min="1" max="10000" value={newCustomer.siteLimit} onChange={event => setNewCustomer({ ...newCustomer, siteLimit: event.target.value })} placeholder={`Plan default${availablePlans.find(plan => plan.code === newCustomer.planCode)?.siteLimit ? ` (${availablePlans.find(plan => plan.code === newCustomer.planCode).siteLimit})` : ' (unlimited)'}`} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                  <div>
                    <label htmlFor="new-customer-expiry" className="mb-1.5 block text-sm font-medium">Expiry date <span className="font-normal text-muted">(optional)</span></label>
                    <input id="new-customer-expiry" type="date" min={new Date().toISOString().slice(0, 10)} value={newCustomer.expiresAt} onChange={event => setNewCustomer({ ...newCustomer, expiresAt: event.target.value })} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                    <p className="mt-1 text-xs text-muted">Defaults to one year for annual plans; lifetime plans have no expiry.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="new-customer-notes" className="mb-1.5 block text-sm font-medium">Internal notes <span className="font-normal text-muted">(optional)</span></label>
                    <textarea id="new-customer-notes" maxLength={2000} rows={3} value={newCustomer.notes} onChange={event => setNewCustomer({ ...newCustomer, notes: event.target.value })} className="w-full resize-y rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                </div>
                {createLicenseMutation.isError && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{createLicenseMutation.error.message}</p>}
                <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
                  <button type="button" onClick={() => { setAddLicenseOpen(false); createLicenseMutation.reset(); }} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5">Cancel</button>
                  <button type="submit" disabled={createLicenseMutation.isPending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"><UserPlus size={15} /> {createLicenseMutation.isPending ? 'Creating and emailing…' : 'Create customer & issue license'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
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
