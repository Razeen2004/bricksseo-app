import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, CreditCard, ExternalLink } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Skeleton from '../../components/ui/Skeleton';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';

function formatMoney(minor, currency) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format((minor || 0) / 100);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_STYLE = {
  completed: 'bg-success/10 text-success',
  paid: 'bg-success/10 text-success',
  refunded: 'bg-white/5 text-muted',
  failed: 'bg-danger/10 text-danger',
};

export default function BillingPage() {
  const [portalError, setPortalError] = useState(null);
  const [invoiceError, setInvoiceError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  async function downloadInvoice(id) {
    setInvoiceError(null);
    setDownloadingId(id);
    try {
      const data = await apiFetch(`/account/invoices/${id}/pdf`);
      window.open(data.url, '_blank');
    } catch (err) {
      setInvoiceError(err.message);
    } finally {
      setDownloadingId(null);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['billing'],
    queryFn: () => apiFetch('/account/billing'),
  });

  const portalMutation = useMutation({
    mutationFn: () => apiFetch('/account/billing/portal', { method: 'POST' }),
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
    },
    onError: (err) => setPortalError(err.message),
  });

  function openPortal() {
    setPortalError(null);
    portalMutation.mutate();
  }

  const subscription = data?.subscription;
  const invoices = data?.invoices ?? [];
  const linkedLicense = data?.licenses?.find(license => license.planCode === subscription?.planCode);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader eyebrow="Account" title="Billing & subscription." description="Manage your plan, invoices, and payment method." icon={CreditCard} />

      {portalError && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{portalError}</div>
      )}

      {isLoading ? (
        <div role="status" aria-label="Loading billing information" className="space-y-4"><span className="sr-only">Loading…</span><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : !subscription ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-dim text-accent-hover"><CreditCard size={20} /></div>
          <h2 className="mt-4 text-lg font-semibold">No active subscription</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">There isn’t a recurring plan linked to this account. Your invoices will still appear here after a purchase.</p>
          <a href="https://bricksseo.com/pricing/" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
            Explore plans <ExternalLink size={15} />
          </a>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold capitalize">{subscription.planName}</h2>
              <p className="mt-1 text-sm text-muted">
                {formatMoney(subscription.unitPriceMinor, subscription.currency)} / year
              </p>
            </div>
            <Badge status={subscription.status} />
          </div>

          <div className="mt-5 flex flex-col gap-1 rounded-xl border border-border bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">
              {subscription.scheduledChangeAction === 'cancel'
                ? 'Cancellation scheduled'
                : subscription.status === 'canceled'
                  ? 'Subscription canceled'
                  : 'Next renewal'}
            </p>
            <p className="text-sm text-muted">
              {subscription.scheduledChangeAction === 'cancel'
                ? `Access ends ${formatDate(subscription.scheduledChangeEffectiveAt)}`
                : subscription.status === 'canceled'
                  ? (linkedLicense?.expiresAt ? `Access through ${formatDate(linkedLicense.expiresAt)}` : 'No upcoming renewal')
                  : formatDate(subscription.currentPeriodEnd)}
            </p>
          </div>

          {subscription.status !== 'canceled' && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={openPortal}
                disabled={portalMutation.isPending}
                className="min-h-10 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Change plan
              </button>
              {subscription.scheduledChangeAction !== 'cancel' && (
                <button
                  onClick={openPortal}
                  disabled={portalMutation.isPending}
                  className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {subscription && <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-semibold">Payment method</h3>
            <p className="mt-1 text-sm text-muted">Securely managed by Paddle, our payment partner. We never see your card details.</p>
          </div>
          <button
            onClick={openPortal}
            disabled={portalMutation.isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
          >
            Update payment method
          </button>
        </div>
      </div>}

      <div className="rounded-2xl border border-border bg-card shadow-[0_12px_35px_rgba(0,0,0,0.14)]">
        <h3 className="p-4 pb-4 font-semibold sm:p-6 sm:pb-4">Invoice history</h3>
        {invoiceError && (
          <div className="mx-4 mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger sm:mx-6">{invoiceError}</div>
        )}
        {invoices.length === 0 ? (
          <EmptyState compact title="No invoices yet" description="Completed purchases and renewals will be listed here." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-2 font-medium">Date</th>
                <th className="px-6 py-2 font-medium">Amount</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-mono text-sm">{formatDate(inv.date)}</td>
                  <td className="px-6 py-3 font-mono text-sm">{formatMoney(inv.amountMinor, inv.currency)}</td>
                  <td className="px-6 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[inv.status] || 'bg-white/5 text-muted'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => downloadInvoice(inv.id)}
                      disabled={downloadingId === inv.id}
                      className="inline-flex items-center gap-1.5 text-sm text-accent-hover hover:underline disabled:opacity-50"
                    >
                      <Download size={14} /> {downloadingId === inv.id ? 'Downloading…' : 'Download PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {subscription && <div className="text-center">
        <button
          onClick={openPortal}
          disabled={portalMutation.isPending}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Open billing portal →
        </button>
        <p className="mt-3 text-sm text-muted">
          For refunds, address changes, or VAT questions, use the billing portal or <a href="/support" className="text-accent-hover hover:underline">contact support</a>.
        </p>
      </div>}
    </div>
  );
}
