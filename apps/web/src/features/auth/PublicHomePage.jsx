import { Link } from 'react-router-dom';
import AuthShell from './AuthShell';

// Shown at the bare root domain (account.bricksseo.com) when no one is
// logged in, instead of forcing an immediate redirect to /login. A domain
// that only ever shows a login form to an anonymous visitor reads as a
// "login wall" to automated reviewers (Paddle's domain approval, SEO
// crawlers, uptime checks) — this gives them real, public content first.
export default function PublicHomePage() {
  return (
    <AuthShell
      title="Bricks SEO account portal."
      subtitle="Manage your license, sites, and billing for the Bricks SEO WordPress plugin."
    >
      <div className="space-y-3">
        <Link
          to="/login"
          className="block w-full rounded-lg bg-accent py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Log in
        </Link>
        <a
          href="https://bricksseo.com/pricing"
          className="block w-full rounded-lg border border-border py-2.5 text-center text-sm font-semibold text-ink hover:bg-white/5"
        >
          Buy a license →
        </a>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        <a href="https://bricksseo.com/terms-conditions/" className="hover:text-ink hover:underline">Terms</a>
        {' · '}
        <a href="https://bricksseo.com/privacy-policy/" className="hover:text-ink hover:underline">Privacy</a>
      </p>
    </AuthShell>
  );
}
