export default function StatCard({ label, value, valueClassName = '', sub }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${valueClassName}`}>{value}</p>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}
