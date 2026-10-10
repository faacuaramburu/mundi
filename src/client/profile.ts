import { normalizePlayerName, playerNameLimit } from '../shared/profile.js';
import { onLanguageChange, t } from './i18n.js';
import type { Message } from './i18n.js';

const key = 'mundi-player-name';
let name = '';
try { name = normalizePlayerName(localStorage.getItem(key) ?? '') ?? ''; }
catch { /* A name remains optional when browser storage is unavailable. */ }
const listeners = new Set<() => void>();
export function getPlayerName(): string { return name; }
export function onProfileChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function initializeProfile(): void {
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
    form.addEventListener('submit', event => {
      event.preventDefault();
      const next = normalizePlayerName(input.value);
      if (next === null) {
        field.message = 'profileInvalid'; input.setAttribute('aria-invalid', 'true'); render(); input.focus(); return;
      }
      name = next;
      let saved = true;
      try { localStorage.setItem(key, name); } catch { saved = false; }
      for (const other of fields) {
        other.input.value = name; other.input.removeAttribute('aria-invalid');
        other.message = saved ? (name ? 'profileSaved' : 'profileGuest') : 'profileTemporary';
      }
      render(); for (const listener of listeners) listener();
    });
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); field.message = 'profileHint'; render(); });
  });
  function render(): void {
    for (const field of fields) {
      field.label.textContent = t('profileName'); field.button.textContent = t('profileSave');
      field.input.placeholder = t('profilePlaceholder'); field.note.textContent = t(field.message);
      field.note.classList.toggle('error', field.message === 'profileInvalid');
    }
  }
  const unsubscribe = onLanguageChange(render);
  const storage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    name = normalizePlayerName(event.newValue ?? '') ?? '';
    for (const field of fields) { field.input.value = name; field.message = 'profileHint'; field.input.removeAttribute('aria-invalid'); }
    render(); for (const listener of listeners) listener();
  };
  window.addEventListener('storage', storage); render();
  if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); window.removeEventListener('storage', storage); });
}
