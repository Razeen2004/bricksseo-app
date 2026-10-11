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
  const [twoFactorChallenge, setTwoFactorChallenge] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (credentials) => apiFetch(twoFactorChallenge ? '/auth/login/2fa' : '/auth/login', {
      method: 'POST',
      body: JSON.stringify(twoFactorChallenge
        ? { challengeToken: twoFactorChallenge, code: twoFactorCode }
        : credentials)
    }),
    onSuccess: (data) => {
      if (data?.requiresTwoFactor) {
        setTwoFactorChallenge(data.challengeToken);
        setTwoFactorCode('');
        return;
      }
      navigate(data?.mustChangePassword ? '/change-password' : '/');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (twoFactorChallenge) mutation.mutate({});
    else mutation.mutate({ email, password });
  };

  return (
    <AuthShell
      title="Welcome back."
      subtitle={twoFactorChallenge ? 'Enter your authenticator code to finish signing in.' : 'Log in to manage your Bricks SEO license.'}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {mutation.isError && (
          <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {mutation.error.message}
          </div>
        )}

        {!twoFactorChallenge && <div>
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
        </div>}

        {!twoFactorChallenge && <div>
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
        </div>}

        {twoFactorChallenge && <div>
          <label className="mb-1.5 block text-sm text-muted">Authenticator or recovery code</label>
          <input
            autoFocus
            required
            autoComplete="one-time-code"
            inputMode="text"
            placeholder="123456 or recovery code"
            className="w-full rounded-lg border border-accent/40 bg-black/30 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            value={twoFactorCode}
            onChange={e => setTwoFactorCode(e.target.value)}
          />
          <button type="button" onClick={() => { setTwoFactorChallenge(''); setTwoFactorCode(''); mutation.reset(); }} className="mt-2 text-sm text-accent-hover hover:underline">Back to password</button>
        </div>}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {mutation.isPending ? 'Logging in…' : twoFactorChallenge ? 'Verify & log in' : 'Log in'}
        </button>

        {!twoFactorChallenge && <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs tracking-widest text-muted">OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>}

        {!twoFactorChallenge && <a
          href="https://bricksseo.com/pricing"
          className="block w-full rounded-lg border border-border py-2.5 text-center text-sm font-semibold text-ink hover:bg-white/5"
        >
          Buy a license →
        </a>}
      </form>
    </AuthShell>
  );
}
