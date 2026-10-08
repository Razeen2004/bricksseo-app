export default function AddSiteInfoDialog({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Activating a site</h3>
        <p className="mt-2 text-sm text-muted">
          Sites activate automatically — there's nothing to do here. Paste your license key into
          <span className="font-medium text-ink"> Bricks SEO → License</span> in your WordPress admin, and the site
          will show up on this list.
        </p>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
