import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import Toggle from '../../../components/ui/Toggle';

const CUSTOMER_EMAILS = [
  { key: 'purchaseConfirmation', label: 'Purchase confirmation', description: 'Sent immediately after a successful payment. Includes license key.' },
  { key: 'licenseExpiryReminder', label: 'License expiry reminder', description: 'Warn customers 7 days before their license expires.' },
  { key: 'paymentFailed', label: 'Payment failed', description: 'Notify customer when a subscription charge fails.' },
  { key: 'refundProcessed', label: 'Refund processed', description: 'Confirm when a refund has been issued to the customer.' },
];

const ADMIN_ALERTS = [
  { key: 'newPurchase', label: 'New purchase', description: 'Email you when any customer completes a purchase.' },
  { key: 'newCustomerSignup', label: 'New customer sign-up', description: 'Email you when a new account is created.' },
  { key: 'paymentFailure', label: 'Payment failure', description: 'Alert you when a customer payment fails.' },
  { key: 'refundIssued', label: 'Refund issued', description: 'Alert you when a refund is processed.' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function NotificationsTab({ data, onSaved }) {
  const [notifications, setNotifications] = useState(data.notifications);

  const saveMutation = useMutation({
    mutationFn: (values) => apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ section: 'notifications', values }) }),
    onSuccess: () => onSaved(),
  });

  function setCustomerEmail(key, value) {
    setNotifications({ ...notifications, customerEmails: { ...notifications.customerEmails, [key]: value } });
  }

  function setAdminAlert(key, value) {
    setNotifications({ ...notifications, adminAlerts: { ...notifications.adminAlerts, [key]: value } });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Customer emails</h2>
        <div className="mt-4 space-y-4">
          {CUSTOMER_EMAILS.map(item => (
            <Toggle
              key={item.key}
              label={item.label}
              description={item.description}
              checked={notifications.customerEmails[item.key]}
              onChange={v => setCustomerEmail(item.key, v)}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Admin alerts</h2>
        <div className="mt-4 space-y-4">
          {ADMIN_ALERTS.map(item => (
            <Toggle
              key={item.key}
              label={item.label}
              description={item.description}
              checked={notifications.adminAlerts[item.key]}
              onChange={v => setAdminAlert(item.key, v)}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Weekly digest</h2>
        <p className="mt-1 text-sm text-muted">Get a weekly summary of revenue, new customers, and key events.</p>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium">Send on</label>
          <select
            value={notifications.weeklyDigest.sendOn}
            onChange={e => setNotifications({ ...notifications, weeklyDigest: { ...notifications.weeklyDigest, sendOn: e.target.value } })}
            className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <Toggle
            label="Enable weekly digest"
            description={`Delivered every ${notifications.weeklyDigest.sendOn} at 9:00 AM in your configured timezone.`}
            checked={notifications.weeklyDigest.enabled}
            onChange={v => setNotifications({ ...notifications, weeklyDigest: { ...notifications.weeklyDigest, enabled: v } })}
          />
        </div>

        {saveMutation.isError && <p className="mt-3 text-sm text-danger">{saveMutation.error.message}</p>}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => saveMutation.mutate(notifications)}
            disabled={saveMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
