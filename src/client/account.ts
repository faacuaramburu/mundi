import type { Atlas } from '../shared/countries.js';
import type { FirebaseWebConfig } from '../shared/account.js';
import { onLanguageChange, setTranslatedText, t } from './i18n.js';

export async function initializeAccount(atlas: Promise<Atlas>): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('#account-toggle')!;
  const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  const status = document.querySelector<HTMLElement>('#account-status')!;
  const retry = document.querySelector<HTMLButtonElement>('#account-load-retry')!;
  let pending = false; let ready = false;
  const renderLabel = () => {
    if (!ready) { button.setAttribute('aria-label', t('accountLogin')); button.title = t('accountLogin'); }
  };
  renderLabel(); onLanguageChange(renderLabel);
  button.addEventListener('click', () => { if (!dialog.open) dialog.showModal(); });
  document.querySelector('#account-close')!.addEventListener('click', () => dialog.close());
  document.querySelector('#account-guest')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  async function load(): Promise<void> {
    if (pending || ready) return;
    pending = true; retry.hidden = true; dialog.setAttribute('aria-busy', 'true');
    setTranslatedText(status, 'accountLoading');
    try {
      const response = await fetch('/api/account/config', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Account service unavailable');
      const config = await response.json() as { enabled: boolean; firebase?: FirebaseWebConfig; customEmail?: boolean };
      if (!config.enabled || !config.firebase) throw new Error('Account service unavailable');
      const [{ startFirebaseAccount }, map] = await Promise.all([import('./firebase-account.js'), atlas]);
      startFirebaseAccount(config.firebase, new Set(map.countries.map(country => country.id)), config.customEmail === true);
      ready = true;
    } catch {
      dialog.setAttribute('aria-busy', 'false');
      setTranslatedText(status, 'accountUnavailable'); retry.hidden = false;
    } finally { pending = false; }
  }
  retry.addEventListener('click', () => { void load(); });
  await load();
}
