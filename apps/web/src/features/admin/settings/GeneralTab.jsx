import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import Toggle from '../../../components/ui/Toggle';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';

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
  const [deleteOpen, setDeleteOpen] = useState(false);

  const storeMutation = useSaveSection(onSaved);
  const adminMutation = useSaveSection(onSaved);
  const maintenanceMutation = useSaveSection(onSaved);
  const deleteMutation = useMutation({
    mutationFn: () => apiFetch('/admin/settings/delete-store', { method: 'POST' }),
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Toggle
            label="Two-factor authentication"
            description="Require TOTP on every admin login. (Not yet enforced — enrollment UI is coming.)"
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

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-danger">Delete store</p>
            <p className="text-sm text-muted">Permanently removes all data. This cannot be undone.</p>
          </div>
          <button
            onClick={() => setDeleteOpen(true)}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/80"
          >
            Delete…
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete store"
        description="This permanently removes all data and cannot be undone."
        requireText={store.name}
        danger
        confirmLabel="Delete store"
        pending={deleteMutation.isPending}
        error={deleteMutation.isError ? deleteMutation.error.message : null}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
