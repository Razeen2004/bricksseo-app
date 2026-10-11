import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import AdminTableSkeleton from '../../components/ui/AdminTableSkeleton';
import { formatDateTime } from '../../lib/format';
import Pagination from '../../components/ui/Pagination';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';

export default function LogsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs', page],
    queryFn: () => apiFetch(`/admin/logs?page=${page}`),
  });

  const logs = data?.logs ?? [];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader eyebrow="Admin" title="Logs." description="Every admin action, audited." icon={FileText} />

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <AdminTableSkeleton columns={4} className="px-6 py-2" />
        ) : logs.length === 0 ? (
          <EmptyState compact title="No audit events yet" description="Admin activity will be recorded here as changes are made." />
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
