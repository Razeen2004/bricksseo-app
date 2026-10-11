import Skeleton from './Skeleton';

export default function AdminTableSkeleton({ columns = 5, rows = 6, className = '' }) {
  return (
    <div role="status" aria-label="Loading table" aria-busy="true" className={`space-y-3 p-6 ${className}`}>
      <span className="sr-only">Loading…</span>
      <div className="grid gap-4 border-b border-accent/15 pb-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, i) => <Skeleton key={i} className="h-3 w-2/3" />)}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="grid items-center gap-4 border-b border-accent/10 py-2 last:border-0" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, col) => <Skeleton key={col} className={`h-4 ${col === 0 ? 'w-4/5' : 'w-3/5'}`} />)}
        </div>
      ))}
    </div>
  );
}
