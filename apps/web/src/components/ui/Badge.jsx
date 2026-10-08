const STATUS_STYLES = {
  active: 'bg-success/10 text-success',
  expired: 'bg-danger/10 text-danger',
  revoked: 'bg-danger/10 text-danger',
  suspended: 'bg-amber-400/10 text-amber-400',
  stale: 'bg-amber-400/10 text-amber-400',
  stale30: 'bg-amber-400/10 text-amber-400',
  stale90: 'bg-danger/10 text-danger',
  removed: 'bg-white/5 text-muted',
  disabled: 'bg-white/5 text-muted',
  expires_soon: 'bg-amber-400/10 text-amber-400',
  processed: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
  pending: 'bg-amber-400/10 text-amber-400',
  verified: 'bg-success/10 text-success',
};

export default function Badge({ status, children }) {
  const style = STATUS_STYLES[status] || 'bg-white/5 text-muted';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${style}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children || status}
    </span>
  );
}
