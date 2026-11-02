import { reload } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { t } from './i18n.js';
import type { Message } from './i18n.js';

export function initializeEmailVerification(options: {
  send: (user: User) => Promise<void>;
  verified: (user: User) => void;
  setPending: (pending: boolean) => void;
  notice: (message: Message, failed?: boolean) => void;
}) {
  const panel = document.querySelector<HTMLElement>('#account-verification')!;
  const check = document.querySelector<HTMLButtonElement>('#account-verify-check')!;
  const resend = document.querySelector<HTMLButtonElement>('#account-verify-resend')!;
  let user: User | null = null; let busy = false;
  let awaiting = false;
  let sentTo: string | null = null; let sentAt = 0;
  function markSent(account: User): void { sentTo = account.uid; sentAt = Date.now(); }
  async function refresh(silent = true): Promise<void> {
    const account = user;
    if (!account || !awaiting || busy) return;
    options.setPending(true);
    try {
      await reload(account);
      if (user !== account) return;
      if (!account.emailVerified) { if (!silent) options.notice('emailVerifyPending'); return; }
      await account.getIdToken(true);
      if (user === account) { awaiting = false; options.verified(account); }
    } catch { if (user === account && !silent) options.notice('emailNetworkError', true); }
    finally { options.setPending(false); }
  }
  resend.addEventListener('click', () => {
    const account = user;
    if (!account || !awaiting || busy) return;
    if (account.emailVerified) { void refresh(false); return; }
    if (sentTo === account.uid && Date.now() - sentAt < 60000) { options.notice('emailVerifyWait'); return; }
    options.setPending(true);
    void options.send(account).then(() => {
      if (user !== account) return;
      markSent(account); options.notice('emailVerificationSent');
    }).catch(() => { if (user === account) options.notice('emailVerificationFailed', true); })
      .finally(() => options.setPending(false));
  });
  check.addEventListener('click', () => { void refresh(false); });
  window.addEventListener('focus', () => { void refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  return {
    markSent, refresh,
    render(next: User | null, pending: boolean): void {
      if (user !== next) awaiting = !!next && !next.emailVerified;
      user = next; busy = pending;
      const required = !!user && awaiting;
      panel.hidden = !required;
      panel.setAttribute('aria-busy', String(pending));
      check.disabled = resend.disabled = pending;
      check.textContent = t(pending ? 'emailWorking' : 'emailVerifyCheck');
      document.querySelector('#account-dialog')!.toggleAttribute('data-email-unverified', required);
      if (required) document.querySelector('#account-title')!.textContent = t('emailVerifyTitle');
    },
  };
}
