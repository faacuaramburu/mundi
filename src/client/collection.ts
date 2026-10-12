import type { Atlas } from '../shared/countries.js';
import { countryRegion, filterIndexCountries } from '../shared/regions.js';
import { initializeMapView } from './map-view.js';
import { parseCollection } from '../shared/collection.js';
import type { Globe } from './globe.js';
import { countryName, onLanguageChange, setTranslatedText, t } from './i18n.js';
import { countryFlag } from './flags.js';

const key = 'mundi-collection-v1';
export function createCollection(atlas: Atlas) {
  const validIds = new Set(atlas.countries.map(country => country.id));
  let storageAvailable = true;
  let ids = new Set<string>();
  try { ids = new Set(parseCollection(JSON.parse(localStorage.getItem(key) ?? '[]') as unknown, validIds)); }
  catch { storageAvailable = false; }
  const listeners = new Set<() => void>();
  function mergeSaved(): void {
    try {
      const stored = parseCollection(JSON.parse(localStorage.getItem(key) ?? '[]') as unknown, validIds);
      for (const id of stored) ids.add(id);
    } catch { storageAvailable = false; }
  }
  const collection = {
    get ids(): ReadonlySet<string> { return ids; },
    get canSave(): boolean { return storageAvailable; },
    add(id: string): boolean {
      if (!validIds.has(id)) return false;
      mergeSaved();
      const isNew = !ids.has(id);
      ids.add(id);
      try { localStorage.setItem(key, JSON.stringify([...ids])); storageAvailable = true; } catch { storageAvailable = false; }
      for (const listener of listeners) listener();
      return isNew && storageAvailable;
    },
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  window.addEventListener('storage', event => {
    if (event.key !== key) return;
    mergeSaved(); for (const listener of listeners) listener();
  });
  return collection;
}
export type Collection = ReturnType<typeof createCollection>;

export function showIndex(atlas: Atlas, globe: Globe, collection: Collection): void {
  const panel = document.querySelector<HTMLElement>('#country-index')!;
  const query = document.querySelector<HTMLInputElement>('#index-search')!;
  const filter = document.querySelector<HTMLSelectElement>('#index-filter')!;
  const region = document.querySelector<HTMLSelectElement>('#index-region')!;
  const list = document.querySelector<HTMLElement>('#index-countries')!;
  initializeMapView(globe, document.querySelector<HTMLElement>('.index-views')!, 'mundi-index-view');
  panel.hidden = false;
  document.querySelector('.game-panel')!.classList.add('index-panel');
  document.querySelector<HTMLElement>('#feedback')!.hidden = true;
  document.querySelector<HTMLElement>('.legend')!.hidden = true;
  setTranslatedText(document.querySelector('#mode-label')!, 'countryIndex');
  function render(): void {
    const regionalCountries = atlas.countries.filter(country => region.value === 'all' || countryRegion(country.id) === region.value);
    const regionalIds = new Set(regionalCountries.filter(country => collection.ids.has(country.id)).map(country => country.id));
    globe.showCollection(regionalIds);
    document.querySelector('#index-count')!.textContent = `${regionalIds.size} / ${regionalCountries.length}`;
    document.querySelector('#index-progress')!.setAttribute('max', String(regionalCountries.length));
    document.querySelector('#index-progress')!.setAttribute('value', String(regionalIds.size));
    setTranslatedText(document.querySelector('#storage-note')!, collection.canSave ? 'localProgress' : 'storageUnavailable');
    const visible = filterIndexCountries(atlas.countries, collection.ids, { query: query.value, status: filter.value, region: region.value })
      .sort((a, b) => countryName(a).localeCompare(countryName(b)));
    list.replaceChildren();
    for (const country of visible) {
      const entry = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'index-country';
      const found = collection.ids.has(country.id); button.classList.toggle('found', found);
      const name = document.createElement('span'); name.textContent = countryName(country);
      const status = document.createElement('small'); status.textContent = t(found ? 'collected' : 'notCollected');
      button.append(countryFlag(country), name, status);
      button.addEventListener('click', () => { globe.focusCountry(country); });
      entry.append(button); list.append(entry);
    }
    setTranslatedText(document.querySelector('#index-empty')!, 'noMatches');
    document.querySelector<HTMLElement>('#index-empty')!.hidden = visible.length > 0;
  }
  query.addEventListener('input', render); filter.addEventListener('change', render);
  region.addEventListener('change', render);
  onLanguageChange(render); collection.subscribe(render); render();
}
