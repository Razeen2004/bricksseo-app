import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Eye, EyeOff, ChevronDown, ChevronUp, KeyRound } from 'lucide-react';
import { timeAgo } from '../../lib/format';
import { apiFetch } from '../../lib/api';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function LicenseCard({ license }) {
  const [revealedKey, setRevealedKey] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const revealMutation = useMutation({
    mutationFn: () => apiFetch(`/account/licenses/${license.id}/reveal`, { method: 'POST' }),
    onSuccess: (data) => setRevealedKey(data.key),
  });

  const sitesUsed = license.sitesUsed ?? 0;
  const pct = license.siteLimit ? Math.min(100, (sitesUsed / license.siteLimit) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <code className="break-all font-mono text-sm sm:text-base">
            {revealedKey || license.keyHint}
          </code>
          <button
            onClick={() => revealMutation.mutate()}
            disabled={revealMutation.isPending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-ink disabled:opacity-50"
            title={revealedKey ? 'Key revealed' : 'Reveal key'}
            aria-label={revealedKey ? 'Hide license key' : 'Reveal license key'}
          >
            {revealedKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <Badge status={license.status} />
      </div>

      <span className="mt-3 inline-block rounded-md bg-white/5 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {license.planName}
      </span>

      <div className="mt-3 flex items-center gap-3 text-sm text-muted">
        <span>
          {license.siteLimit ?? 'Unlimited'} sites · annual
          {license.expiresAt && ` · ${license.status === 'expired' ? 'expired' : 'expires'} ${formatDate(license.expiresAt)}`}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setDetailsOpen(v => !v)}
          className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-white/5"
        >
          {detailsOpen ? 'Hide details' : 'View details'}
          {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <a href="/billing" className="flex min-h-10 items-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-white/5">
          Manage billing
        </a>
      </div>

      {license.siteLimit && (
        <>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">{sitesUsed} of {license.siteLimit} sites used</p>
        </>
      )}

      {detailsOpen && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Activated sites</p>
          {(license.activations ?? []).length === 0 ? (
            <p className="text-sm text-muted">No sites activated on this license yet.</p>
          ) : (
            <div className="space-y-2">
              {license.activations.map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm">
                  <span className="font-mono">{a.siteUrl?.replace(/^https?:\/\//, '')}</span>
                  <span className="text-muted">{a.deactivatedAt ? 'Removed' : `Last seen ${timeAgo(a.lastSeenAt)}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LicensesPage() {
  const { licenses } = useOutletContext();

  const totalSites = licenses.reduce((sum, l) => sum + (l.sitesUsed ?? 0), 0);
  const totalSlots = licenses.reduce((sum, l) => sum + (l.siteLimit ?? 0), 0);
  const activeCount = licenses.filter(l => l.status === 'active').length;
  const nextRenewal = licenses
    .filter(l => l.status === 'active' && l.expiresAt)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))[0];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader eyebrow="Account" title="Your licenses." description="Every Bricks SEO license tied to this email." icon={KeyRound} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        <StatCard
          label="Total licenses"
          value={licenses.length}
          sub={`${activeCount} active, ${licenses.length - activeCount} other`}
        />
        <StatCard label="Total sites" value={`${totalSites} / ${totalSlots || '∞'}`} sub="Across all licenses" />
        <StatCard
          label="Next expiry"
          value={nextRenewal ? formatDate(nextRenewal.expiresAt) : '—'}
          sub={nextRenewal ? nextRenewal.planName : 'No upcoming renewals'}
        />
      </div>

      {licenses.length === 0 ? (
        <EmptyState title="No licenses yet" description="Purchased licenses will appear here with their activation limits and expiry dates." />
      ) : (
        <div className="space-y-4">
          {licenses.map(license => <LicenseCard key={license.id} license={license} />)}
        </div>
      )}

      <p className="text-sm text-muted">Each license can be activated on the number of sites shown on your plan.</p>
    </div>
  );
}
