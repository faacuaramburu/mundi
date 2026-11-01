import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { legalVersion } from '../shared/legal.js';
import { onLanguageChange, t } from './i18n.js';
import type { Message } from './i18n.js';

/** Account data is imported/synchronized only after this version is accepted. */
export function initializeLegalAgreement(db: Firestore, accepted: (uid: string) => void): {
  check: (uid: string | null) => void;
  record: (uid: string) => Promise<void>;
} {
  const panel = document.querySelector<HTMLElement>('#account-agreement')!;
  const form = document.querySelector<HTMLFormElement>('#account-agreement-form')!;
  const checkbox = document.querySelector<HTMLInputElement>('#account-agreement-check')!;
  const submit = document.querySelector<HTMLButtonElement>('#account-agreement-submit')!;
  const retry = document.querySelector<HTMLButtonElement>('#account-agreement-retry')!;
  const note = document.querySelector<HTMLElement>('#account-agreement-note')!;
  let uid: string | null = null; let generation = 0; let waiting = false; let pending = false;
  let message: Message = 'legalChecking';
  const ref = (owner: string) => doc(db, 'players', owner, 'agreements', legalVersion);
  function render(): void {
    panel.hidden = !uid || !waiting;
    checkbox.disabled = pending; submit.disabled = pending;
    submit.textContent = t(pending ? 'emailWorking' : 'legalContinue');
    retry.hidden = message !== 'legalSaveError'; retry.disabled = pending;
    note.textContent = t(message); note.classList.toggle('error', message === 'legalSaveError');
    form.setAttribute('aria-busy', String(pending));
  }
  async function record(owner: string): Promise<void> {
    // Preserve the original server timestamp on retries and other devices.
    await runTransaction(db, async tx => {
      const previous = await tx.get(ref(owner));
      if (!previous.exists()) tx.set(ref(owner), { version: legalVersion, acceptedAt: serverTimestamp() });
    });
    if (uid !== owner) return;
    generation++; waiting = false; pending = false; render(); accepted(owner);
  }
  function check(owner: string | null): void {
    uid = owner; const version = ++generation; waiting = !!owner; pending = !!owner;
    checkbox.checked = false; message = 'legalChecking'; render();
    if (!owner) return;
    void getDoc(ref(owner)).then(result => {
      if (generation !== version || uid !== owner) return;
      pending = false;
      if (result.exists()) { waiting = false; render(); accepted(owner); }
      else { message = 'legalAccountNotice'; render(); document.querySelector<HTMLDialogElement>('#account-dialog')!.showModal(); }
    }).catch(() => { if (generation === version) { pending = false; message = 'legalSaveError'; render(); } });
  }
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!uid || pending || !checkbox.checked) return;
    const owner = uid; const version = generation; pending = true; render();
    void record(owner).catch(() => { if (generation === version) { pending = false; message = 'legalSaveError'; render(); } });
  });
  retry.addEventListener('click', () => check(uid));
  onLanguageChange(render);
  return { check, record };
}
