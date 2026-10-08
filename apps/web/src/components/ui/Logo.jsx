export default function Logo({ withText = true, className = '', textClassName = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src="/bricks-seo-sidebar-logo.png" alt="Bricks SEO" className="h-7 w-auto" />
      {withText && <span className={`font-semibold ${textClassName}`}>Bricks SEO</span>}
    </div>
  );
}
