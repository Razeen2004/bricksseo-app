import Skeleton from './Skeleton';

export default function AdminStatsSkeleton({ count = 4 }) {
  const grid = count >= 4 ? 'sm:grid-cols-2 2xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3';
  return (
    <div role="status" aria-label="Loading statistics" className={`grid grid-cols-1 gap-4 ${grid}`}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:p-5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="mt-4 h-7 w-2/3" />
          <Skeleton className="mt-3 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
