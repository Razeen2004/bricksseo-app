import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import Pagination from '../../components/ui/Pagination';

export default function LogsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs', page],
    queryFn: () => apiFetch(`/admin/logs?page=${page}`),
  });

  const logs = data?.logs ?? [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-1 font-serif text-4xl italic">Logs.</h1>
        <p className="mt-1 text-muted">Every admin action, audited.</p>
      </header>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <p className="px-6 py-6 text-sm text-muted">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted">No audit events yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-2 font-medium">Time</th>
                <th className="px-6 py-2 font-medium">Actor</th>
                <th className="px-6 py-2 font-medium">Action</th>
                <th className="px-6 py-2 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-mono text-xs text-muted">{formatDateTime(l.createdAt)}</td>
                  <td className="px-6 py-3 font-mono text-xs text-muted">{l.actor}</td>
                  <td className="px-6 py-3 font-mono text-sm">{l.action}</td>
                  <td className="px-6 py-3 font-mono text-xs text-muted">{l.targetType}:{l.targetId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />}
      </div>
    </div>
  );
}
