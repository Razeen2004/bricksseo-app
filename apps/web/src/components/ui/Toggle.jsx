export default function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <div>
          {label && <p className="text-sm font-medium leading-5">{label}</p>}
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`-mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/10'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
