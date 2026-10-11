export default function StatCard({ label, value, valueClassName = '', sub }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl ${valueClassName}`}>{value}</p>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}
