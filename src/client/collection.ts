import type { Atlas } from '../shared/countries.js';
import { normalizeName } from '../shared/countries.js';
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
    add(id: string): void {
      if (!validIds.has(id)) return;
      mergeSaved(); ids.add(id);
      try { localStorage.setItem(key, JSON.stringify([...ids])); storageAvailable = true; } catch { storageAvailable = false; }
      for (const listener of listeners) listener();
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
  const list = document.querySelector<HTMLElement>('#index-countries')!;
  const globeButton = document.querySelector<HTMLButtonElement>('#index-globe')!;
  const flatButton = document.querySelector<HTMLButtonElement>('#index-flat')!;
  function chooseView(flat: boolean): void {
    globe.setFlatMap(flat);
    globeButton.setAttribute('aria-pressed', String(!flat));
    flatButton.setAttribute('aria-pressed', String(flat));
    try { localStorage.setItem('mundi-index-view', flat ? 'flat' : 'globe'); }
    catch { /* The current view remains available without storage. */ }
  }
  globeButton.addEventListener('click', () => chooseView(false));
  flatButton.addEventListener('click', () => chooseView(true));
  let flat = false;
  try { flat = localStorage.getItem('mundi-index-view') === 'flat'; }
  catch { /* The index defaults to the globe without storage. */ }
  chooseView(flat);
  panel.hidden = false;
  document.querySelector('.game-panel')!.classList.add('index-panel');
  document.querySelector<HTMLElement>('#feedback')!.hidden = true;
  document.querySelector<HTMLElement>('.legend')!.hidden = true;
  setTranslatedText(document.querySelector('#mode-label')!, 'countryIndex');
  function render(): void {
    globe.showCollection(collection.ids);
    document.querySelector('#index-count')!.textContent = `${collection.ids.size} / ${atlas.countries.length}`;
    document.querySelector('#index-progress')!.setAttribute('value', String(collection.ids.size));
    setTranslatedText(document.querySelector('#storage-note')!, collection.canSave ? 'localProgress' : 'storageUnavailable');
    const normalized = normalizeName(query.value);
    const visible = atlas.countries.filter(country => (!normalized || [country.name, country.nameEs, country.id].some(name => normalizeName(name).includes(normalized)))
      && (filter.value === 'all' || collection.ids.has(country.id) === (filter.value === 'found')))
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
  onLanguageChange(render); collection.subscribe(render); render();
}
