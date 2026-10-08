import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import AuthShell from './AuthShell';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (credentials) => apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }),
    onSuccess: (data) => {
      navigate(data?.mustChangePassword ? '/change-password' : '/');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({ email, password });
  };

  return (
    <AuthShell
      title="Welcome back."
      subtitle="Log in to manage your Bricks SEO license."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {mutation.isError && (
          <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {mutation.error.message}
          </div>
        )}

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

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm text-muted">Password</label>
            <Link to="/forgot-password" className="text-sm text-accent-hover hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              placeholder="Enter your password"
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {mutation.isPending ? 'Logging in…' : 'Log in'}
        </button>

        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs tracking-widest text-muted">OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <a
          href="https://bricksseo.com/pricing"
          className="block w-full rounded-lg border border-border py-2.5 text-center text-sm font-semibold text-ink hover:bg-white/5"
        >
          Buy a license →
        </a>
      </form>
    </AuthShell>
  );
}
