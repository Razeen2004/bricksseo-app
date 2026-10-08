import { useState } from 'react';

export default function ConfirmDialog({
  open,
  title,
  description,
  requirePassword = false,
  requireText = null,
  confirmLabel = 'Confirm',
  danger = false,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  const [password, setPassword] = useState('');
  const [typedText, setTypedText] = useState('');

  if (!open) return null;

  const canConfirm =
    (!requirePassword || password.length > 0) &&
    (!requireText || typedText === requireText);

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm({ password });
  }

  function handleCancel() {
    setPassword('');
    setTypedText('');
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}

        {error && (
          <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}

        {requirePassword && (
          <div className="mt-4">
            <label className="mb-1.5 block text-sm text-muted">Confirm your password</label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        )}

        {requireText && (
          <div className="mt-4">
            <label className="mb-1.5 block text-sm text-muted">Type <span className="font-mono text-ink">{requireText}</span> to confirm</label>
            <input
              type="text"
              autoFocus
              value={typedText}
              onChange={e => setTypedText(e.target.value)}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || pending}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              danger ? 'bg-danger hover:bg-danger/80' : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
