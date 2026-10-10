import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import StatCard from '../../components/ui/StatCard';
import AddSiteInfoDialog from '../../components/ui/AddSiteInfoDialog';

const FILTERS = ['all', 'active', 'stale', 'removed'];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeAgo(d) {
  const diffMs = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export default function SitesPage() {
  const [filter, setFilter] = useState('all');
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sites', filter],
    queryFn: () => apiFetch(`/account/sites?status=${filter}`),
  });

  const deactivateMutation = useMutation({
    mutationFn: (activationId) => apiFetch(`/account/sites/${activationId}/deactivate`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (activationId) => apiFetch(`/account/sites/${activationId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites'] }),
  });

  const sites = data?.sites ?? [];
  const stats = data?.stats ?? { activeSites: 0, needsAttention: 0 };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Account</p>
        <h1 className="mt-1 font-serif text-4xl italic">Your sites.</h1>
        <p className="mt-1 text-muted">Every WordPress site currently using your Bricks SEO license.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active sites" value={stats.activeSites} valueClassName="text-success" sub="All pinging normally" />
        <StatCard label="Total sites" value={sites.length} sub="Across your licenses" />
        <StatCard
          label="Needs attention"
          value={stats.needsAttention}
          valueClassName={stats.needsAttention > 0 ? 'text-amber-400' : ''}
          sub="Sites not seen in 45+ days"
        />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
          <h2 className="text-lg font-semibold">Activated sites</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-border p-1">
              {FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    filter === f ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:text-ink'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAddSiteOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-accent bg-accent-dim px-3 py-1.5 text-sm font-medium text-accent-hover hover:bg-accent/20"
            >
              <Plus size={14} /> Add a site
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted">Loading…</p>
        ) : sites.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted">No sites found for this filter.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-2 font-medium">Domain</th>
                <th className="px-6 py-2 font-medium">License</th>
                <th className="px-6 py-2 font-medium">WP version</th>
                <th className="px-6 py-2 font-medium">Plugin version</th>
                <th className="px-6 py-2 font-medium">Last seen</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sites.map(s => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-mono text-sm">{s.domain.replace(/^https?:\/\//, '')}</td>
                  <td className="px-6 py-3 font-mono text-xs text-muted">{s.licenseKeyHint}</td>
                  <td className="px-6 py-3 text-muted">{s.wpVersion || '—'}</td>
                  <td className="px-6 py-3 text-muted">{s.pluginVersion || '—'}</td>
                  <td className="px-6 py-3 text-muted">{s.status === 'removed' ? formatDate(s.deactivatedAt) : timeAgo(s.lastSeenAt)}</td>
                  <td className="px-6 py-3 text-right">
                    {s.status !== 'removed' ? (
                      <button
                        onClick={() => deactivateMutation.mutate(s.id)}
                        className="text-sm text-muted hover:text-danger"
                      >
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
      </div>

      <p className="text-sm text-muted">Deactivating a site frees up a slot immediately. You can reactivate it anytime.</p>

      <AddSiteInfoDialog open={addSiteOpen} onClose={() => setAddSiteOpen(false)} />
    </div>
  );
}
