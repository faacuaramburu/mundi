import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
const store = vi.hoisted(() => ({ prior: undefined as undefined | { publicIndex?: boolean }, writes: [] as unknown[] }));
vi.mock('firebase/firestore', () => ({
  doc: () => 'agreement', serverTimestamp: () => 'SERVER_TIMESTAMP',
  getDoc: async () => ({ exists: () => !!store.prior, data: () => store.prior }),
  runTransaction: async (_db: unknown, callback: (tx: unknown) => unknown) => callback({
    get: async () => ({ exists: () => !!store.prior, data: () => store.prior }),
    set: (_ref: unknown, data: unknown) => store.writes.push(data),
  }),
}));
vi.mock('../src/client/i18n.js', () => ({ t: (key: string) => key, onLanguageChange: () => {} }));
import { initializeLegalAgreement } from '../src/client/legal-agreement.js';
class Element extends EventTarget {
  checked = false; disabled = false; hidden = false; textContent = '';
  classList = { toggle: vi.fn() }; setAttribute() {} showModal() {}
}
let elements: Map<string, Element>;
beforeEach(() => {
  elements = new Map(); store.prior = undefined; store.writes.length = 0;
  vi.stubGlobal('document', { querySelector: (key: string) => {
    if (!elements.has(key)) elements.set(key, new Element()); return elements.get(key);
  } });
});
afterEach(() => vi.unstubAllGlobals());
it('defaults an existing account with no agreement to public', async () => {
  const accepted = vi.fn(); const flow = initializeLegalAgreement({} as Firestore, accepted);
  flow.check('old-player'); await Promise.resolve();
  expect(elements.get('#account-agreement-public-index')!.checked).toBe(true);
  await flow.record('old-player'); expect(accepted).toHaveBeenCalledWith('old-player', true);
});
it('offers public sharing for a new Google account, while allowing opt-out', async () => {
  const accepted = vi.fn(); const flow = initializeLegalAgreement({} as Firestore, accepted);
  flow.check('new-player'); await Promise.resolve();
  const sharing = elements.get('#account-agreement-public-index')!;
  expect(sharing.checked).toBe(true);
  sharing.checked = false; sharing.dispatchEvent(new Event('change'));
  expect(sharing.checked).toBe(false);
  await flow.record('new-player', sharing.checked);
  expect(accepted).toHaveBeenCalledWith('new-player', false);
});
it('retains the original registration choice across verification and retries', async () => {
  store.prior = { publicIndex: true };
  const accepted = vi.fn(); const flow = initializeLegalAgreement({} as Firestore, accepted);
  flow.check('new-player'); await Promise.resolve();
  await flow.record('new-player', false);
  expect(accepted).toHaveBeenLastCalledWith('new-player', true);
  expect(store.writes).toEqual([]);
});
it('uses the public default for old agreements without a preference and preserves explicit opt-outs', async () => {
  const accepted = vi.fn(); const flow = initializeLegalAgreement({} as Firestore, accepted);
  store.prior = {}; flow.check('old-player'); await Promise.resolve();
  expect(accepted).toHaveBeenLastCalledWith('old-player', true);
  store.prior = { publicIndex: false }; flow.check('private-player'); await Promise.resolve();
  expect(accepted).toHaveBeenLastCalledWith('private-player', false);
});
