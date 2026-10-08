import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, RotateCcw, Copy } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatDateTime, timeAgo } from '../../lib/format';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Drawer from '../../components/ui/Drawer';
import Pagination from '../../components/ui/Pagination';

const FILTERS = ['all', 'processed', 'failed', 'pending'];

export default function WebhooksPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-webhooks', search, status, page],
    queryFn: () => apiFetch(`/admin/webhooks?search=${encodeURIComponent(search)}&status=${status}&page=${page}`),
  });

  const { data: detail } = useQuery({
    queryKey: ['admin-webhook-detail', openId],
    queryFn: () => apiFetch(`/admin/webhooks/${openId}`),
    enabled: !!openId,
  });

  const replayMutation = useMutation({
    mutationFn: (id) => apiFetch(`/admin/webhooks/${id}/replay`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] }),
  });

  const replayFailedMutation = useMutation({
    mutationFn: () => apiFetch('/admin/webhooks/replay-failed', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] }),
  });

  const webhooks = data?.webhooks ?? [];
  const stats = data?.stats ?? {};

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-1 font-serif text-4xl italic">Webhooks.</h1>
        <p className="mt-1 text-muted">Every Paddle webhook received by the license server.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Received (24h)" value={stats.received24h ?? 0} />
        <StatCard label="Failed (24h)" value={stats.failed24h ?? 0} valueClassName={stats.failed24h ? 'text-danger' : ''} />
        <StatCard label="Last event" value={stats.lastEventAt ? timeAgo(stats.lastEventAt) : '—'} sub={stats.lastEventType ?? ''} />
        <StatCard label="Status" value={stats.failed24h ? 'Degraded' : 'Healthy'} valueClassName={stats.failed24h ? 'text-amber-400' : 'text-success'} />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 p-6 pb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by event ID or email..."
              className="w-full rounded-lg border border-border bg-black/30 py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => { setStatus(f); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${status === f ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:text-ink'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => replayFailedMutation.mutate()}
            disabled={replayFailedMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
          >
            <RotateCcw size={14} /> Replay failed
          </button>
        </div>

        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted">Loading…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-2 font-medium">Timestamp</th>
                <th className="px-6 py-2 font-medium">Event type</th>
                <th className="px-6 py-2 font-medium">Customer</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map(w => (
                <tr key={w.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-mono text-xs text-muted">{formatDateTime(w.receivedAt)}</td>
                  <td className="px-6 py-3 font-mono text-sm">{w.eventType}</td>
                  <td className="px-6 py-3 font-mono text-xs text-muted">{w.customerEmail || '—'}</td>
                  <td className="px-6 py-3"><Badge status={w.status} /></td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => setOpenId(w.id)} className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-white/5">
                        View payload
                      </button>
                      {w.status === 'failed' && (
                        <button onClick={() => replayMutation.mutate(w.id)} className="text-xs text-accent-hover hover:underline">
                          Replay
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />}
      </div>

      <p className="text-sm text-muted">Replaying re-processes the event on the license server. Payloads are kept for 90 days.</p>

      <Drawer open={!!openId} title="Webhook payload" onClose={() => setOpenId(null)}>
        {detail?.webhook && (
          <div className="space-y-4">
            <Row label="Event ID" value={detail.webhook.eventId} mono />
            <Row label="Event type" value={detail.webhook.eventType} />
            <Row label="Received at" value={formatDateTime(detail.webhook.receivedAt)} />
            <Row label="Status" value={<Badge status={detail.webhook.status} />} />

            <div className="rounded-lg border border-border bg-black/30 p-4">
              <div className="mb-2 flex justify-end">
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(detail.webhook.payload, null, 2))}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-white/5"
                >
                  <Copy size={12} /> Copy JSON
                </button>
              </div>
              <pre className="overflow-x-auto font-mono text-xs text-muted">{JSON.stringify(detail.webhook.payload, null, 2)}</pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
