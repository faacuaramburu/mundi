import { normalizePlayerName, playerNameLimit } from '../shared/profile.js';
import { onLanguageChange, t } from './i18n.js';
import type { Message } from './i18n.js';
import { progressGet, progressSet, progressOwner } from './progress-storage.js';
import { getAccountIdentity, onAccountIdentityChange, saveAccountUsername } from './account-identity.js';
import { normalizeUsername } from '../shared/username.js';

const key = 'mundi-player-name';
let name = '';
try { name = normalizePlayerName(progressGet(key) ?? '') ?? ''; }
catch { /* A name remains optional when browser storage is unavailable. */ }
const listeners = new Set<() => void>();
export function getPlayerName(): string { return getAccountIdentity().username ?? name; }
export function onProfileChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function initializeProfile(): void {
  let saving = false;
  const fields: { input: HTMLInputElement; label: HTMLLabelElement; button: HTMLButtonElement; note: HTMLElement; message: Message }[] = [];
  document.querySelectorAll<HTMLElement>('[data-player-profile]').forEach((host, index) => {
    const form = document.createElement('form'); form.className = 'player-profile';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.id = `player-name-${index}`; input.name = 'player-name'; input.type = 'text';
    input.maxLength = playerNameLimit; input.setAttribute('autocomplete', 'nickname'); input.value = name;
    const note = document.createElement('p'); note.id = `${input.id}-note`; note.className = 'profile-note';
    note.setAttribute('role', 'status'); input.setAttribute('aria-describedby', note.id);
    label.htmlFor = input.id;
    const button = document.createElement('button'); button.type = 'submit'; button.className = 'secondary-button';
    const row = document.createElement('div'); row.className = 'profile-row'; row.append(input, button);
    form.append(label, row, note); host.append(form);
    const field = { input, label, button, note, message: 'profileHint' as Message }; fields.push(field);
    form.addEventListener('submit', event => { void submit(event); });
    async function submit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      if (saving) return;
      const owner = progressOwner();
      if (owner) {
        const next = normalizeUsername(input.value);
        if (!next) { field.message = 'usernameInvalid'; input.setAttribute('aria-invalid', 'true'); render(); input.focus(); return; }
        if (!getAccountIdentity().ready || getAccountIdentity().uid !== owner) return;
        saving = true; field.message = 'usernameSaving'; render();
        const result = await saveAccountUsername(next); saving = false;
        if (progressOwner() !== owner) { render(); return; }
        field.message = result === 'saved' ? 'usernameSaved' : result === 'taken' ? 'usernameTaken' : result === 'invalid' ? 'usernameInvalid' : 'usernameUnavailable';
        if (result === 'saved') {
          name = next;
          for (const other of fields) { other.input.value = name; other.input.removeAttribute('aria-invalid'); other.message = 'usernameSaved'; }
          for (const listener of listeners) listener();
        } else input.setAttribute('aria-invalid', 'true');
        render(); return;
      }
      const next = normalizePlayerName(input.value);
      if (next === null) {
        field.message = 'profileInvalid'; input.setAttribute('aria-invalid', 'true'); render(); input.focus(); return;
      }
      name = next;
      let saved = true;
      try { progressSet(key, name); progressSet('mundi-player-name-updated-at', String(Date.now())); } catch { saved = false; }
      for (const other of fields) {
        other.input.value = name; other.input.removeAttribute('aria-invalid');
        other.message = saved ? (name ? 'profileSaved' : 'profileGuest') : 'profileTemporary';
      }
      render(); for (const listener of listeners) listener();
    }
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); field.message = 'profileHint'; render(); });
  });
  function render(): void {
    for (const field of fields) {
      const account = !!progressOwner(); const identity = getAccountIdentity();
      field.label.textContent = t(account ? 'usernameLabel' : 'profileName'); field.button.textContent = t('profileSave');
      field.input.placeholder = t(account ? 'usernamePlaceholder' : 'profilePlaceholder');
      field.input.minLength = account ? 3 : 0;
      field.input.disabled = saving; field.button.disabled = saving || (account && (!identity.ready || identity.uid !== progressOwner()));
      field.note.textContent = t(field.message === 'profileHint' && account ? identity.ready ? 'usernameHint' : 'accountLoading' : field.message);
      field.note.classList.toggle('error', ['profileInvalid', 'usernameInvalid', 'usernameTaken', 'usernameUnavailable'].includes(field.message));
    }
  }
  const unsubscribe = onLanguageChange(render);
  const storage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    name = normalizePlayerName(progressGet(key) ?? '') ?? '';
    for (const field of fields) { field.input.value = name; field.message = getAccountIdentity().username ? 'usernameSaved' : 'profileHint'; field.input.removeAttribute('aria-invalid'); }
    render(); for (const listener of listeners) listener();
  };
  const restored = () => {
    name = normalizePlayerName(progressGet(key) ?? '') ?? '';
    for (const field of fields) { field.input.value = name; field.message = getAccountIdentity().username ? 'usernameSaved' : 'profileHint'; field.input.removeAttribute('aria-invalid'); }
    render(); for (const listener of listeners) listener();
  };
  window.addEventListener('mundi-progress-restored', restored);
  const stopIdentity = onAccountIdentityChange(() => {
    const identity = getAccountIdentity();
    if (identity.username) name = identity.username;
    for (const field of fields) { field.input.value = name; field.message = identity.username ? 'usernameSaved' : 'profileHint'; field.input.removeAttribute('aria-invalid'); }
    render(); for (const listener of listeners) listener();
  });
  window.addEventListener('storage', storage); render();
  if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); stopIdentity(); window.removeEventListener('storage', storage); window.removeEventListener('mundi-progress-restored', restored); });
}
