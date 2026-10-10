import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, AlertTriangle, Download, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import StatCard from '../../components/ui/StatCard';
import Pagination from '../../components/ui/Pagination';

const FILTERS = ['all', 'active', 'stale30', 'stale90', 'outdated'];
const FILTER_LABELS = { all: 'All', active: 'Active', stale30: 'Stale 30d+', stale90: 'Stale 90d+', outdated: 'Outdated plugin' };

export default function AllSitesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-sites', search, status, page],
    queryFn: () => apiFetch(`/admin/sites?search=${encodeURIComponent(search)}&status=${status}&page=${page}`),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => apiFetch(`/admin/sites/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sites'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/admin/sites/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sites'] }),
  });

  const sites = data?.sites ?? [];
  const stats = data?.stats ?? {};

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-1 font-serif text-4xl italic">All sites.</h1>
        <p className="mt-1 text-muted">Every domain activated across all licenses.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total sites" value={stats.total ?? 0} />
        <StatCard label="Active" value={stats.active ?? 0} valueClassName="text-success" sub="Pinged in last 7 days" />
        <StatCard label="Stale (30d+)" value={stats.stale30 ?? 0} valueClassName="text-amber-400" sub="Not seen in a month" />
        <StatCard label="Stale (90d+)" value={stats.stale90 ?? 0} valueClassName="text-danger" sub="Likely abandoned" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 p-6 pb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by domain..."
              className="w-full rounded-lg border border-border bg-black/30 py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => { setStatus(f); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${status === f ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:text-ink'}`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          <a
            href="/v1/admin/sites/export.csv"
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
                <th className="px-6 py-2 font-medium">Domain</th>
                <th className="px-6 py-2 font-medium">Customer</th>
                <th className="px-6 py-2 font-medium">License</th>
                <th className="px-6 py-2 font-medium">WP</th>
                <th className="px-6 py-2 font-medium">Plugin</th>
                <th className="px-6 py-2 font-medium">Last seen</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sites.map(s => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-mono text-sm">{s.domain.replace(/^https?:\/\//, '')}</td>
                  <td className="px-6 py-3 font-mono text-xs text-muted">{s.customerEmail}</td>
                  <td className="px-6 py-3 font-mono text-xs text-muted">{s.licenseKeyHint}</td>
                  <td className="px-6 py-3 text-muted">{s.wpVersion || '—'}</td>
                  <td className="px-6 py-3 text-muted">
                    <span className="inline-flex items-center gap-1">
                      {s.pluginVersion || '—'}
                      {s.outdated && <AlertTriangle size={12} className="text-amber-400" />}
                    </span>
                  </td>
                  <td className={`px-6 py-3 ${s.status === 'stale90' ? 'text-danger' : s.status === 'stale30' ? 'text-amber-400' : 'text-muted'}`}>
                    {timeAgo(s.lastSeenAt)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {s.status !== 'removed' ? (
                      <button onClick={() => deactivateMutation.mutate(s.id)} className="text-sm text-muted hover:text-danger">
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => { if (confirm('Permanently delete this site?')) deleteMutation.mutate(s.id); }}
                        disabled={deleteMutation.isPending}
                        aria-label="Delete site"
                        title="Delete"
                        className="text-muted hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />}
      </div>

      <p className="text-sm text-muted">"Outdated" means more than two releases behind the latest plugin version. Deactivating frees the license slot immediately.</p>
    </div>
  );
}
