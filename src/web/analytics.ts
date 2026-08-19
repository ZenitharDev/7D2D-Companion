// Google Analytics (GA4) bootstrap. This runs as part of the app's own
// bundle instead of an inline <script> in index.html, so the site's CSP
// (see index.html) never needs 'unsafe-inline' for script-src — the only
// external script involved is the gtag.js loader tag itself, which is
// already explicitly allowed there.
const GA_MEASUREMENT_ID = 'G-0BTTTT46L2';

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

function gtag(...args: unknown[]): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

export function initAnalytics(): void {
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}

/** Fires a GA4 custom event. Safe to call before gtag.js finishes loading — dataLayer buffers pushes until the real script picks them up. */
export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  gtag('event', name, params);
}
