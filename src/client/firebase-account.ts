import { initializeApp } from 'firebase/app';
import { getAdditionalUserInfo, getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { mergeDaily, mergeDiscoveries, normalizeDaily, parseDiscoveries } from '../shared/account.js';
import type { FirebaseWebConfig } from '../shared/account.js';
import { dayLength } from '../shared/daily.js';
import { normalizePlayerName } from '../shared/profile.js';
import type { Message } from './i18n.js';
import { onLanguageChange, setTranslatedText, t } from './i18n.js';
import { importGuestProgress, readAccountProgress, storeAccountProgress, validDailyDay } from './account-progress.js';
import { progressOwner, setProgressOwner } from './progress-storage.js';
import { normalizeUsername } from '../shared/username.js';
import { setAccountIdentity, setUsernameSaver } from './account-identity.js';
import { claimUsername } from './username-account.js';
import { initializeEmailAuth } from './email-auth.js';
import { initializeLegalAgreement } from './legal-agreement.js';
import { initializePublicSharing } from './public-profile.js';

export function startFirebaseAccount(config: FirebaseWebConfig, ids: ReadonlySet<string>, customEmail = false): void {
  const app = initializeApp(config); const auth = getAuth(app); const db = getFirestore(app);
  const button = document.querySelector<HTMLButtonElement>('#account-toggle')!;
  const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  const login = document.querySelector<HTMLButtonElement>('#account-login')!;
  const logout = document.querySelector<HTMLButtonElement>('#account-logout')!;
  const retry = document.querySelector<HTMLButtonElement>('#account-retry')!;
  let user: User | null = null; let status: Message = 'accountLoading'; let generation = 0;
  let pendingAuth = false; let timer = 0; let running: number | null = null; let watching = false;
  const dirty = new Set<string>(); let subscriptions: Unsubscribe[] = [];
  const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  let activated = false;
  let publicIndexDefault = false;
  const sharing = initializePublicSharing(db, ids, () => activated ? user?.uid ?? null : null);
  const agreement = initializeLegalAgreement(db, (uid, publicIndex = false) => {
    if (user?.uid !== uid || !user.emailVerified || activated) return;
    activated = true;
    publicIndexDefault = publicIndex;
    try { importGuestProgress(uid, ids); }
    catch { /* The guest copy remains intact if durable migration is unavailable. */ }
    setProgressOwner(uid); status = 'accountSyncing'; render(); dirty.add('all'); void flush();
  });
  const emailUI = initializeEmailAuth(auth, value => { pendingAuth = value; render(); }, (uid, visible) => agreement.record(uid, visible), customEmail, next => {
    if (user !== next || !next.emailVerified) return;
    setAccountIdentity(next.uid, null, false);
    status = 'legalAccountNotice'; render(); agreement.check(next.uid);
  });
  setUsernameSaver(async value => {
    const uid = user?.uid; const version = generation;
    if (!activated || !uid || progressOwner() !== uid) return 'unavailable';
    const result = await claimUsername(db, uid, value);
    return generation === version && user?.uid === uid ? result : 'unavailable';
  });
  function render(): void {
    dialog.toggleAttribute('data-account-loading', status === 'accountLoading');
    dialog.setAttribute('aria-busy', String(status === 'accountLoading'));
    const accountLabel = t(user ? 'accountTitle' : 'accountLogin');
    const label = document.querySelector<HTMLElement>('#account-label')!;
    setTranslatedText(label, user ? 'accountTitle' : 'accountLogin');
    button.setAttribute('aria-label', accountLabel); button.title = accountLabel;
    document.querySelector('#account-title')!.textContent = t(user ? 'accountTitle' : 'accountSaveTitle');
    document.querySelector('#account-identity')!.textContent = user?.email ?? '';
    setTranslatedText(document.querySelector('#account-status')!, status);
    dialog.toggleAttribute('data-signed-in', !!user);
    login.hidden = !!user; logout.hidden = !user;
    login.disabled = pendingAuth; logout.disabled = pendingAuth;
    retry.hidden = !activated || status !== 'accountSyncError';
    document.querySelector('#account-guest')!.textContent = t(activated ? 'accountClose' : 'accountGuest');
    document.querySelector<HTMLButtonElement>('#account-guest')!.hidden = activated;
    document.querySelector('#storage-note')?.setAttribute('data-i18n', activated ? 'accountLocalAndCloud' : 'localProgress');
    emailUI.render(user, pendingAuth);
    if (user && !activated) document.querySelector<HTMLElement>('#account-status')!.hidden = true;
  }
  function queue(key: string): void {
    if (!activated || !user || progressOwner() !== user.uid) return;
    dirty.add(key); status = 'accountSyncing'; render(); clearTimeout(timer);
    timer = window.setTimeout(() => { void flush(); }, 600);
  }
  function watch(uid: string, version: number): void {
    if (watching) return; watching = true;
    const active = () => generation === version && user?.uid === uid && progressOwner() === uid;
    const failed = () => { if (active()) { status = 'accountSyncError'; render(); } };
    let prompted = false;
    subscriptions.push(onSnapshot(doc(db, 'players', uid), { includeMetadataChanges: true }, snapshot => {
      if (!active() || snapshot.metadata.fromCache) return;
      const username = normalizeUsername(snapshot.data()?.username);
      sharing.update(uid, username, snapshot.data()?.publicIndex === true);
      if (username) {
        const local = readAccountProgress(uid, ids);
        const date: unknown = snapshot.data()?.nameUpdatedAt;
        try { storeAccountProgress(uid, { ...local, name: username, nameUpdatedAt: typeof date === 'number' ? date : 0 }, false); } catch { failed(); }
      }
      setAccountIdentity(uid, username, true);
      if (!prompted && !username) { prompted = true; if (!dialog.open) dialog.showModal(); }
    }, failed));
    subscriptions.push(onSnapshot(doc(db, 'players', uid, 'progress', 'collection'), snapshot => {
      if (!active() || !snapshot.exists()) return;
      const local = readAccountProgress(uid, ids);
      const remote = parseDiscoveries(snapshot.data().discoveries, ids);
      const merged = mergeDiscoveries(local.discoveries, remote);
      if (JSON.stringify(merged) !== JSON.stringify(local.discoveries)) {
        try { storeAccountProgress(uid, { ...local, discoveries: merged }); } catch { failed(); }
      }
      if (JSON.stringify(merged) !== JSON.stringify(remote)) queue('collection');
      sharing.queue();
    }, failed));
    const minimum = new Date(Date.now() - 366 * dayLength).toISOString().slice(0, 10);
    subscriptions.push(onSnapshot(query(collection(db, 'players', uid, 'daily'), where('day', '>=', minimum), orderBy('day', 'desc'), limit(367)), snapshot => {
      if (!active()) return;
      const local = readAccountProgress(uid, ids); let changed = false;
      for (const change of snapshot.docChanges()) {
        const day = change.doc.id; if (change.type === 'removed' || !validDailyDay(day)) continue;
        const remote = normalizeDaily(change.doc.data(), day, ids);
        const merged = mergeDaily(local.daily.get(day) ?? { day, guesses: [], targetId: null, won: false }, remote);
        if (JSON.stringify(local.daily.get(day)) !== JSON.stringify(merged)) { local.daily.set(day, merged); changed = true; }
        if (JSON.stringify(remote) !== JSON.stringify(merged)) queue(`daily:${day}`);
      }
      if (changed) try { storeAccountProgress(uid, local); } catch { failed(); }
    }, failed));
  }
  async function flush(): Promise<void> {
    if (!activated || !user || progressOwner() !== user.uid || running === generation || !dirty.size) return;
    const uid = user.uid; const version = generation;
    const active = () => generation === version && user?.uid === uid && progressOwner() === uid;
    running = version; const keys = new Set(dirty); dirty.clear(); status = 'accountSyncing'; render();
    try {
      if (keys.has('all')) {
        const min = new Date(Date.now() - 366 * dayLength).toISOString().slice(0, 10);
        const remote = await getDocs(query(collection(db, 'players', uid, 'daily'), where('day', '>=', min), orderBy('day', 'desc'), limit(367)));
        if (!active()) return;
        const local = readAccountProgress(uid, ids);
        for (const entry of remote.docs) {
          if (!validDailyDay(entry.id)) continue;
          const day = entry.id;
          local.daily.set(day, mergeDaily(local.daily.get(day) ?? { day, guesses: [], targetId: null, won: false }, normalizeDaily(entry.data(), day, ids)));
        }
        storeAccountProgress(uid, local);
        for (const day of local.daily.keys()) keys.add(`daily:${day}`);
        keys.add('collection'); keys.add('profile');
      }
      if (!active()) return;
      if (keys.has('collection')) {
        const ref = doc(db, 'players', uid, 'progress', 'collection');
        const merged = await runTransaction(db, async tx => {
          const remote = await tx.get(ref); if (!active()) throw new Error('Account changed');
          const local = readAccountProgress(uid, ids).discoveries;
          const previous = parseDiscoveries(remote.data()?.discoveries, ids);
          const next = mergeDiscoveries(previous, local);
          if (!remote.exists() || JSON.stringify(previous) !== JSON.stringify(next)) tx.set(ref, { discoveries: next, updatedAt: serverTimestamp() });
          return next;
        });
        if (!active()) return;
        const local = readAccountProgress(uid, ids); storeAccountProgress(uid, { ...local, discoveries: mergeDiscoveries(local.discoveries, merged) });
      }
      for (const key of keys) {
        if (!active()) return;
        if (!key.startsWith('daily:')) continue;
        const day = key.slice(6); if (!validDailyDay(day)) continue;
        const ref = doc(db, 'players', uid, 'daily', day);
        const merged = await runTransaction(db, async tx => {
          const remote = await tx.get(ref); if (!active()) throw new Error('Account changed');
          const previous = normalizeDaily(remote.data(), day, ids);
          const local = readAccountProgress(uid, ids).daily.get(day) ?? previous;
          const next = mergeDaily(previous, local);
          if (!remote.exists() || JSON.stringify(previous) !== JSON.stringify(next)) tx.set(ref, { ...next, updatedAt: serverTimestamp() });
          return next;
        });
        if (!active()) return;
        const local = readAccountProgress(uid, ids);
        local.daily.set(day, mergeDaily(local.daily.get(day) ?? merged, merged)); storeAccountProgress(uid, local);
      }
      if (!active()) return;
      if (keys.has('profile')) {
        const ref = doc(db, 'players', uid);
        const merged = await runTransaction(db, async tx => {
          const remote = await tx.get(ref); if (!active()) throw new Error('Account changed');
          const local = readAccountProgress(uid, ids);
          const username = normalizeUsername(remote.data()?.username);
          const remoteName = username ?? normalizePlayerName(typeof remote.data()?.name === 'string' ? remote.data()!.name as string : '') ?? '';
          const remoteTime: unknown = remote.data()?.nameUpdatedAt;
          const timestamp = typeof remoteTime === 'number' && remoteTime >= 0 && remoteTime <= Date.now() ? remoteTime : 0;
          const useLocal = !username && (local.nameUpdatedAt > timestamp || (!remoteName && !!local.name));
          const next = { name: useLocal ? local.name : remoteName, nameUpdatedAt: useLocal ? local.nameUpdatedAt : timestamp };
          tx.set(ref, { ...next, ...(!remote.exists() ? { publicIndex: publicIndexDefault } : {}), createdAt: remote.data()?.createdAt ?? serverTimestamp(), lastSeenAt: serverTimestamp() }, { merge: true });
          return next;
        });
        if (!active()) return;
        const local = readAccountProgress(uid, ids);
        if (merged.nameUpdatedAt >= local.nameUpdatedAt || !local.name) storeAccountProgress(uid, { ...local, ...merged });
      }
      if (active()) { status = dirty.size ? 'accountSyncing' : 'accountSaved'; render(); watch(uid, version); sharing.queue(); }
    } catch {
      if (active()) { for (const key of keys) dirty.add(key); status = 'accountSyncError'; render(); }
    } finally {
      if (running === version) running = null;
      if (active() && dirty.size) { clearTimeout(timer); timer = window.setTimeout(() => { void flush(); }, status === 'accountSyncError' ? 30000 : 600); }
    }
  }
  window.addEventListener('mundi-progress-write', event => {
    const detail = (event as CustomEvent<{ key: string; owner: string | null }>).detail;
    if (!user || detail.owner !== user.uid) return;
    if (detail.key.startsWith('mundi-daily-v1:')) queue(`daily:${detail.key.slice('mundi-daily-v1:'.length)}`);
    else if (detail.key.startsWith('mundi-player-name')) queue('profile');
    else if (detail.key.startsWith('mundi-collection')) queue('collection');
  });
  window.addEventListener('online', () => { if (dirty.size) void flush(); });
  retry.addEventListener('click', () => { dirty.add('all'); void flush(); });
  login.addEventListener('click', () => {
    if (pendingAuth) return;
    pendingAuth = true; render();
    void signInWithPopup(auth, provider).then(result => {
      if (getAdditionalUserInfo(result)?.isNewUser) agreement.newAccount(result.user.uid);
    }).catch(error => {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      status = code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' ? 'accountGuestHint' : code === 'auth/popup-blocked' ? 'accountPopupBlocked' : 'accountLoginError';
    }).finally(() => { pendingAuth = false; render(); });
  });
  logout.addEventListener('click', () => {
    if (pendingAuth) return; pendingAuth = true; render();
    void signOut(auth).catch(() => { status = 'accountLoginError'; }).finally(() => { pendingAuth = false; render(); });
  });
  onAuthStateChanged(auth, next => {
    sharing.reset(); publicIndexDefault = false;
    generation++; activated = false; clearTimeout(timer); for (const stop of subscriptions) stop(); subscriptions = []; watching = false; dirty.clear();
    user = next;
    setAccountIdentity(next?.emailVerified ? next.uid : null, null, false);
    // Restoring the same account keeps its local colors while consent/cloud checks run.
    // Switching identities still clears the previous account immediately.
    if (!next?.emailVerified || progressOwner() !== next.uid) setProgressOwner(null);
    status = next ? 'legalAccountNotice' : 'accountGuestHint'; render();
    agreement.check(next?.emailVerified ? next.uid : null);
    if (next && !next.emailVerified) {
      if (!dialog.open) dialog.showModal();
      void emailUI.refreshVerification();
    }
  }, () => { status = 'accountLoginError'; render(); });
  onLanguageChange(render); render();
}
