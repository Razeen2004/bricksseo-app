import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { timeAgo } from '../../lib/format';

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => apiFetch('/admin/webhooks?status=failed'),
    refetchInterval: 30000,
  });

  const failed = data?.webhooks ?? [];
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
            Notifications
          </div>
          {failed.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">No failed webhooks. You're all caught up.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {failed.slice(0, 5).map(w => (
                <button
                  key={w.id}
                  onClick={() => { setOpen(false); navigate('/admin/webhooks'); }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/5"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                  <div>
                    <p className="text-sm">
                      <span className="font-mono">{w.eventType}</span> failed{w.customerEmail ? ` — ${w.customerEmail}` : ''}
                    </p>
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
            View all webhooks →
          </button>
        </div>
      )}
    </div>
  );
}
