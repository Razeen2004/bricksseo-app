export default function Pagination({ page, pageSize, total, onPageChange }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  return (
    <div className="flex flex-col items-start justify-between gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
      <p className="text-sm text-muted">Showing {start}–{end} of {total}</p>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          className="min-h-10 flex-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent sm:flex-none"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          className="min-h-10 flex-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent sm:flex-none"
        >
          Next
        </button>
      </div>
    </div>
  );
}
