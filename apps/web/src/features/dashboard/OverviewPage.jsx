import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Copy, Check, Plus, Download, BookOpen, MessageCircle, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import StatCard from '../../components/ui/StatCard';
import AddSiteInfoDialog from '../../components/ui/AddSiteInfoDialog';

function formatDate(d) {
  if (!d) return 'Never';
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

export default function OverviewPage() {
  const { user, licenses } = useOutletContext();
  const [copied, setCopied] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const queryClient = useQueryClient();

  const primaryLicense = licenses.find(l => l.status === 'active') || licenses[0];

  const { data: revealed } = useQuery({
    queryKey: ['license-reveal', primaryLicense?.id],
    queryFn: () => apiFetch(`/account/licenses/${primaryLicense.id}/reveal`, { method: 'POST' }),
    enabled: !!primaryLicense,
  });

  const deactivateMutation = useMutation({
    mutationFn: (activationId) => apiFetch(`/account/sites/${activationId}/deactivate`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  const downloadMutation = useMutation({
    mutationFn: () => apiFetch('/account/downloads/latest', { method: 'POST' }),
  });

  function handleCopy() {
    if (!revealed?.key) return;
    navigator.clipboard.writeText(revealed.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const activeSites = (primaryLicense?.activations || []).filter(a => !a.deactivatedAt);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">{today}</p>
        <h1 className="mt-1 font-serif text-4xl italic">Welcome back, {user?.name || user?.email}.</h1>
        <p className="mt-1 text-muted">Here's an overview of your Bricks SEO license.</p>
      </header>

      {!primaryLicense ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted">
          No licenses found on your account yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Status"
              value={<span className="capitalize">{primaryLicense.status}</span>}
              valueClassName={primaryLicense.status === 'active' ? 'text-success' : 'text-danger'}
              sub={primaryLicense.expiresAt ? `Renews ${formatDate(primaryLicense.expiresAt)}` : 'Lifetime license'}
            />
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted">Sites used</p>
              <p className="mt-2 text-3xl font-semibold">
                {activeSites.length} / {primaryLicense.siteLimit ?? '∞'}
              </p>
              {primaryLicense.siteLimit && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, (activeSites.length / primaryLicense.siteLimit) * 100)}%` }}
                  />
                </div>
              )}
              <p className="mt-2 text-sm text-muted">
                {primaryLicense.siteLimit ? `${Math.max(0, primaryLicense.siteLimit - activeSites.length)} more available on this plan` : 'Unlimited sites'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted">Plan</p>
              <p className="mt-2 text-3xl font-semibold capitalize">{primaryLicense.planName}</p>
              <p className="text-sm text-muted">{primaryLicense.siteLimit ?? 'Unlimited'} sites · annual</p>
              <a href="/billing" className="mt-1 inline-block text-sm text-accent-hover hover:underline">Manage plan →</a>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted">Your license key</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <code className="flex-1 break-all rounded-lg bg-black/30 px-4 py-3 font-mono text-lg">
                {revealed?.key || '••••-••••-••••-••••-••••'}
              </code>
              <button
                onClick={handleCopy}
                disabled={!revealed?.key}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
              >
                {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">Paste this into Bricks SEO → License in your WordPress admin.</p>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <button
                onClick={() => downloadMutation.mutate()}
                disabled={downloadMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <Download size={16} /> Download plugin
              </button>
              {downloadMutation.isError && (
                <p className="text-sm text-danger">{downloadMutation.error.message}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between p-6 pb-4">
              <h2 className="text-lg font-semibold">Activated sites</h2>
              <button
                onClick={() => setAddSiteOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white/5"
              >
                <Plus size={14} /> Add a site
              </button>
            </div>
            {activeSites.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted">No sites activated yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-6 py-2 font-medium">Domain</th>
                    <th className="px-6 py-2 font-medium">Activated</th>
                    <th className="px-6 py-2 font-medium">Last seen</th>
                    <th className="px-6 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {activeSites.map(a => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-mono text-sm">{a.siteUrl.replace(/^https?:\/\//, '')}</td>
                      <td className="px-6 py-3 text-muted">{formatDate(a.firstActivatedAt)}</td>
                      <td className="px-6 py-3 text-muted">{timeAgo(a.lastSeenAt)}</td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => deactivateMutation.mutate(a.id)}
                          className="text-sm text-muted hover:text-danger"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {primaryLicense.siteLimit && (
              <p className="px-6 py-4 text-sm text-muted">
                {activeSites.length} of {primaryLicense.siteLimit} sites used. You can activate {Math.max(0, primaryLicense.siteLimit - activeSites.length)} more.
              </p>
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <BookOpen size={18} className="text-accent-hover" />
          <h3 className="mt-3 font-semibold">Read the docs</h3>
          <p className="mt-1 text-sm text-muted">Setup guides, hooks, troubleshooting.</p>
          <a href="https://bricksseo.com/docs/" className="mt-2 inline-block text-sm text-accent-hover hover:underline">Open docs →</a>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <MessageCircle size={18} className="text-accent-hover" />
          <h3 className="mt-3 font-semibold">Need help?</h3>
          <p className="mt-1 text-sm text-muted">We usually reply within a few hours.</p>
          <a href="/support" className="mt-2 inline-block text-sm text-accent-hover hover:underline">Contact support →</a>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Sparkles size={18} className="text-accent-hover" />
          <h3 className="mt-3 font-semibold">What's new</h3>
          <p className="mt-1 text-sm text-muted">Latest release notes and improvements.</p>
          <a href="https://bricksseo.com/changelog/" className="mt-2 inline-block text-sm text-accent-hover hover:underline">View changelog →</a>
        </div>
      </div>

      <AddSiteInfoDialog open={addSiteOpen} onClose={() => setAddSiteOpen(false)} />
    </div>
  );
}
