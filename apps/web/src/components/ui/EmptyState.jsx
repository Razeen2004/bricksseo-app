import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'px-4 py-8' : 'rounded-2xl border border-dashed border-border bg-card px-5 py-10 sm:px-8 sm:py-12'}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-white/[0.03] text-muted">
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
