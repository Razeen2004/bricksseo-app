import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import AuthShell from './AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiFetch('/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ email })
    })
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
    >
      {mutation.isSuccess ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-ink">
            If that email exists, a reset link is on its way. Check your inbox (and spam).
          </p>
          <Link to="/login" className="inline-block text-sm text-accent-hover hover:underline">
            ← Back to login
          </Link>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm text-muted">Email</label>
            <input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              className="w-full rounded-lg border border-accent/40 bg-black/30 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {mutation.isPending ? 'Sending…' : 'Send reset link'}
          </button>

          <Link to="/login" className="block text-center text-sm text-accent-hover hover:underline">
            ← Back to login
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
