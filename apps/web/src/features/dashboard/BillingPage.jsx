import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { apiFetch } from '../../lib/api';

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

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Account</p>
        <h1 className="mt-1 font-serif text-4xl italic">Billing &amp; subscription.</h1>
        <p className="mt-1 text-muted">Manage your plan, invoices, and payment method.</p>
      </header>

      {portalError && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{portalError}</div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !subscription ? (
        // <div className="rounded-xl border border-border bg-card p-8 text-center text-muted">
        //   No active subscription found. If you bought a lifetime license, billing is handled through Paddle at checkout only.
        // </div>
        <>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold capitalize">{subscription.planName}</h2>
              <p className="text-sm text-muted">
                {formatMoney(subscription.unitPriceMinor, subscription.currency)} / year
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg">{formatMoney(subscription.unitPriceMinor, subscription.currency)} / year</p>
              <p className="text-sm text-muted">
                {subscription.scheduledChangeAction === 'cancel'
                  ? `Ends on ${formatDate(subscription.scheduledChangeEffectiveAt)}`
                  : `Renews ${formatDate(subscription.currentPeriodEnd)}`}
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={openPortal}
              disabled={portalMutation.isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Change plan
            </button>
            <button
              onClick={openPortal}
              disabled={portalMutation.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
            >
              Cancel subscription
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
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
      </div>

      <div className="rounded-xl border border-border bg-card">
        <h3 className="p-6 pb-4 font-semibold">Invoice history</h3>
        {invoiceError && (
          <div className="mx-6 mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{invoiceError}</div>
        )}
        {invoices.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted">No invoices yet.</p>
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

      <div className="text-center">
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
      </div>
    </div>
  );
}
