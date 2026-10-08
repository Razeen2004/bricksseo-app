export default function Pagination({ page, pageSize, total, onPageChange }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <p className="text-sm text-muted">Showing {start}–{end} of {total}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Next
        </button>
      </div>
    </div>
  );
}
