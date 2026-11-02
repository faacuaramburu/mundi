import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

const sdk = vi.hoisted(() => ({ reload: vi.fn() }));
vi.mock('firebase/auth', () => ({ reload: sdk.reload }));
vi.mock('../src/client/i18n.js', () => ({ t: (key: string) => key }));
class ElementStub extends EventTarget {
  hidden = false; disabled = false; textContent = '';
  attributes = new Map<string, string>();
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  toggleAttribute(key: string, force: boolean) { if (force) this.attributes.set(key, ''); else this.attributes.delete(key); }
}
let elements: Map<string, ElementStub>;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); sdk.reload.mockReset().mockResolvedValue(undefined);
  elements = new Map(); vi.stubGlobal('window', new EventTarget());
  const document = new EventTarget();
  Object.assign(document, { hidden: false, querySelector: (key: string) => {
    if (!elements.has(key)) elements.set(key, new ElementStub()); return elements.get(key);
  } }); vi.stubGlobal('document', document);
});
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const { initializeEmailVerification } = await import('../src/client/email-verification.js');
  const user = { uid: 'alice', email: 'alice@example.test', emailVerified: false, getIdToken: vi.fn().mockResolvedValue('test-token') } as unknown as User;
  let current = user;
  const send = vi.fn().mockResolvedValue(undefined), verified = vi.fn(), notice = vi.fn();
  const controller = initializeEmailVerification({ send, verified, notice, setPending: pending => controller.render(current, pending) });
  controller.render(user, false);
  return { user, send, verified, notice, controller, switchTo: (next: User) => { current = next; controller.render(next, false); } };
}
describe('email ownership confirmation', () => {
  it('cannot activate an unverified address merely by clicking the confirmation button', async () => {
    const h = await setup(); await h.controller.refresh(false);
    expect(sdk.reload).toHaveBeenCalledWith(h.user);
    expect(h.user.getIdToken).not.toHaveBeenCalled();
    expect(h.verified).not.toHaveBeenCalled();
    expect(h.notice).toHaveBeenCalledWith('emailVerifyPending');
  });
  it('refreshes signed claims before notifying the account that verification succeeded', async () => {
    const h = await setup();
    sdk.reload.mockImplementation(async () => { Object.assign(h.user, { emailVerified: true }); });
    await h.controller.refresh(false);
    expect(h.user.getIdToken).toHaveBeenCalledWith(true);
    expect(h.verified).toHaveBeenCalledWith(h.user);
    expect(vi.mocked(h.user.getIdToken).mock.invocationCallOrder[0]!).toBeLessThan(h.verified.mock.invocationCallOrder[0]!);
  });
  it('does not activate after a failed token refresh', async () => {
    const h = await setup();
    sdk.reload.mockImplementation(async () => { Object.assign(h.user, { emailVerified: true }); });
    vi.mocked(h.user.getIdToken).mockRejectedValue(new Error('offline'));
    await h.controller.refresh(false);
    expect(h.verified).not.toHaveBeenCalled();
    expect(h.notice).toHaveBeenCalledWith('emailNetworkError', true);
    expect(elements.get('#account-verification')!.hidden).toBe(false);
    vi.mocked(h.user.getIdToken).mockResolvedValue('fresh-token');
    await h.controller.refresh(false);
    expect(h.verified).toHaveBeenCalledWith(h.user);
  });
  it('ignores a stale verification response after the identity changes', async () => {
    const h = await setup(); let finish!: () => void;
    sdk.reload.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = h.controller.refresh(false);
    h.switchTo({ ...h.user, uid: 'bob' } as User);
    Object.assign(h.user, { emailVerified: true }); finish(); await pending;
    expect(h.user.getIdToken).not.toHaveBeenCalled(); expect(h.verified).not.toHaveBeenCalled();
  });
  it('sends a verification link once and enforces a local resend cooldown', async () => {
    const h = await setup();
    elements.get('#account-verify-resend')!.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(h.notice).toHaveBeenCalledWith('emailVerificationSent'));
    await vi.waitFor(() => expect(elements.get('#account-verify-resend')!.disabled).toBe(false));
    elements.get('#account-verify-resend')!.dispatchEvent(new Event('click'));
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.notice).toHaveBeenLastCalledWith('emailVerifyWait');
  });
});
