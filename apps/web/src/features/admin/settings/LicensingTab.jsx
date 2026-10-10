import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import Toggle from '../../../components/ui/Toggle';

export default function LicensingTab({ data, onSaved }) {
  const [behavior, setBehavior] = useState({
    gracePeriodDays: data.licensing.gracePeriodDays,
    maxSiteActivationsOverride: data.licensing.maxSiteActivationsOverride ?? '',
    domainValidation: data.licensing.domainValidation,
    allowLocalhost: data.licensing.allowLocalhost,
  });

  const [planIds, setPlanIds] = useState(
    data.licensing.plans.map(p => ({ code: p.code, paddlePriceId: p.paddlePriceId || '', paddleProductId: p.paddleProductId || '' }))
  );

  function updatePlanId(code, field, value) {
    setPlanIds(ids => ids.map(p => (p.code === code ? { ...p, [field]: value } : p)));
  }

  const saveMutation = useMutation({
    mutationFn: (values) => apiFetch('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        section: 'licensing',
        values: { ...values, maxSiteActivationsOverride: values.maxSiteActivationsOverride === '' ? null : Number(values.maxSiteActivationsOverride) }
      }),
    }),
    onSuccess: () => onSaved(),
  });

  const savePlanIdsMutation = useMutation({
    mutationFn: () => apiFetch('/admin/settings/plan-prices', { method: 'PUT', body: JSON.stringify({ plans: planIds }) }),
    onSuccess: () => onSaved(),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Plans</h2>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium capitalize text-muted">{data.licensing.paddleEnv} IDs</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Enter each plan's Paddle Price ID to make its <code className="font-mono text-xs">/pay</code> checkout link work. Product ID is optional reference info only — Paddle checkout uses the Price ID.
        </p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th className="py-2 font-medium">Plan</th>
              <th className="py-2 font-medium">Sites</th>
              <th className="py-2 font-medium">Price ID</th>
              <th className="py-2 font-medium">Product ID</th>
            </tr>
          </thead>
          <tbody>
            {data.licensing.plans.map(p => {
              const ids = planIds.find(x => x.code === p.code) || { paddlePriceId: '', paddleProductId: '' };
              return (
                <tr key={p.code} className="border-b border-border last:border-0">
                  <td className="py-3 pr-3 font-semibold">{p.name}</td>
                  <td className="py-3 pr-3 text-muted">{p.siteLimit ?? 'Unlimited'}</td>
                  <td className="py-2 pr-3">
                    <input
                      value={ids.paddlePriceId}
                      onChange={e => updatePlanId(p.code, 'paddlePriceId', e.target.value)}
                      placeholder="pri_..."
                      className="w-full rounded-lg border border-border bg-black/30 px-2.5 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      value={ids.paddleProductId}
                      onChange={e => updatePlanId(p.code, 'paddleProductId', e.target.value)}
                      placeholder="pro_... (optional)"
                      className="w-full rounded-lg border border-border bg-black/30 px-2.5 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {savePlanIdsMutation.isError && <p className="mt-3 text-sm text-danger">{savePlanIdsMutation.error.message}</p>}
        {savePlanIdsMutation.isSuccess && <p className="mt-3 text-sm text-success">Saved.</p>}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted">Plans themselves (name, site limit) are managed in code — these IDs just connect each one to Paddle.</p>
          <button
            onClick={() => savePlanIdsMutation.mutate()}
            disabled={savePlanIdsMutation.isPending}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {savePlanIdsMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Behavior</h2>
        <p className="mt-1 text-sm font-medium">License activation</p>
        <p className="text-sm text-muted">Control how customers can use their licenses.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Grace period (days)</label>
            <input
              type="number"
              value={behavior.gracePeriodDays}
              onChange={e => setBehavior({ ...behavior, gracePeriodDays: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-sm text-muted">Extra days after expiry before a license is revoked.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Max site activations override</label>
            <input
              placeholder="Leave blank to use plan default"
              value={behavior.maxSiteActivationsOverride}
              onChange={e => setBehavior({ ...behavior, maxSiteActivationsOverride: e.target.value })}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-sm text-muted">Hard cap applied to all plans.</p>
          </div>
        </div>

        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <Toggle
            label="Domain validation"
            description="Verify that activated domains are reachable before recording them."
            checked={behavior.domainValidation}
            onChange={v => setBehavior({ ...behavior, domainValidation: v })}
          />
          <Toggle
            label="Allow localhost domains"
            description="Permit localhost and 127.0.0.1 for development use."
            checked={behavior.allowLocalhost}
            onChange={v => setBehavior({ ...behavior, allowLocalhost: v })}
          />
        </div>

        {saveMutation.isError && <p className="mt-3 text-sm text-danger">{saveMutation.error.message}</p>}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => saveMutation.mutate(behavior)}
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
