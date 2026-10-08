import Logo from '../../components/ui/Logo';

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12 font-sans text-ink">
      <Logo className="mb-8" />

      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <h1 className="text-center font-serif text-3xl italic">{title}</h1>
        {subtitle && <p className="mt-2 text-center text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>

      <p className="mt-8 text-sm text-muted">
        Need help? contact <a href="mailto:support@bricksseo.com" className="text-accent-hover hover:underline">support@bricksseo.com</a>
      </p>
    </div>
  );
}
