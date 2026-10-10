import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, RotateCcw, Send } from 'lucide-react';
import { apiFetch } from '../../lib/api';

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function TemplateList({ templates, isLoading, onOpen }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {isLoading ? (
        <p className="px-6 py-6 text-sm text-muted">Loading…</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
              <th className="px-6 py-2 font-medium">Template</th>
              <th className="px-6 py-2 font-medium">Subject</th>
              <th className="px-6 py-2 font-medium">Status</th>
              <th className="px-6 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.key} className="border-b border-border last:border-0">
                <td className="px-6 py-3">
                  <p className="font-medium">{t.label}</p>
                  <p className="text-sm text-muted">{t.description}</p>
                </td>
                <td className="max-w-xs truncate px-6 py-3 font-mono text-xs text-muted">{t.subject}</td>
                <td className="px-6 py-3">
                  {t.isCustom ? (
                    <span className="rounded-full bg-accent-dim px-2.5 py-1 text-xs font-medium text-accent-hover">
                      Customized{formatDate(t.updatedAt) ? ` · ${formatDate(t.updatedAt)}` : ''}
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-muted">Default</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => onOpen(t.key)} className="text-sm text-accent-hover hover:underline">
                    Edit →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TemplateEditor({ templateKey, onBack }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-email-template', templateKey],
    queryFn: () => apiFetch(`/admin/email-templates/${templateKey}`),
  });

  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewTab, setPreviewTab] = useState('html');

  useEffect(() => {
    if (!data) return;
    setSubject(data.subject);
    setHtml(data.html);
    setText(data.text);
    setPreview(data.preview);
  }, [data]);

  const previewMutation = useMutation({
    mutationFn: (draft) => apiFetch(`/admin/email-templates/${templateKey}/preview`, { method: 'POST', body: JSON.stringify(draft) }),
    onSuccess: (res) => setPreview(res.preview),
  });

  const saveMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/email-templates/${templateKey}`, { method: 'PUT', body: JSON.stringify({ subject, html, text }) }),
    onSuccess: (res) => {
      setPreview(res.preview);
      queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-email-template', templateKey] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/email-templates/${templateKey}/reset`, { method: 'POST' }),
    onSuccess: (res) => {
      setSubject(res.subject);
      setHtml(res.html);
      setText(res.text);
      queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/email-templates/${templateKey}/test`, { method: 'POST' }),
  });

  if (isLoading || !data) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Back to all templates
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{data.label}</h2>
          <p className="mt-1 text-sm text-muted">{data.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
          >
            <Send size={14} /> {testMutation.isPending ? 'Sending…' : 'Send test to me'}
          </button>
          {data.isCustom && (
            <button
              onClick={() => { if (confirm('Discard your edits and restore the built-in default?')) resetMutation.mutate(); }}
              disabled={resetMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-white/5 disabled:opacity-50"
            >
              <RotateCcw size={14} /> Reset to default
            </button>
          )}
        </div>
      </div>

      {testMutation.isSuccess && (
        <div className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">Test email sent — check your inbox.</div>
      )}
      {testMutation.isError && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{testMutation.error.message}</div>
      )}
      {saveMutation.isError && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{saveMutation.error.message}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Available placeholders</h3>
        <p className="mt-1 text-sm text-muted">Use these inside the subject, HTML, or plain-text body. Anything else is rejected when you save.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.vars.length === 0 && <p className="text-sm text-muted">This template has no placeholders.</p>}
          {data.vars.map((v) => (
            <span key={v.key} title={v.label} className="rounded-md bg-black/30 px-2 py-1 font-mono text-xs text-accent-hover">
              {`{{${v.key}}}`}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <label className="mb-1.5 block text-sm font-medium">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <label className="mb-1.5 block text-sm font-medium">HTML body</label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={14}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <label className="mb-1.5 block text-sm font-medium">Plain-text body</label>
            <p className="mb-2 text-sm text-muted">Sent alongside the HTML version for clients that don't render HTML.</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => previewMutation.mutate({ subject, html, text })}
              disabled={previewMutation.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50"
            >
              {previewMutation.isPending ? 'Rendering…' : 'Refresh preview'}
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <p className="text-sm font-medium">Preview with sample data</p>
              <div className="flex items-center gap-1 rounded-full border border-border p-1">
                <button
                  onClick={() => setPreviewTab('html')}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${previewTab === 'html' ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:text-ink'}`}
                >
                  HTML
                </button>
                <button
                  onClick={() => setPreviewTab('text')}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${previewTab === 'text' ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:text-ink'}`}
                >
                  Plain text
                </button>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-muted">Subject</p>
              <p className="mb-3 text-sm">{preview?.subject}</p>
              {previewTab === 'html' ? (
                <iframe
                  title="Email preview"
                  srcDoc={preview?.html || ''}
                  sandbox=""
                  className="h-96 w-full rounded-lg border border-border bg-white"
                />
              ) : (
                <pre className="h-96 w-full overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-black/30 p-3 text-xs text-muted">
                  {preview?.text}
                </pre>
              )}
            </div>
          </div>
          <p className="text-sm text-muted">The preview always uses sample data — it never sends anything or touches real customers.</p>
        </div>
      </div>
    </div>
  );
}

export default function EmailTemplatesPage() {
  const [openKey, setOpenKey] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-email-templates'],
    queryFn: () => apiFetch('/admin/email-templates'),
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Admin</p>
        <h1 className="mt-1 flex items-center gap-2 font-serif text-4xl italic">
          <Mail size={28} className="text-accent-hover" /> Email templates.
        </h1>
        <p className="mt-1 text-muted">Edit the exact subject, HTML, and plain-text copy for every email the platform sends.</p>
      </header>

      {openKey ? (
        <TemplateEditor templateKey={openKey} onBack={() => setOpenKey(null)} />
      ) : (
        <TemplateList templates={data?.templates ?? []} isLoading={isLoading} onOpen={setOpenKey} />
      )}
    </div>
  );
}
