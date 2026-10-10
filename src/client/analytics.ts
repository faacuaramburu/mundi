export function initializeAnalytics(): void {
  // The site identifier is public. Local development never sends analytics.
  const token: unknown = import.meta.env.VITE_CLOUDFLARE_ANALYTICS_TOKEN;
  if (!import.meta.env.PROD || typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return;

  const script = document.createElement('script');
  script.type = 'module';
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.dataset.cfBeacon = JSON.stringify({ token, spa: false });
  document.body.append(script);
}
