import { useState } from 'react';
import { Archive, Download, FileUp, ShieldCheck, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export default function AdminDataPage() {
  const [backup, setBackup] = useState(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmImport, setConfirmImport] = useState(false);

  async function sendImport(dryRun) {
    if (!backup) return null;
    const response = await fetch(`/v1/admin/data/import?dryRun=${dryRun}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(backup)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = payload.errors?.join('\n') || payload.error?.message || payload.message || 'Could not import this backup.';
      throw new Error(messages);
    }
    return payload;
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    setBackup(null);
    setPreview(null);
    setFileName('');
    setError('');
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError('Backup is larger than the 20 MB limit.');
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      setBackup(parsed);
      setFileName(file.name);
    } catch {
      setError('This file is not valid JSON. Choose a Bricks SEO backup file.');
    }
  }

  async function handlePreview() {
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const result = await sendImport(true);
      setPreview(result.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setBusy(true);
    setError('');
    try {
      await sendImport(false);
      setPreview(null);
      setConfirmImport(false);
      toast.success('Backup imported successfully.');
      setBackup(null);
      setFileName('');
    } catch (err) {
      setError(err.message);
      setConfirmImport(false);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto space-y-8">
      <header>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-1 font-serif text-4xl italic">Import / Export.</h1>
        <p className="mt-1 text-muted">Move customer accounts, license keys, and activated sites between Bricks SEO servers.</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Archive size={18} /> Export a portable backup</h2>
        <p className="mt-2 text-sm text-muted">
          Includes customer profile state, license keys and status, plans, limits, expiry dates, notes, license events, and full activation records. It does not include passwords, payment history, or Paddle subscriptions.
        </p>
        <div className="mt-4 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
          The backup contains working license keys. Store the downloaded file securely and delete it when the transfer is complete.
        </div>
        <a
          href="/v1/admin/data/export.json"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          <Download size={16} /> Download backup JSON
        </a>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><FileUp size={18} /> Import a backup</h2>
        <p className="mt-2 text-sm text-muted">
          Import restores the exported profile, license, event, and activation state for matching customers and keys. Missing records are recreated. Data created after the backup but absent from it is left untouched. Keys are re-hashed and encrypted with this server’s secrets, so plugin license checks continue to work even when source and destination use different keys.
        </p>
        <p className="mt-2 text-sm text-muted">
          Restored sites stay attached to their licenses. New customer accounts receive a random inaccessible password and must use “Forgot password” to set one.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Backup JSON file
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="mt-2 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-accent-hover"
            />
          </label>
          {fileName && <p className="text-sm text-muted">Selected: <span className="font-mono text-ink">{fileName}</span></p>}
          {error && <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</pre>}

          <button
            type="button"
            disabled={!backup || busy}
            onClick={handlePreview}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
          >
            <ShieldCheck size={16} /> {busy ? 'Checking…' : 'Validate and preview'}
          </button>
        </div>

        {preview && (
          <div className="mt-6 rounded-lg border border-border p-4">
            <h3 className="font-semibold">Preview</h3>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Customers to create</dt><dd>{preview.customersToCreate}</dd></div>
              <div><dt className="text-muted">Customers to restore</dt><dd>{preview.customersToRestore}</dd></div>
              <div><dt className="text-muted">Licenses to create</dt><dd>{preview.licensesToCreate}</dd></div>
              <div><dt className="text-muted">Licenses to restore</dt><dd>{preview.licensesToRestore}</dd></div>
              <div><dt className="text-muted">Activation records to restore</dt><dd>{preview.activationsToRestore}</dd></div>
            </dl>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmImport(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <Upload size={16} /> Import backup
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmImport}
        title="Import this backup?"
        description="This adds customers, licenses, and activations that do not already exist. Type IMPORT to confirm."
        requireText="IMPORT"
        confirmLabel="Import backup"
        pending={busy}
        error={null}
        onConfirm={handleImport}
        onCancel={() => setConfirmImport(false)}
      />
    </div>
  );
}
