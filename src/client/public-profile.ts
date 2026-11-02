import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { normalizeUsername } from '../shared/username.js';
import { publicCountries, publicProfilePath } from '../shared/public-profile.js';
import { onLanguageChange, t } from './i18n.js';
import type { Message } from './i18n.js';

/** Public snapshots contain country IDs only; private history and credentials stay private. */
export async function publishPublicIndex(db: Firestore, uid: string, ids: ReadonlySet<string>, visibility?: boolean): Promise<void> {
  await runTransaction(db, async tx => {
    const playerRef = doc(db, 'players', uid), publicRef = doc(db, 'publicProfiles', uid);
    const player = await tx.get(playerRef);
    const collection = await tx.get(doc(db, 'players', uid, 'progress', 'collection'));
    const previous = await tx.get(publicRef);
    const username = normalizeUsername(player.data()?.username);
    if (!player.exists() || !username) throw new Error('Choose a username first');
    const visible = visibility ?? (player.data()?.publicIndex === true);
    if (visibility !== undefined) tx.set(playerRef, { publicIndex: visible, lastSeenAt: serverTimestamp() }, { merge: true });
    if (!visible) { if (previous.exists()) tx.delete(publicRef); return; }
    const discoveries: unknown = collection.data()?.discoveries;
    const countries = publicCountries(discoveries && typeof discoveries === 'object' && !Array.isArray(discoveries) ? Object.keys(discoveries) : [], ids);
    if (previous.data()?.username === username && JSON.stringify(previous.data()?.countries) === JSON.stringify(countries)) return;
    tx.set(publicRef, { username, countries, updatedAt: serverTimestamp() });
  });
}

export function initializePublicSharing(db: Firestore, ids: ReadonlySet<string>, activeUid: () => string | null) {
  const section = document.querySelector<HTMLElement>('#account-public-profile')!;
  const toggle = document.querySelector<HTMLInputElement>('#account-public-index')!;
  const note = document.querySelector<HTMLElement>('#account-public-status')!;
  const link = document.querySelector<HTMLAnchorElement>('#account-public-link')!;
  const copy = document.querySelector<HTMLButtonElement>('#account-public-copy')!;
  let state: { uid: string; username: string; visible: boolean } | null = null;
  let saving = false; let generation = 0; let timer = 0; let message: Message | null = null;
  function render(): void {
    section.hidden = !state || activeUid() !== state.uid;
    toggle.checked = state?.visible === true; toggle.disabled = saving;
    link.hidden = copy.hidden = !state?.visible || saving;
    if (state) link.href = publicProfilePath(state.username)!;
    note.textContent = t(message ?? (state?.visible ? 'publicIndexHint' : 'privateIndexHint'));
    note.classList.toggle('error', message === 'publicIndexError');
  }
  function queue(): void {
    clearTimeout(timer);
    if (!state?.visible || activeUid() !== state.uid) return;
    const uid = state.uid, version = generation;
    timer = window.setTimeout(() => {
      void publishPublicIndex(db, uid, ids).catch(() => {
        if (generation === version && activeUid() === uid) { message = 'publicIndexError'; render(); }
      });
    }, 400);
  }
  toggle.addEventListener('change', () => {
    if (!state || saving || activeUid() !== state.uid) return;
    const current = state, previous = current.visible, desired = toggle.checked, version = generation;
    current.visible = desired; saving = true; message = 'publicIndexSaving'; render();
    void publishPublicIndex(db, current.uid, ids, desired).then(() => {
      if (generation === version && activeUid() === current.uid) { if (state?.uid === current.uid) state.visible = desired; message = null; }
    }).catch(() => {
      if (generation === version && activeUid() === current.uid) { if (state?.uid === current.uid) state.visible = previous; message = 'publicIndexError'; }
    }).finally(() => { if (generation === version) { saving = false; render(); } });
  });
  copy.addEventListener('click', () => {
    if (!state?.visible || saving) return;
    const uid = state.uid, version = generation;
    void navigator.clipboard.writeText(new URL(publicProfilePath(state.username)!, location.origin).href).then(() => {
      if (generation === version && activeUid() === uid) { message = 'copied'; render(); }
    }).catch(() => { if (generation === version) { message = 'publicIndexCopyError'; render(); } });
  });
  window.addEventListener('online', queue); onLanguageChange(render); render();
  return {
    queue,
    reset(): void { generation++; clearTimeout(timer); state = null; saving = false; message = null; render(); },
    update(uid: string, username: string | null, visible: boolean): void {
      if (activeUid() !== uid) return;
      state = username ? { uid, username, visible } : null; render(); queue();
    },
  };
}
