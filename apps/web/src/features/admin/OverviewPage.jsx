import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CreditCard, Globe, UserPlus, XCircle, RotateCcw, ArrowUpRight } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatMoney, timeAgo } from '../../lib/format';
import StatCard from '../../components/ui/StatCard';

const RANGES = ['7d', '30d', '90d', '12w'];

const ACTIVITY_ICON = {
  issued: CreditCard,
  renewed: CreditCard,
  site_activated: Globe,
  site_deactivated: XCircle,
  revoked: RotateCcw,
};

function activityLine(e) {
  switch (e.type) {
    case 'issued': return <>{e.email} <strong>purchased</strong> {e.planCode}</>;
    case 'renewed': return <>{e.email} <strong>renewed</strong> {e.planCode}</>;
    case 'site_activated': return <>{e.email} <strong>activated</strong> {e.meta?.siteUrl ?? 'a site'}</>;
    case 'site_deactivated': return <>{e.email} <strong>deactivated</strong> {e.meta?.siteUrl ?? 'a site'}</>;
    case 'revoked': return <>{e.email} <strong>was revoked</strong></>;
    case 'reinstated': return <>{e.email} <strong>was reinstated</strong></>;
    default: return <>{e.email} — {e.type}</>;
  }
}

export default function OverviewPage() {
  const [range, setRange] = useState('12w');

  const { data } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiFetch('/admin/overview'),
  });

  const { data: chartData } = useQuery({
    queryKey: ['admin-overview-chart', range],
    queryFn: () => apiFetch(`/admin/overview/chart?range=${range}`),
  });

  const points = (chartData?.points ?? []).map(p => ({
    label: new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    count: p.count,
  }));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-1 font-serif text-4xl italic">Overview.</h1>
        <p className="mt-1 text-muted">Everything happening in Bricks SEO right now.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Revenue (all-time)" value={formatMoney(data?.revenueAllTimeMinor ?? 0)} sub={`+${data?.newLicensesThisWeek ?? 0} licenses this week`} />
        <StatCard label="Active licenses" value={data?.activeLicenses ?? 0} sub={`${data?.newLicensesThisWeek ?? 0} new this week`} />
        <StatCard label="Active sites" value={data?.activeSites ?? 0} sub={`Across ${data?.customerCount ?? 0} customers`} />
        <StatCard label="MRR" value={formatMoney(data?.mrrMinor ?? 0)} sub="Based on annual conversions" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">New licenses per week</h2>
          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  range === r ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:text-ink'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <defs>
                <linearGradient id="licenseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7b79f5" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#7b79f5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" stroke="#9999a6" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#9999a6" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0e0e12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="count" stroke="#7b79f5" strokeWidth={2} fill="url(#licenseFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card">
          <h2 className="p-6 pb-4 font-semibold">Recent activity</h2>
          <div>
            {(data?.recentActivity ?? []).map(e => {
              const Icon = ACTIVITY_ICON[e.type] || UserPlus;
              return (
                <div key={e.id} className="flex items-start gap-3 border-t border-border px-6 py-3">
                  <Icon size={16} className="mt-0.5 text-muted" />
                  <div>
                    <p className="text-sm">{activityLine(e)}</p>
                    <p className="text-xs text-muted">{timeAgo(e.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            {(data?.recentActivity ?? []).length === 0 && (
              <p className="px-6 py-6 text-sm text-muted">No activity yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">System health</h2>
          <div className="mt-4 space-y-3">
            <HealthRow label="Webhook queue" value={`${data?.systemHealth?.webhookQueue?.failed24h ?? 0} failed in 24h`} healthy={data?.systemHealth?.webhookQueue?.healthy} />
            <HealthRow
              label="Email delivery"
              value={data?.systemHealth?.emailDelivery?.lastSentAt ? `Last sent ${timeAgo(data.systemHealth.emailDelivery.lastSentAt)}` : 'No emails sent yet'}
              healthy={data?.systemHealth?.emailDelivery?.healthy}
            />
            <HealthRow label="Database" value="Connected" healthy />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="font-semibold">Top customers by revenue</h2>
          <a href="/admin/customers" className="flex items-center gap-1 text-sm text-accent-hover hover:underline">
            See all <ArrowUpRight size={14} />
          </a>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
              <th className="px-6 py-2 font-medium">Email</th>
              <th className="px-6 py-2 font-medium">Plan</th>
              <th className="px-6 py-2 font-medium">Lifetime value</th>
              <th className="px-6 py-2 font-medium">Licenses</th>
              <th className="px-6 py-2 font-medium">Sites</th>
              <th className="px-6 py-2 font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {(data?.topCustomers ?? []).map(c => (
              <tr key={c.email} className="border-b border-border last:border-0">
                <td className="px-6 py-3 font-mono text-sm">{c.email}</td>
                <td className="px-6 py-3 text-muted">{c.plan}</td>
                <td className="px-6 py-3 font-mono">{formatMoney(c.lifetimeValueMinor)}</td>
                <td className="px-6 py-3 text-muted">{c.licenses}</td>
                <td className="px-6 py-3 text-muted">{c.sites}</td>
                <td className="px-6 py-3 text-muted">{timeAgo(c.lastActive)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HealthRow({ label, value, healthy }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">{value}</p>
      </div>
      <span className={`flex items-center gap-1.5 text-xs font-medium ${healthy ? 'text-success' : 'text-danger'}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {healthy ? 'Healthy' : 'Degraded'}
      </span>
    </div>
  );
}
