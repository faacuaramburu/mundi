export type UsernameResult = 'saved' | 'taken' | 'invalid' | 'unavailable';
let identity: { uid: string | null; username: string | null; ready: boolean } = { uid: null, username: null, ready: false };
let saver: ((value: string) => Promise<UsernameResult>) | null = null;
const listeners = new Set<() => void>();
export function getAccountIdentity(): Readonly<typeof identity> { return identity; }
export function setAccountIdentity(uid: string | null, username: string | null, ready: boolean): void {
  if (identity.uid === uid && identity.username === username && identity.ready === ready) return;
  identity = { uid, username, ready }; for (const listener of listeners) listener();
}
export function onAccountIdentityChange(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setUsernameSaver(next: (value: string) => Promise<UsernameResult>): void { saver = next; }
export async function saveAccountUsername(value: string): Promise<UsernameResult> { return saver ? saver(value) : 'unavailable'; }
