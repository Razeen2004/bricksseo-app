import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { timeAgo } from '../../lib/format';
import { apiFetch } from '../../lib/api';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';

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
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <code className="font-mono text-lg">
            {revealedKey || license.keyHint}
          </code>
          <button
            onClick={() => revealMutation.mutate()}
            className="text-muted hover:text-ink"
            title={revealedKey ? 'Key revealed' : 'Reveal key'}
          >
            {revealedKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <Badge status={license.status} />
      </div>

      <span className="mt-3 inline-block rounded-md bg-white/5 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {license.planName}
      </span>

      <div className="mt-3 flex items-center gap-3">
        <a href="/sites" className="text-sm font-medium hover:text-accent-hover">
          {license.siteLimit ?? 'Unlimited'} sites · annual
          {license.expiresAt && ` · ${license.status === 'expired' ? 'expired' : 'renews'} ${formatDate(license.expiresAt)}`}
        </a>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setDetailsOpen(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5"
        >
          {detailsOpen ? 'Hide details' : 'View details'}
          {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <a href="/billing" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5">
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
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Account</p>
        <h1 className="mt-1 font-serif text-4xl italic">Your licenses.</h1>
        <p className="mt-1 text-muted">Every Bricks SEO license tied to this email.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total licenses"
          value={licenses.length}
          sub={`${activeCount} active, ${licenses.length - activeCount} other`}
        />
        <StatCard label="Total sites" value={`${totalSites} / ${totalSlots || '∞'}`} sub="Across all licenses" />
        <StatCard
          label="Next renewal"
          value={nextRenewal ? formatDate(nextRenewal.expiresAt) : '—'}
          sub={nextRenewal ? nextRenewal.planName : 'No upcoming renewals'}
        />
      </div>

      {licenses.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted">
          No licenses on this account yet.
        </div>
      ) : (
        <div className="space-y-4">
          {licenses.map(license => <LicenseCard key={license.id} license={license} />)}
        </div>
      )}

      <p className="text-sm text-muted">Each license can be activated on the number of sites shown on your plan.</p>
    </div>
  );
}
