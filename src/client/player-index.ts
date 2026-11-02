import { getApp, getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, onSnapshot } from 'firebase/firestore';
import type { Atlas } from '../shared/countries.js';
import type { FirebaseWebConfig } from '../shared/account.js';
import type { Globe } from './globe.js';
import { normalizeUsername } from '../shared/username.js';
import { publicCountries } from '../shared/public-profile.js';
import { showIndex } from './collection.js';
import { onLanguageChange, setTranslatedText } from './i18n.js';
import type { Message } from './i18n.js';

export async function showPlayerIndex(atlas: Atlas, globe: Globe, value: string): Promise<void> {
  const username = normalizeUsername(value);
  const status = document.querySelector<HTMLElement>('#public-profile-status')!;
  const panel = document.querySelector<HTMLElement>('#country-index')!;
  panel.hidden = false; panel.classList.add('public-index', 'profile-unavailable');
  document.querySelector('.game-panel')!.classList.add('index-panel');
  document.querySelector<HTMLElement>('#feedback')!.hidden = true;
  document.querySelector<HTMLElement>('.legend')!.hidden = true;
  const title = document.querySelector('#index-title')!;
  title.removeAttribute('data-i18n'); title.textContent = username ? `@${username}` : '';
  setTranslatedText(document.querySelector('#mode-label')!, 'playerProfile');
  let state: Message = 'publicIndexLoading';
  const renderStatus = () => { status.hidden = state === 'publicIndexReadOnly'; setTranslatedText(status, state); };
  renderStatus(); onLanguageChange(renderStatus);
  if (!username) { state = 'publicIndexMissing'; renderStatus(); return; }
  try {
    const response = await fetch('/api/account/config', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Profile unavailable');
    const config = await response.json() as { enabled: boolean; firebase?: FirebaseWebConfig };
    if (!config.enabled || !config.firebase) throw new Error('Profile unavailable');
    const db = getFirestore(getApps().length ? getApp() : initializeApp(config.firebase));
    const name = await getDoc(doc(db, 'usernames', username));
    const uid: unknown = name.data()?.uid;
    if (!name.exists() || typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) { state = 'publicIndexMissing'; renderStatus(); return; }
    const ids = new Set<string>(); const listeners = new Set<() => void>();
    const valid = new Set(atlas.countries.map(country => country.id));
    let initialized = false;
    const stop = onSnapshot(doc(db, 'publicProfiles', uid), snapshot => {
      const data = snapshot.data();
      if (!snapshot.exists() || data?.username !== username) { unavailable(); return; }
      ids.clear(); for (const id of publicCountries(data.countries, valid)) ids.add(id);
      panel.classList.remove('profile-unavailable'); state = 'publicIndexReadOnly'; renderStatus();
      if (!initialized) {
        initialized = true;
        showIndex(atlas, globe, { ids, canSave: true, addedAt: () => undefined, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } }, username);
      } else for (const listener of listeners) listener();
    }, unavailable);
    function unavailable(): void {
      ids.clear(); for (const listener of listeners) listener();
      globe.showCollection(ids); panel.classList.add('profile-unavailable'); state = 'publicIndexMissing'; renderStatus();
    }
    if (import.meta.hot) import.meta.hot.dispose(stop);
  } catch { state = 'publicIndexMissing'; renderStatus(); }
}
