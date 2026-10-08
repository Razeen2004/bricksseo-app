import { normalizeSiteUrl } from './normalize-site.js';

export function classifySite(siteEnv, rawUrl) {
  if (siteEnv === 'local' || siteEnv === 'development') {
    return { countsTowardLimit: false };
  }

  const normalized = normalizeSiteUrl(rawUrl);
  
  // Free matching dev patterns
  const devPatterns = [
    /^localhost(\/|$)/,
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/|$)/, // Bare IPs
    /\.local(\/|$)/,
    /\.test(\/|$)/,
    /\.localhost(\/|$)/,
    /\.ddev\.site(\/|$)/,
    /\.lndo\.site(\/|$)/,
    /\.instawp\.xyz(\/|$)/,
    /\.tastewp\.com(\/|$)/,
    /\.kinsta\.cloud(\/|$)/,
    /\.flywheelsites\.com(\/|$)/,
    /\.wpenginepowered\.com(\/|$)/,
    /^staging\./,
    /^dev\./
  ];

  for (const pattern of devPatterns) {
    if (pattern.test(normalized)) {
      return { countsTowardLimit: false };
    }
  }

  // Everything else counts, including 'staging' on an arbitrary host.
  return { countsTowardLimit: true };
}
