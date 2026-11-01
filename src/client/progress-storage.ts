// Legacy keys remain the guest profile. Each Firebase UID has a separate local cache.
const ownerKey = 'mundi-progress-owner-v1';
const memory = new Map<string, string>();
let owner: string | null = null;
try { owner = localStorage.getItem(ownerKey); } catch { /* Guest mode can run in memory. */ }
export function progressOwner(): string | null { return owner; }
const scopedKey = (key: string, scope = owner) => scope ? `mundi-user:${encodeURIComponent(scope)}:${key}` : key;
export function progressGet(key: string, scope = owner): string | null {
  const scoped = scopedKey(key, scope);
  try { return memory.get(scoped) ?? localStorage.getItem(scoped) ?? null; }
  catch { return memory.get(scoped) ?? null; }
}
export function progressSet(key: string, value: string, notify = true, scope = owner): void {
  const scoped = scopedKey(key, scope);
  try { localStorage.setItem(scoped, value); memory.delete(scoped); }
  catch (error) { memory.set(scoped, value); throw error; }
  finally { if (notify) window.dispatchEvent(new CustomEvent('mundi-progress-write', { detail: { key, owner: scope } })); }
}
export function progressRemove(key: string, scope = owner): void {
  const scoped = scopedKey(key, scope); memory.delete(scoped);
  try { localStorage.removeItem(scoped); } catch { /* Best effort; merges are idempotent. */ }
}
export function progressKeys(scope = owner): string[] {
  const keys = new Set(memory.keys());
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key) keys.add(key); } }
  catch { /* Use the in-memory progress. */ }
  const prefix = scope ? `mundi-user:${encodeURIComponent(scope)}:` : '';
  return [...keys].filter(key => prefix ? key.startsWith(prefix) : !key.startsWith('mundi-user:'))
    .map(key => key.slice(prefix.length)).filter(key => key.startsWith('mundi-daily-v1:'));
}
export function restoreProgress(): void { window.dispatchEvent(new Event('mundi-progress-restored')); }
export function setProgressOwner(uid: string | null): void {
  if (owner === uid) return;
  owner = uid;
  try { if (uid) localStorage.setItem(ownerKey, uid); else localStorage.removeItem(ownerKey); } catch { /* Current tab still switches. */ }
  restoreProgress();
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key) memory.delete(event.key); else memory.clear();
  if (event.key === ownerKey || event.key === null) {
    owner = event.key === null ? null : event.newValue;
    restoreProgress();
  } else if (event.key?.startsWith('mundi-user:')) restoreProgress();
});

