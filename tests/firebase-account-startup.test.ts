import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { Atlas } from '../src/shared/countries.js';

const auth = vi.hoisted(() => ({
  changed: null as ((user: User | null) => void) | null,
  accepted: null as ((uid: string) => void) | null,
  verified: null as ((user: User) => void) | null,
  checkAgreement: vi.fn(),
  // Keep cloud reads pending: these cases exercise local restoration before sync.
  getDocs: vi.fn(() => new Promise<never>(() => {})),
  transaction: vi.fn(),
}));
vi.mock('firebase/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: class { setCustomParameters() {} },
  onAuthStateChanged: (_auth: unknown, next: (user: User | null) => void) => { auth.changed = next; },
  signInWithPopup: vi.fn(), signOut: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(), getDocs: auth.getDocs, runTransaction: auth.transaction,
  collection: vi.fn(), doc: vi.fn(), limit: vi.fn(), onSnapshot: vi.fn(),
  orderBy: vi.fn(), query: vi.fn(), serverTimestamp: vi.fn(), where: vi.fn(),
}));
vi.mock('../src/client/legal-agreement.js', () => ({
  initializeLegalAgreement: (_db: unknown, accepted: (uid: string) => void) => {
    auth.accepted = accepted;
    return { check: auth.checkAgreement, record: vi.fn() };
  },
}));
vi.mock('../src/client/email-auth.js', () => ({ initializeEmailAuth: (_auth: unknown, _pending: unknown, _registered: unknown, _custom: unknown, verified: (user: User) => void) => {
  auth.verified = verified;
  return { render: vi.fn(), refreshVerification: vi.fn() };
} }));
vi.mock('../src/client/i18n.js', () => ({
  t: (key: string) => key,
  setTranslatedText: (node: { textContent: string }, key: string) => { node.textContent = key; },
  onLanguageChange: () => () => {},
}));

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()].at(index) ?? null; }
}
class ElementStub extends EventTarget {
  open = false;
  showModal() { this.open = true; }
  hidden = false; disabled = false; textContent = ''; title = '';
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  toggleAttribute(name: string, force: boolean) { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); }
}
const ids = new Set(['BRA', 'ARG', 'CHE']);
const atlas = { countries: [...ids].map(id => ({ id })) } as unknown as Atlas;

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  auth.changed = null; auth.accepted = null;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', new MemoryStorage());
  const elements = new Map<string, ElementStub>();
  vi.stubGlobal('document', { querySelector: (selector: string) => {
    if (!elements.has(selector)) elements.set(selector, new ElementStub());
    return elements.get(selector);
  } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function restore() {
  const storage = await import('../src/client/progress-storage.js');
  storage.progressSet('mundi-collection-v1', '["ARG"]', false, null);
  storage.progressSet('mundi-collection-v1', '["BRA"]', false, 'alice');
  storage.setProgressOwner('alice');
  const { createCollection } = await import('../src/client/collection.js');
  const collection = createCollection(atlas);
  const { startFirebaseAccount } = await import('../src/client/firebase-account.js');
  startFirebaseAccount({ projectId: 'demo-mundi', authDomain: 'demo-mundi.firebaseapp.com', apiKey: 'test-public-key', appId: 'test-app' }, ids);
  return { storage, collection };
}
const user = (uid: string, emailVerified = true) => ({ uid, email: `${uid}@example.test`, emailVerified }) as User;

describe('account restoration without progress flicker', () => {
  it('leaves an unverified email account pending without importing or synchronizing progress', async () => {
    const { storage, collection } = await restore();
    auth.changed!(user('alice', false));
    expect(storage.progressOwner()).toBeNull();
    expect([...collection.ids]).toEqual(['ARG']);
    expect(auth.checkAgreement).toHaveBeenLastCalledWith(null);
    auth.accepted!('alice');
    collection.add('CHE'); await vi.advanceTimersByTimeAsync(1000);
    expect(auth.getDocs).not.toHaveBeenCalled();
    expect(auth.transaction).not.toHaveBeenCalled();
  });

  it('requires verification and then agreement before activating the same pending account', async () => {
    const { storage, collection } = await restore();
    const pending = user('alice', false); auth.changed!(pending);
    auth.verified!(pending);
    expect(auth.checkAgreement).toHaveBeenLastCalledWith(null);
    Object.assign(pending, { emailVerified: true }); auth.verified!(pending);
    expect(auth.checkAgreement).toHaveBeenLastCalledWith('alice');
    expect(storage.progressOwner()).toBeNull();
    expect(auth.getDocs).not.toHaveBeenCalled();
    auth.accepted!('alice');
    expect(storage.progressOwner()).toBe('alice');
    expect(new Set(collection.ids)).toEqual(new Set(['ARG', 'BRA']));
    expect(auth.getDocs).toHaveBeenCalledTimes(1);
  });

  it('ignores verification finishing after another account has signed in', async () => {
    const { storage } = await restore();
    const pending = user('alice', false); auth.changed!(pending);
    auth.changed!(user('bob', false));
    Object.assign(pending, { emailVerified: true }); auth.verified!(pending);
    expect(auth.checkAgreement).toHaveBeenLastCalledWith(null);
    expect(storage.progressOwner()).toBeNull();
    expect(auth.getDocs).not.toHaveBeenCalled();
  });
  it('keeps the same account collection visible while its agreement is checked', async () => {
    const { storage, collection } = await restore();
    const redraw = vi.fn(); collection.subscribe(redraw);
    auth.changed!(user('alice'));
    expect(auth.checkAgreement).toHaveBeenCalledWith('alice');
    expect(storage.progressOwner()).toBe('alice');
    expect([...collection.ids]).toEqual(['BRA']);
    expect(redraw).not.toHaveBeenCalled();
  });

  it('keeps cloud writes gated until agreement acceptance despite retaining the local owner', async () => {
    const { collection } = await restore();
    auth.changed!(user('alice'));
    collection.add('CHE');
    await vi.advanceTimersByTimeAsync(1000);
    expect(auth.getDocs).not.toHaveBeenCalled();
    expect(auth.transaction).not.toHaveBeenCalled();
    auth.accepted!('alice');
    expect(auth.getDocs).toHaveBeenCalledTimes(1);
  });

  it('clears the previous account immediately when a different identity is restored', async () => {
    const { storage, collection } = await restore();
    auth.changed!(user('bob'));
    expect(storage.progressOwner()).toBeNull();
    expect([...collection.ids]).toEqual(['ARG']);
    expect(storage.progressGet('mundi-collection-v1', 'alice')).toBe('["BRA"]');
    expect(auth.getDocs).not.toHaveBeenCalled();
  });

  it('restores guest progress on confirmed sign-out without deleting the account cache', async () => {
    const { storage, collection } = await restore();
    auth.changed!(user('alice'));
    auth.changed!(null);
    expect(storage.progressOwner()).toBeNull();
    expect([...collection.ids]).toEqual(['ARG']);
    expect(storage.progressGet('mundi-collection-v1', 'alice')).toBe('["BRA"]');
  });
});
