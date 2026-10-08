import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Check } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import AuthShell from './AuthShell';

const RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p) => /[0-9]/.test(p) },
];

export default function ResetPasswordPage() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isForcedChange = pathname === '/change-password';
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const rulesPassed = useMemo(() => RULES.map(r => r.test(password)), [password]);
  const allRulesPassed = rulesPassed.every(Boolean);
  const passwordsMatch = password.length > 0 && password === confirm;

  const mutation = useMutation({
    mutationFn: () => isForcedChange
      ? apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ password }) })
      : apiFetch('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
    onSuccess: () => {
      navigate(isForcedChange ? '/' : '/login');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!allRulesPassed || !passwordsMatch) return;
    mutation.mutate();
  };

  return (
    <AuthShell
      title="Set a new password."
      subtitle={isForcedChange
        ? 'Choose a strong password to finish signing in.'
        : 'Choose a strong password for your account.'}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {mutation.isError && (
          <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {mutation.error.message}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm text-muted">New password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoFocus
              placeholder="Enter a new password"
              className="w-full rounded-lg border border-accent/40 bg-black/30 px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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

        <div>
          <label className="mb-1.5 block text-sm text-muted">Confirm password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Repeat your password"
            className="w-full rounded-lg border border-border bg-black/30 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
        </div>

        <ul className="space-y-1.5">
          {RULES.map((rule, i) => (
            <li key={rule.label} className="flex items-center gap-2 text-sm">
              <Check size={14} className={rulesPassed[i] ? 'text-success' : 'text-muted/40'} />
              <span className={rulesPassed[i] ? 'text-ink' : 'text-muted'}>{rule.label}</span>
            </li>
          ))}
        </ul>

        <button
          type="submit"
          disabled={mutation.isPending || !allRulesPassed || !passwordsMatch}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </AuthShell>
  );
}
