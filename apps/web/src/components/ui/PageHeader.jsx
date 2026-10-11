export default function PageHeader({ eyebrow, title, description, icon: Icon, actions }) {
  return (
    <header data-page-header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-dim text-accent-hover">
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}
          <h1 className="mt-1 break-words font-serif text-3xl italic leading-tight tracking-tight text-ink sm:text-4xl">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted sm:text-base">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
