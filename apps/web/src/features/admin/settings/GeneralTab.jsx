import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import Toggle from '../../../components/ui/Toggle';

function useSaveSection(onSaved) {
  return useMutation({
    mutationFn: ({ section, values }) => apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ section, values }) }),
    onSuccess: () => onSaved(),
  });
}

export default function GeneralTab({ data, onSaved }) {
  const [store, setStore] = useState(data.store);
  const [admin, setAdmin] = useState({ ...data.admin, password: '' });
  const [maintenance, setMaintenance] = useState(data.maintenance);
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [disableTwoFactor, setDisableTwoFactor] = useState({ password: '', code: '' });

  const storeMutation = useSaveSection(onSaved);
  const adminMutation = useSaveSection(onSaved);
  const maintenanceMutation = useSaveSection(onSaved);
  const beginTwoFactorMutation = useMutation({
    mutationFn: () => apiFetch('/admin/settings/2fa/setup', { method: 'POST', body: JSON.stringify({ password: twoFactorPassword }) }),
    onSuccess: setTwoFactorSetup,
  });
  const confirmTwoFactorMutation = useMutation({
    mutationFn: () => apiFetch('/admin/settings/2fa/confirm', { method: 'POST', body: JSON.stringify({ secret: twoFactorSetup.secret, code: twoFactorCode }) }),
    onSuccess: (result) => { setRecoveryCodes(result.recoveryCodes); setTwoFactorSetup(null); setTwoFactorPassword(''); setTwoFactorCode(''); onSaved(); },
  });
  const disableTwoFactorMutation = useMutation({
    mutationFn: () => apiFetch('/admin/settings/2fa/disable', { method: 'POST', body: JSON.stringify(disableTwoFactor) }),
    onSuccess: () => { setDisableTwoFactor({ password: '', code: '' }); onSaved(); },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Store</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Store name</label>
            <input
              value={store.name}
              onChange={e => setStore({ ...store, name: e.target.value })}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-sm text-muted">Shown in license emails and customer portal.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Support email</label>
              <input
                value={store.supportEmail}
                onChange={e => setStore({ ...store, supportEmail: e.target.value })}
                className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-sm text-muted">Customers reply to this address.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Timezone</label>
              <input
                value={store.timezone}
                onChange={e => setStore({ ...store, timezone: e.target.value })}
                className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-sm text-muted">Used for date displays and reports.</p>
            </div>
          </div>
        </div>
        {storeMutation.isError && <p className="mt-3 text-sm text-danger">{storeMutation.error.message}</p>}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => storeMutation.mutate({ section: 'store', values: store })}
            disabled={storeMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Admin account</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">First name</label>
            <input
              value={admin.firstName}
              onChange={e => setAdmin({ ...admin, firstName: e.target.value })}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Last name</label>
            <input
              value={admin.lastName}
              onChange={e => setAdmin({ ...admin, lastName: e.target.value })}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Admin email</label>
            <input value={admin.email} disabled className="w-full rounded-lg border border-border bg-black/10 px-3 py-2 text-sm text-muted" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">New password</label>
            <input
              type="password"
              placeholder="Leave blank to keep current"
              value={admin.password}
              onChange={e => setAdmin({ ...admin, password: e.target.value })}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-sm text-muted">Min 8 characters.</p>
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-4 rounded-lg border border-border bg-black/20 p-4">
            <p className="text-sm font-medium">Administrator authenticator</p>
            <p className="mt-1 text-sm text-muted">
              {data.admin.twoFactorEnabled ? 'Authenticator is enrolled for your account.' : 'Enroll this administrator with an authenticator app before requiring two-factor sign-in.'}
            </p>
            {!data.admin.twoFactorEnabled && !twoFactorSetup && <div className="mt-3 flex flex-wrap gap-2">
              <input type="password" value={twoFactorPassword} onChange={e => setTwoFactorPassword(e.target.value)} placeholder="Current password" className="min-w-48 flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 text-sm" />
              <button type="button" onClick={() => beginTwoFactorMutation.mutate()} disabled={!twoFactorPassword || beginTwoFactorMutation.isPending} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50">{beginTwoFactorMutation.isPending ? 'Preparing…' : 'Set up authenticator'}</button>
            </div>}
            {beginTwoFactorMutation.isError && <p className="mt-2 text-sm text-danger">{beginTwoFactorMutation.error.message}</p>}
            {twoFactorSetup && <div className="mt-3 space-y-3">
              <p className="text-sm text-muted">Add this secret in your authenticator app, then enter the 6-digit code to confirm.</p>
              <code className="block break-all rounded bg-black/30 p-3 font-mono text-sm">{twoFactorSetup.secret}</code>
              <a className="text-sm text-accent-hover underline" href={twoFactorSetup.otpauthUri}>Open authenticator app</a>
              <div className="flex gap-2">
                <input inputMode="numeric" maxLength={6} value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className="min-w-0 flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 text-sm" />
                <button type="button" onClick={() => confirmTwoFactorMutation.mutate()} disabled={twoFactorCode.length !== 6 || confirmTwoFactorMutation.isPending} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{confirmTwoFactorMutation.isPending ? 'Verifying…' : 'Confirm'}</button>
              </div>
              {confirmTwoFactorMutation.isError && <p className="text-sm text-danger">{confirmTwoFactorMutation.error.message}</p>}
            </div>}
            {recoveryCodes.length > 0 && <div className="mt-3 rounded-lg bg-warning/10 p-3">
              <p className="text-sm font-semibold">Save these recovery codes now. Each works once.</p>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{recoveryCodes.join('\n')}</pre>
              <button type="button" onClick={() => setRecoveryCodes([])} className="mt-2 text-sm underline">I saved these codes</button>
            </div>}
            {data.admin.twoFactorEnabled && !data.admin.require2fa && <div className="mt-3 border-t border-border pt-3">
              <p className="text-sm text-muted">To replace a lost authenticator, turn off the global requirement above, then verify your password and current authenticator or a recovery code here.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input type="password" value={disableTwoFactor.password} onChange={e => setDisableTwoFactor({ ...disableTwoFactor, password: e.target.value })} placeholder="Current password" className="min-w-40 flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 text-sm" />
                <input value={disableTwoFactor.code} onChange={e => setDisableTwoFactor({ ...disableTwoFactor, code: e.target.value })} placeholder="Authenticator or recovery code" className="min-w-48 flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 text-sm" />
                <button type="button" onClick={() => disableTwoFactorMutation.mutate()} disabled={!disableTwoFactor.password || !disableTwoFactor.code || disableTwoFactorMutation.isPending} className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger disabled:opacity-50">Remove enrollment</button>
              </div>
              {disableTwoFactorMutation.isError && <p className="mt-2 text-sm text-danger">{disableTwoFactorMutation.error.message}</p>}
            </div>}
          </div>
          <Toggle
            label="Two-factor authentication"
            description="Require an authenticator or one-time recovery code at every administrator login. All active admins must enroll first."
            checked={admin.require2fa}
            onChange={v => setAdmin({ ...admin, require2fa: v })}
          />
        </div>

        {adminMutation.isError && <p className="mt-3 text-sm text-danger">{adminMutation.error.message}</p>}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => adminMutation.mutate({ section: 'admin', values: admin })}
            disabled={adminMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Danger zone</h2>
        <div className="mt-4">
          <Toggle
            label="Maintenance mode"
            description="Blocks the customer portal and shows a maintenance notice."
            checked={maintenance.enabled}
            onChange={v => {
              setMaintenance({ enabled: v });
              maintenanceMutation.mutate({ section: 'maintenance', values: { enabled: v } });
            }}
          />
        </div>
      </div>
    </div>
  );
}
