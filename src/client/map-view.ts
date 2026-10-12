import type { Globe } from './globe.js';

export function initializeMapView(globe: Globe, group: HTMLElement, storageKey: string): void {
  const globeButton = group.querySelector<HTMLButtonElement>('[data-map-view="globe"]')!;
  const flatButton = group.querySelector<HTMLButtonElement>('[data-map-view="flat"]')!;
  function render(): void {
    globeButton.disabled = !globe.hasGlobe;
    globeButton.setAttribute('aria-pressed', String(!globe.isFlatMap));
    flatButton.setAttribute('aria-pressed', String(globe.isFlatMap));
  }
  function choose(flat: boolean): void {
    globe.setFlatMap(flat);
    try { localStorage.setItem(storageKey, globe.isFlatMap ? 'flat' : 'globe'); }
    catch { /* The current view remains available without storage. */ }
  }
  globeButton.addEventListener('click', () => choose(false));
  flatButton.addEventListener('click', () => choose(true));
  globe.onMapViewChange(render);
  let flat = false;
  try { flat = localStorage.getItem(storageKey) === 'flat'; }
  catch { /* The globe is the default when storage is unavailable. */ }
  globe.setFlatMap(flat);
  render();
  group.hidden = false;
}
