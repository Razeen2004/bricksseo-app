import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Mail, Plus, Send, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import PageHeader from '../../components/ui/PageHeader';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function plainTextPreview(text) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fff;color:#202027;font:14px/1.6 Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</body></html>`;
}

function StatusBadge({ status }) {
  const style = status === 'sent' ? 'bg-success/10 text-success' : status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-white/5 text-muted';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${style}`}>{status}</span>;
}

export default function EmailCenterPage() {
  const [view, setView] = useState('compose');
  const [customerSearch, setCustomerSearch] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [recipientError, setRecipientError] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [openMessageId, setOpenMessageId] = useState(null);
  const queryClient = useQueryClient();

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['email-center-recipients', customerSearch],
    queryFn: () => apiFetch(`/admin/email-center/recipients?search=${encodeURIComponent(customerSearch)}`),
    enabled: view === 'compose',
  });

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['email-center-messages'],
    queryFn: () => apiFetch('/admin/email-center/messages'),
    enabled: view === 'sent',
  });

  const { data: selectedMessage, isLoading: messageLoading } = useQuery({
    queryKey: ['email-center-message', openMessageId],
    queryFn: () => apiFetch(`/admin/email-center/messages/${openMessageId}`),
    enabled: !!openMessageId,
  });

  const sendMutation = useMutation({
    mutationFn: (payload) => apiFetch('/admin/email-center/send', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (result) => {
      setSendResult(result);
      setConfirmSend(false);
      queryClient.invalidateQueries({ queryKey: ['email-center-messages'] });
      if (result.failed === 0) setView('sent');
    },
  });

  function toggleCustomer(customer) {
    setRecipientError('');
    setRecipients(current => current.some(item => item.email === customer.email)
      ? current.filter(item => item.email !== customer.email)
      : [...current, { email: customer.email, name: customer.name, userId: customer.id }]);
  }

  function addManualRecipients() {
    const addresses = manualEmail.split(/[\s,;]+/).map(email => email.trim().toLowerCase()).filter(Boolean);
    if (!addresses.length) return;
    const valid = addresses.filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    const invalid = addresses.length - valid.length;
    setRecipients(current => {
      const existing = new Set(current.map(item => item.email));
      return [...current, ...valid.filter(email => !existing.has(email)).map(email => ({ email, name: '', userId: null }))];
    });
    setRecipientError(invalid ? 'Some addresses are invalid. Please check them and add again.' : '');
    setManualEmail(invalid ? addresses.filter(email => !valid.includes(email)).join(', ') : '');
  }

  function requestSend(event) {
    event.preventDefault();
    setSendResult(null);
    sendMutation.reset();
    if (!recipients.length) {
      setRecipientError('Choose at least one customer or add an email address.');
      return;
    }
    if (recipients.length > 50) {
      setRecipientError('You can send to up to 50 recipients at a time.');
      return;
    }
    if (!html.trim() && !text.trim()) {
      setRecipientError('Add an HTML or plain-text email body.');
      return;
    }
    setConfirmSend(true);
  }

  function sendNow() {
    sendMutation.mutate({
      recipients: recipients.map(item => item.email),
      subject,
      html,
      text,
      replyTo,
    });
  }

  const customers = customersData?.customers ?? [];
  const messages = messagesData?.messages ?? [];
  const previewHtml = html.trim() || (text.trim() ? plainTextPreview(text) : plainTextPreview('Your email preview will appear here.'));
  const bodyForViewer = selectedMessage?.message?.html || (selectedMessage?.message?.text ? plainTextPreview(selectedMessage.message.text) : null);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader eyebrow="Admin" title="Email center." description="Compose and send messages to customers, then review delivery history." icon={Mail} />

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button onClick={() => setView('compose')} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === 'compose' ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:bg-white/5 hover:text-ink'}`}>
          <span className="inline-flex items-center gap-2"><Send size={15} /> Compose</span>
        </button>
        <button onClick={() => setView('sent')} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === 'sent' ? 'bg-accent-dim text-accent-hover' : 'text-muted hover:bg-white/5 hover:text-ink'}`}>
          <span className="inline-flex items-center gap-2"><Mail size={15} /> Sent mail</span>
        </button>
      </div>

      {sendResult && (
        <div className={`rounded-lg px-4 py-3 text-sm ${sendResult.failed ? 'border border-danger/30 bg-danger/10 text-danger' : 'border border-success/30 bg-success/10 text-success'}`}>
          {sendResult.sent} email{sendResult.sent === 1 ? '' : 's'} sent{sendResult.failed ? `; ${sendResult.failed} failed. Open Sent mail to see details.` : ' successfully.'}
        </div>
      )}

      {view === 'compose' ? (
        <form onSubmit={requestSend} className="grid min-w-0 grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
          <div className="min-w-0 space-y-5">
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div>
                <h2 className="font-semibold">Recipients</h2>
                <p className="mt-1 text-sm text-muted">Choose existing customers or enter email addresses. Each person receives a separate email.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {recipients.map(item => (
                  <span key={item.email} className="inline-flex max-w-full items-center gap-2 rounded-full border border-accent/20 bg-accent-dim px-3 py-1.5 text-xs text-ink">
                    <span className="truncate">{item.name ? `${item.name} · ` : ''}{item.email}</span>
                    <button type="button" aria-label={`Remove ${item.email}`} onClick={() => setRecipients(current => current.filter(recipient => recipient.email !== item.email))} className="shrink-0 text-muted hover:text-danger"><Trash2 size={13} /></button>
                  </span>
                ))}
                {recipients.length === 0 && <span className="text-sm text-muted">No recipients selected</span>}
              </div>
              <p className="text-xs text-muted">{recipients.length}/50 recipients selected</p>

              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="customer-search">Select a customer</label>
                <input id="customer-search" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} placeholder="Search by name or email" className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
                  {customersLoading ? (
                    <div className="space-y-3 p-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-3/4" /></div>
                  ) : customers.length ? customers.map(customer => {
                    const selected = recipients.some(item => item.email === customer.email);
                    return (
                      <label key={customer.id} className="flex cursor-pointer items-center gap-3 border-b border-accent/10 px-3 py-2.5 last:border-0 hover:bg-white/[0.03]">
                        <input type="checkbox" checked={selected} onChange={() => toggleCustomer(customer)} className="rounded border-border bg-black/30 text-accent focus:ring-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{customer.email}</span>
                          <span className="block truncate text-xs text-muted">{customer.name || 'Customer'} · {customer.status}</span>
                        </span>
                      </label>
                    );
                  }) : <p className="p-3 text-sm text-muted">No customers match that search.</p>}
                </div>
                {(customersData?.total ?? 0) > (customersData?.limit ?? 50) && <p className="mt-1 text-xs text-muted">Showing the first 50 matches. Search to narrow the list.</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="manual-recipients">Add email addresses</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input id="manual-recipients" value={manualEmail} onChange={event => setManualEmail(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addManualRecipients(); } }} placeholder="name@example.com, another@example.com" className="min-w-0 flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                  <button type="button" onClick={addManualRecipients} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-white/5"><Plus size={15} /> Add</button>
                </div>
              </div>
              {recipientError && <p role="alert" className="text-sm text-danger">{recipientError}</p>}
            </section>

            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div>
                <h2 className="font-semibold">Message</h2>
                <p className="mt-1 text-sm text-muted">The sender address is configured in Admin → Settings → Integrations.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="email-subject">Subject</label>
                <input id="email-subject" required maxLength={300} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Email subject" className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="email-reply-to">Reply-to address <span className="font-normal text-muted">(optional)</span></label>
                <input id="email-reply-to" type="email" value={replyTo} onChange={event => setReplyTo(event.target.value)} placeholder="support@example.com" className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="email-html">HTML body</label>
                <textarea id="email-html" value={html} onChange={event => setHtml(event.target.value)} rows={12} maxLength={100000} placeholder="Write HTML email content here" className="w-full resize-y rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                <p className="mt-1 text-xs text-muted">HTML is previewed in a sandbox. Don’t include passwords or other secrets in a broadcast.</p>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-accent-hover">Plain-text version</summary>
                <textarea value={text} onChange={event => setText(event.target.value)} rows={6} maxLength={100000} placeholder="Optional plain-text email alternative" className="mt-3 w-full resize-y rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                <p className="mt-1 text-xs text-muted">If left blank, a basic plain-text version is generated from the HTML.</p>
              </details>
              {sendMutation.isError && <p role="alert" className="text-sm text-danger">{sendMutation.error.message}</p>}
              <div className="flex justify-end">
                <button type="submit" disabled={sendMutation.isPending} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"><Send size={15} /> Review and send</button>
              </div>
            </section>
          </div>

          <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6 2xl:sticky 2xl:top-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="font-semibold">Email preview</h2><p className="mt-1 truncate text-sm text-muted">{subject || 'No subject yet'}</p></div>
              <Eye size={18} className="shrink-0 text-accent-hover" />
            </div>
            <iframe title="Email preview" srcDoc={previewHtml} sandbox="" referrerPolicy="no-referrer" className="h-[38rem] w-full rounded-lg border border-border bg-white" />
          </section>
        </form>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <h2 className="font-semibold">Sent mail</h2>
            <p className="mt-1 text-sm text-muted">Delivery status and a viewer for messages composed in this Email Center.</p>
          </div>
          {messagesLoading ? <div role="status" aria-label="Loading sent mail"><Skeleton className="m-6 h-48 w-[calc(100%-3rem)]" /></div> : messages.length === 0 ? (
            <EmptyState compact title="No emails sent yet" description="Messages sent from the composer will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-y border-border text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium sm:px-6">Date</th><th className="px-4 py-3 font-medium sm:px-6">To</th><th className="px-4 py-3 font-medium sm:px-6">Subject</th><th className="px-4 py-3 font-medium sm:px-6">Status</th><th className="px-4 py-3 sm:px-6"></th></tr></thead>
                <tbody>{messages.map(message => (
                  <tr key={message.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted sm:px-6">{formatDateTime(message.sentAt || message.createdAt)}</td>
                    <td className="max-w-64 truncate px-4 py-3 sm:px-6">{message.to}</td>
                    <td className="max-w-72 truncate px-4 py-3 sm:px-6">{message.subject}</td>
                    <td className="px-4 py-3 sm:px-6"><StatusBadge status={message.status} /></td>
                    <td className="px-4 py-3 text-right sm:px-6"><button onClick={() => setOpenMessageId(message.id)} className="inline-flex items-center gap-1.5 text-sm text-accent-hover hover:underline"><Eye size={14} /> View</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {messagesData?.total > messages.length && <p className="border-t border-border px-4 py-3 text-sm text-muted sm:px-6">Showing the latest {messages.length} of {messagesData.total} emails.</p>}
        </section>
      )}

      <ConfirmDialog
        key={confirmSend ? 'confirm-open' : 'confirm-closed'}
        open={confirmSend}
        title={`Send email to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}?`}
        description="The message will be sent separately to each address, so recipients will not see one another. Type SEND to confirm."
        requireText="SEND"
        confirmLabel="Send email"
        pending={sendMutation.isPending}
        error={sendMutation.isError ? sendMutation.error.message : null}
        onConfirm={sendNow}
        onCancel={() => setConfirmSend(false)}
      />

      {openMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 sm:p-6">
          <div role="dialog" aria-modal="true" aria-label="Email message viewer" className="my-auto flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border p-4 sm:p-6">
              <div className="min-w-0"><h2 className="font-semibold">{selectedMessage?.message?.subject || 'Email details'}</h2><p className="mt-1 break-all text-sm text-muted">To: {selectedMessage?.message?.to || 'Loading…'}</p></div>
              <button onClick={() => setOpenMessageId(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5">Close</button>
            </div>
            <div className="overflow-y-auto p-4 sm:p-6">
              {messageLoading ? <Skeleton className="h-72 w-full" /> : selectedMessage?.message?.error ? <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{selectedMessage.message.error}</p> : bodyForViewer ? <iframe title="Sent email content" srcDoc={bodyForViewer} sandbox="" referrerPolicy="no-referrer" className="h-[65dvh] w-full rounded-lg border border-border bg-white" /> : <p className="text-sm text-muted">The email body wasn’t archived for this older message. New Email Center messages include a viewable copy.</p>}
            </div>
            {selectedMessage?.message && <div className="border-t border-border px-4 py-3 text-xs text-muted sm:px-6">{selectedMessage.message.status} · {selectedMessage.message.provider} · {formatDateTime(selectedMessage.message.sentAt || selectedMessage.message.createdAt)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
