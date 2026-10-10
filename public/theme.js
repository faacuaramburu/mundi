try {
  globalThis.document.documentElement.dataset.theme = globalThis.localStorage.getItem('mundi-theme') === 'light' ? 'light' : 'dark';
} catch {
  globalThis.document.documentElement.dataset.theme = 'dark';
}

const systemMotion = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
let savedMotion = null;
try { savedMotion = globalThis.localStorage.getItem('mundi-motion'); } catch { /* Use the system preference. */ }
globalThis.document.documentElement.dataset.motion = savedMotion === 'full' ? 'full'
  : savedMotion === 'reduced' || systemMotion.matches ? 'reduced' : 'full';

// The tab follows the browser/system theme, independently of the game's theme.
const browserTheme = globalThis.matchMedia('(prefers-color-scheme: dark)');
const favicon = globalThis.document.getElementById('mundi-favicon');
function updateFavicon() {
  if (favicon) favicon.href = browserTheme.matches ? '/favicon-dark.svg' : '/favicon-light.svg';
}
updateFavicon();
browserTheme.addEventListener('change', updateFavicon);
