import Skeleton from './Skeleton';

export default function AdminStatsSkeleton({ count = 4 }) {
  return (
    <div role="status" aria-label="Loading statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="mt-4 h-7 w-2/3" />
          <Skeleton className="mt-3 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
