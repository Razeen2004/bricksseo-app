import { URL } from 'url';

export function normalizeSiteUrl(rawUrl) {
  try {
    let siteUrl = rawUrl.trim().toLowerCase();
    
    // Add protocol if missing to allow URL parsing
    if (!siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = 'http://' + siteUrl;
    }
    
    const parsed = new URL(siteUrl);
    
    // Strip www.
    let host = parsed.hostname;
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }
    
    // Get path, default to empty string if just '/'
    let pathname = parsed.pathname;
    if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    
    return host + pathname;
  } catch (err) {
    // Fallback if it's completely unparseable
    return rawUrl.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  }
}
