import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, AlertTriangle, CheckCheck, ShoppingCart } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatMoney, timeAgo } from '../../lib/format';

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => apiFetch('/admin/notifications'),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: () => apiFetch('/admin/notifications/read', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });

  const purchases = data?.purchases ?? [];
  const failed = data?.failedWebhooks ?? [];
  const count = data?.total ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-card py-1 shadow-xl">
          <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            <div className="flex items-center justify-between gap-3">
              <span>Notifications</span>
              {count > 0 && (
                <button
                  onClick={() => markReadMutation.mutate()}
                  disabled={markReadMutation.isPending}
                  className="inline-flex items-center gap-1 normal-case tracking-normal text-accent-hover hover:underline disabled:opacity-50"
                >
                  <CheckCheck size={13} /> {markReadMutation.isPending ? 'Saving…' : 'Mark all as read'}
                </button>
              )}
            </div>
          </div>
          {markReadMutation.isError && <p className="px-3 pt-2 text-xs text-danger">{markReadMutation.error.message}</p>}
          {purchases.length === 0 && failed.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">No purchases in the last {data?.purchaseWindowDays ?? 7} days and no failed webhooks.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {purchases.map(purchase => (
                <button
                  key={`purchase-${purchase.id}`}
                  onClick={() => { setOpen(false); navigate('/admin/customers'); }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/5"
                >
                  <ShoppingCart size={14} className="mt-0.5 shrink-0 text-accent-hover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">Purchase completed — {purchase.email}</p>
                    <p className="text-xs text-muted">{formatMoney(purchase.totalMinor, purchase.currency)} · {timeAgo(purchase.createdAt)}</p>
                  </div>
                </button>
              ))}
              {failed.map(w => (
                <button
                  key={w.id}
                  onClick={() => { setOpen(false); navigate('/admin/webhooks'); }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/5"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                  <div>
                    <p className="text-sm"><span className="font-mono">{w.eventType}</span> failed</p>
                    <p className="text-xs text-muted">{timeAgo(w.receivedAt)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => { setOpen(false); navigate('/admin/webhooks'); }}
            className="block w-full border-t border-border px-3 py-2 text-left text-sm text-accent-hover hover:bg-white/5"
          >
            View webhooks →
          </button>
        </div>
      )}
    </div>
  );
}
