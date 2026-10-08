import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { BookOpen, Sparkles, Rocket, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../lib/api';

export default function SupportPage() {
  const { user } = useOutletContext();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiFetch('/account/support', {
      method: 'POST',
      body: JSON.stringify({ subject, message }),
    }),
    onSuccess: () => {
      setSubject('');
      setMessage('');
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Account</p>
        <h1 className="mt-1 font-serif text-4xl italic">Support.</h1>
        <p className="mt-1 text-muted">We usually reply within a few hours on business days.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <BookOpen size={18} className="text-accent-hover" />
          <h3 className="mt-3 font-semibold">Docs</h3>
          <p className="mt-1 text-sm text-muted">Setup guides, hooks, filters, troubleshooting.</p>
          <a href="#" className="mt-2 inline-block text-sm text-accent-hover hover:underline">Open docs →</a>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Sparkles size={18} className="text-accent-hover" />
          <h3 className="mt-3 font-semibold">Changelog</h3>
          <p className="mt-1 text-sm text-muted">Every release with dates and descriptions.</p>
          <a href="#" className="mt-2 inline-block text-sm text-accent-hover hover:underline">View changelog →</a>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Rocket size={18} className="text-accent-hover" />
          <h3 className="mt-3 font-semibold">Setup guide</h3>
          <p className="mt-1 text-sm text-muted">Install, activate, and configure in 5 minutes.</p>
          <a href="#" className="mt-2 inline-block text-sm text-accent-hover hover:underline">Start setup →</a>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <ShieldCheck size={18} className="text-accent-hover" />
          <h3 className="mt-3 font-semibold">License FAQ</h3>
          <p className="mt-1 text-sm text-muted">Common questions about activations and renewals.</p>
          <a href="#" className="mt-2 inline-block text-sm text-accent-hover hover:underline">Read FAQ →</a>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Send us a message</h2>

        {mutation.isSuccess && (
          <div className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            Message sent. We'll reply to {user?.email}.
          </div>
        )}
        {mutation.isError && (
          <div className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {mutation.error.message}
          </div>
        )}

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Subject</label>
            <input
              type="text"
              required
              placeholder="What's this about?"
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Message</label>
            <textarea
              required
              rows={6}
              placeholder="Tell us what's going on. Include screenshots if it helps."
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Reply-to email</label>
            <input
              type="email"
              disabled
              value={user?.email || ''}
              className="w-full rounded-lg border border-border bg-black/10 px-3 py-2.5 text-sm text-muted"
            />
            <p className="mt-1 text-sm text-muted">We reply to the email on your account: {user?.email}</p>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {mutation.isPending ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </form>
      </div>

      <p className="text-sm text-muted">For urgent issues that affect a live client site, mention "urgent" in the subject.</p>
    </div>
  );
}
