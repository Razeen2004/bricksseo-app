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

const PROVIDER_LABELS = {
  env: 'Environment default',
  resend: 'Resend',
  smtp: 'Custom SMTP'
};

export default function IntegrationsTab({ data, onSaved }) {
  const [smtp, setSmtp] = useState(data.integrations.smtp);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [provider, setProvider] = useState(data.integrations.email.provider);
  const [resend, setResend] = useState({
    apiKey: '',
    fromName: data.integrations.resend.fromName,
    fromAddress: data.integrations.resend.fromAddress,
  });
  const [showResendKey, setShowResendKey] = useState(false);

  const activeProvider = provider === 'env' ? (data.integrations.email.envDefault || 'resend') : provider;

  const saveMutation = useMutation({
    mutationFn: (values) => apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ section: 'smtp', values }) }),
    onSuccess: () => onSaved(),
  });

  const resendSaveMutation = useMutation({
    mutationFn: (values) => apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ section: 'resend', values }) }),
    onSuccess: () => { setResend(r => ({ ...r, apiKey: '' })); onSaved(); },
  });

  const providerMutation = useMutation({
    mutationFn: (values) => apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ section: 'email', values: { provider: values } }) }),
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
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
        <h2 className="font-semibold">Email provider</h2>
        <p className="mt-1 text-sm text-muted">
          Which service actually sends transactional email (license keys, receipts, password resets). Takes effect immediately — no redeploy needed.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={provider}
            onChange={e => { setProvider(e.target.value); providerMutation.mutate(e.target.value); }}
            className="rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="env">{`Environment default${data.integrations.email.envDefault ? ` (currently: ${data.integrations.email.envDefault})` : ''}`}</option>
            <option value="resend">Resend</option>
            <option value="smtp">Custom SMTP</option>
          </select>
          <span className="text-sm text-muted">Active right now: <strong className="text-ink">{PROVIDER_LABELS[activeProvider] || activeProvider}</strong></span>
          {providerMutation.isPending && <span className="text-sm text-muted">Saving…</span>}
        </div>
        {activeProvider === 'resend' && !data.integrations.resend.configured && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            Resend is selected but no API key is saved below yet — sending will fail until you add one.
          </p>
        )}
        {providerMutation.isError && <p className="mt-3 text-sm text-danger">{providerMutation.error.message}</p>}

        {testEmailMutation.isSuccess && <p className="mt-3 text-sm text-success">Test email sent — check your inbox.</p>}
        {testEmailMutation.isError && <p className="mt-3 text-sm text-danger">{testEmailMutation.error.message}</p>}
        <div className="mt-4">
          <button
            onClick={() => testEmailMutation.mutate()}
            disabled={testEmailMutation.isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
          >
            {testEmailMutation.isPending ? 'Sending…' : 'Send test email'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Resend</h2>
        <p className="mt-1 text-sm text-muted">
          Only used when "Resend" is selected above. Set up your API key here instead of in the server environment — changes take effect immediately.
        </p>
        {activeProvider !== 'resend' && (
          <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-muted">
            Resend isn't the active provider right now, so these fields have no effect until you select "Resend" above.
          </p>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">API key</label>
            <div className="flex gap-2">
              <input
                type={showResendKey ? 'text' : 'password'}
                value={resend.apiKey}
                onChange={e => setResend({ ...resend, apiKey: e.target.value })}
                placeholder={data.integrations.resend.apiKeyHint ? `Saved: ${data.integrations.resend.apiKeyHint}` : 're_...'}
                className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-sm placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button onClick={() => setShowResendKey(v => !v)} className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-white/5">
                {showResendKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">
              {data.integrations.resend.apiKeyHint
                ? `A key is already saved (${data.integrations.resend.apiKeyHint}). Leave this blank to keep it — only fill it in to replace it.`
                : 'Find this in your Resend dashboard under API Keys.'}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">From name</label>
            <input value={resend.fromName} onChange={e => setResend({ ...resend, fromName: e.target.value })} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">From address</label>
            <input value={resend.fromAddress} onChange={e => setResend({ ...resend, fromAddress: e.target.value })} placeholder="hello@yourdomain.com" className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
            <p className="mt-1 text-sm text-muted">Must be on a domain verified in your Resend account.</p>
          </div>
        </div>

        {resendSaveMutation.isError && <p className="mt-3 text-sm text-danger">{resendSaveMutation.error.message}</p>}
        {resendSaveMutation.isSuccess && <p className="mt-3 text-sm text-success">Saved.</p>}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => resendSaveMutation.mutate(resend)}
            disabled={resendSaveMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {resendSaveMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Custom SMTP</h2>
        <p className="mt-1 text-sm text-muted">
          Only used when "Custom SMTP" is selected above. Works with your own mail server or any provider's SMTP endpoint (Mailgun, SendGrid, Postmark, Resend's own SMTP, etc.).
        </p>
        {activeProvider !== 'smtp' && (
          <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-muted">
            SMTP isn't the active provider right now, so these fields have no effect until you select "Custom SMTP" above.
          </p>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
        {saveMutation.isSuccess && <p className="mt-3 text-sm text-success">Saved.</p>}

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => saveMutation.mutate(smtp)}
            disabled={saveMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
