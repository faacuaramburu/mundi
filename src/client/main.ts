import './style.css';
import { initializeLanguage, setTranslatedText } from './i18n.js';

initializeLanguage();
import atlasUrl from '../../data/atlas.json?url';
import { Globe } from './globe.js';
import type { Atlas } from '../shared/countries.js';

const mapResponse = await fetch(atlasUrl, { signal: AbortSignal.timeout(20000) });
if (!mapResponse.ok) throw new Error('Map data unavailable');
const atlas = await mapResponse.json() as Atlas;
const host = document.querySelector<HTMLElement>('#globe-host');
if (!host) throw new Error('Globe host unavailable');
const globe = new Globe(host, atlas);
document.querySelector('#reset-view')?.addEventListener('click', () => globe.resetView());

if (import.meta.env.DEV) {
  const { startPractice } = await import('./practice.js');
  startPractice(atlas, globe);
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

if (import.meta.hot) import.meta.hot.dispose(() => globe.dispose());
