import atlasUrl from '../../data/atlas.json?url';
import { initializeLanguage, setTranslatedText } from './i18n.js';
import { turnBrandOrbit } from './brand-motion.js';
import { Globe } from './globe.js';
import type { Atlas } from '../shared/countries.js';
import { createCollection, showIndex } from './collection.js';
import { initializeTheme } from './theme.js';
import { initializeHistoryOrder } from './history-order.js';
import { initializeProfile } from './profile.js';
import { initializeFaq } from './faq.js';
import { initializeMotion } from './motion.js';
import { initializeAnalytics } from './analytics.js';

initializeLanguage();
initializeTheme();
initializeHistoryOrder();
initializeProfile();
initializeFaq();
initializeMotion();
initializeAnalytics();
turnBrandOrbit();
document.querySelector('.brand')?.addEventListener('pointerenter', turnBrandOrbit);
document.querySelector('.brand')?.addEventListener('focus', turnBrandOrbit);
void fetch('/mundi.svg').then(async response => {
  if (!response.ok) return;
  const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
  if (svg.localName !== 'svg') return;
  svg.classList.add('brand-symbol'); svg.setAttribute('aria-hidden', 'true');
  document.querySelector('#brand-mark')?.replaceChildren(document.importNode(svg, true));
  turnBrandOrbit();
}).catch(() => { /* The same static image remains visible if inline motion is unavailable. */ });

const params = new URLSearchParams(location.search);
const isHome = !params.has('room') && !params.has('play') && !params.has('view') && !(import.meta.env.DEV && (params.has('practice') || params.has('target')));
if (isHome || params.get('play') === 'multi') {
  void fetch('/api/rooms/resume', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000) })
    .then(async response => {
      if (!response.ok) return;
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('roomId' in result)
        || typeof result.roomId !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(result.roomId)) return;
      const link = document.querySelector<HTMLAnchorElement>(isHome ? '#home-resume' : '#lobby-resume')!;
      link.href = `/?room=${result.roomId}`;
      link.hidden = false;
    }).catch(() => { /* New games remain available when resume cannot be checked. */ });
}
if (isHome) {
  document.querySelector<HTMLElement>('#home-screen')!.hidden = false;
  document.querySelector<HTMLElement>('#feedback')!.hidden = true;
  document.querySelector<HTMLElement>('.legend')!.hidden = true;
}

async function initializeGame(): Promise<Globe> {
  const mapResponse = await fetch(atlasUrl, { signal: AbortSignal.timeout(20000) });
  if (!mapResponse.ok) throw new Error('Map data unavailable');
  const atlas = await mapResponse.json() as Atlas;
  const host = document.querySelector<HTMLElement>('#globe-host');
  if (!host) throw new Error('Globe host unavailable');
  const globe = new Globe(host, atlas);
  document.querySelector('#reset-view')?.addEventListener('click', () => globe.resetView());

  const collection = createCollection(atlas);
  document.querySelector('#home-count')!.textContent = `${collection.ids.size} / ${atlas.countries.length}`;
  if (isHome) {
    setTranslatedText(document.querySelector('#mode-label')!, 'welcome');
  } else if (params.get('view') === 'index' && !params.has('room')) {
    showIndex(atlas, globe, collection);
  } else if (import.meta.env.DEV && !params.has('room') && (params.has('practice') || params.has('target'))) {
    document.querySelector<HTMLElement>('.history-section')!.hidden = false;
    const { startPractice } = await import('./practice.js');
    startPractice(atlas, globe);
  } else {
    const { startMultiplayer } = await import('./multiplayer.js');
    startMultiplayer(atlas, globe, collection);
  }
  return globe;
}

try {
  const globe = await initializeGame();
  if (import.meta.hot) import.meta.hot.dispose(() => globe.dispose());
} catch {
  document.querySelector<HTMLElement>('#feedback')!.hidden = false;
  setTranslatedText(document.querySelector('#feedback')!, 'mapError');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'secondary-button';
  setTranslatedText(retry, 'reload');
  retry.addEventListener('click', () => location.reload());
  document.querySelector('.game-panel')!.append(retry);
}

const status = document.querySelector<HTMLElement>('#server-status');
try {
  const response = await fetch('/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  const result: unknown = await response.json();
  const healthy = response.ok && typeof result === 'object' && result !== null && 'status' in result && result.status === 'ok';
  if (status) setTranslatedText(status, healthy ? 'connected' : 'unavailable');
} catch {
  if (status) setTranslatedText(status, 'unavailable');
}
