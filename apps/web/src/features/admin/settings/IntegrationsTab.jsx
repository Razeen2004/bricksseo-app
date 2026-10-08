import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';

function MaskedField({ label, value, help }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          readOnly
          type={revealed ? 'text' : 'password'}
          value={value || ''}
          className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-muted"
        />
        <button
          onClick={() => setRevealed(v => !v)}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-white/5"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {help && <p className="mt-1 text-sm text-muted">{help}</p>}
    </div>
  );
}

export default function IntegrationsTab({ data, onSaved }) {
  const [smtp, setSmtp] = useState(data.integrations.smtp);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (values) => apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ section: 'smtp', values }) }),
    onSuccess: () => onSaved(),
  });

  const testEmailMutation = useMutation({
    mutationFn: () => apiFetch('/admin/settings/send-test-email', { method: 'POST' }),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Paddle</h2>
        <p className="mt-1 text-sm text-muted">
          Bricks SEO uses Paddle to process payments and issue license keys. Managed via the <code className="font-mono">PADDLE_*</code> environment variables — displayed here read-only.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MaskedField label="API key (live)" value={data.integrations.paddle.apiKeyLive} help="Used for billing and subscription management." />
          <MaskedField label="Webhook secret" value={data.integrations.paddle.webhookSecret} help="Verifies incoming Paddle webhook events." />
          <MaskedField label="API key (sandbox)" value={data.integrations.paddle.apiKeySandbox} help="For testing only — not used in production." />
          <div>
            <label className="mb-1.5 block text-sm font-medium">Webhook URL (read-only)</label>
            <input readOnly value={data.integrations.paddle.webhookUrl} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-sm text-muted" />
            <p className="mt-1 text-sm text-muted">Add this endpoint in your Paddle dashboard.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Email (SMTP)</h2>
        <p className="mt-1 text-sm text-muted">Transactional emails (license keys, receipts) are sent via SMTP. Resend, Postmark, and SendGrid all work.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">SMTP host</label>
            <input value={smtp.host} onChange={e => setSmtp({ ...smtp, host: e.target.value })} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Port</label>
            <input value={smtp.port} onChange={e => setSmtp({ ...smtp, port: e.target.value })} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Username</label>
            <input value={smtp.username} onChange={e => setSmtp({ ...smtp, username: e.target.value })} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Password</label>
            <div className="flex gap-2">
              <input
                type={showSmtpPassword ? 'text' : 'password'}
                value={smtp.password}
                onChange={e => setSmtp({ ...smtp, password: e.target.value })}
                className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button onClick={() => setShowSmtpPassword(v => !v)} className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-white/5">
                {showSmtpPassword ? 'Hide' : 'Reveal'}
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">SMTP auth password or API key.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">From name</label>
            <input value={smtp.fromName} onChange={e => setSmtp({ ...smtp, fromName: e.target.value })} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">From address</label>
            <input value={smtp.fromAddress} onChange={e => setSmtp({ ...smtp, fromAddress: e.target.value })} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
        </div>

        {saveMutation.isError && <p className="mt-3 text-sm text-danger">{saveMutation.error.message}</p>}
        {testEmailMutation.isSuccess && <p className="mt-3 text-sm text-success">Test email sent — check Mailpit / your inbox.</p>}
        {testEmailMutation.isError && <p className="mt-3 text-sm text-danger">{testEmailMutation.error.message}</p>}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => testEmailMutation.mutate()}
            disabled={testEmailMutation.isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
          >
            Send test email
          </button>
          <button
            onClick={() => saveMutation.mutate(smtp)}
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
