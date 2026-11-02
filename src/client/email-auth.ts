import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import { getLanguage, t } from './i18n.js';
import type { Message } from './i18n.js';
import { initializeEmailVerification } from './email-verification.js';

/** Firebase owns credentials; passwords stay only in the current form/request. */
export function initializeEmailAuth(auth: Auth, setPending: (value: boolean) => void, registered: (uid: string) => Promise<void>, customEmail = false, verified: (user: User) => void = () => {}) {
  const find = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
  const panel = find('account-email-panel');
  const form = find<HTMLFormElement>('account-email-form');
  const email = find<HTMLInputElement>('account-email');
  const password = find<HTMLInputElement>('account-password');
  const submit = find<HTMLButtonElement>('account-email-submit');
  const change = find<HTMLButtonElement>('account-email-switch');
  const signin = find<HTMLButtonElement>('account-email-signin-tab');
  const back = find<HTMLButtonElement>('account-email-back');
  const tabs = [signin, change];
  const forgot = find<HTMLButtonElement>('account-forgot-password');
  const show = find<HTMLButtonElement>('account-password-show');
  const manage = find<HTMLButtonElement>('account-password-reset');
  const feedback = find('account-email-feedback');
  const agreement = find<HTMLInputElement>('account-signup-agree');
  let mode: 'signin' | 'signup' | 'reset' = 'signin';
  let user: User | null = null; let pending = false;
  let message: Message | null = null; let error = false;
  const verification = initializeEmailVerification({ send: sendVerification, verified, setPending, notice });

  function render(next: User | null, busy: boolean): void {
    if (next?.uid !== user?.uid) { password.value = ''; password.type = 'password'; mode = 'signin'; message = null; }
    user = next; pending = busy;
    panel.hidden = !!user;
    find('account-status').hidden = !user && mode === 'reset';
    find('account-auth-methods').hidden = !!user || mode === 'reset';
    find('account-reset-hint').hidden = mode !== 'reset';
    back.hidden = mode !== 'reset';
    panel.setAttribute('role', mode === 'reset' ? 'region' : 'tabpanel');
    panel.setAttribute('aria-labelledby', mode === 'reset' ? 'account-title' : mode === 'signin' ? signin.id : change.id);
    for (const tab of tabs) {
      const selected = tab === (mode === 'signup' ? change : signin);
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    manage.hidden = !user?.email; manage.disabled = pending;
    find('account-password-field').hidden = mode === 'reset';
    password.required = mode !== 'reset'; password.disabled = pending || mode === 'reset';
    password.minLength = mode === 'signup' ? 8 : 0;
    password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    find('account-password-hint').hidden = mode !== 'signup';
    find('account-signup-legal').hidden = mode !== 'signup';
    agreement.required = mode === 'signup' && !user; agreement.disabled = pending || mode !== 'signup' || !!user;
    show.setAttribute('aria-label', t(password.type === 'password' ? 'passwordShow' : 'passwordHide'));
    show.setAttribute('aria-pressed', String(password.type === 'text'));
    for (const control of [email, submit, change, signin, back, forgot, show]) control.disabled = pending;
    form.setAttribute('aria-busy', String(pending));
    submit.textContent = t(pending ? 'emailWorking' : mode === 'signup' ? 'emailCreate' : mode === 'reset' ? 'passwordSendLink' : 'accountLogin');
    forgot.hidden = mode !== 'signin';
    feedback.hidden = !message; feedback.textContent = message ? t(message) : '';
    feedback.classList.toggle('error', error);
    if (!user) find('account-title').textContent = t(mode === 'signup' ? 'emailCreateTitle' : mode === 'reset' ? 'passwordResetTitle' : 'accountLogin');
    verification.render(user, pending);
  }
  function notice(value: Message, failed = false): void { message = value; error = failed; render(user, pending); }
  function authError(cause: unknown): Message {
    const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/user-disabled'].includes(code)) return 'emailInvalidCredentials';
    if (code === 'auth/email-already-in-use' || code === 'auth/account-exists-with-different-credential') return 'emailAccountExists';
    if (code === 'auth/invalid-email') return 'emailInvalid';
    if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') return 'passwordWeak';
    if (code === 'auth/too-many-requests') return 'emailTooManyRequests';
    if (code === 'auth/network-request-failed') return 'emailNetworkError';
    if (code === 'auth/operation-not-allowed') return 'emailUnavailable';
    return 'accountLoginError';
  }
  async function run(action: () => Promise<void>): Promise<void> {
    if (pending) return;
    message = null; setPending(true);
    auth.languageCode = getLanguage();
    try { await action(); } catch (cause) { notice(authError(cause), true); }
    finally { setPending(false); }
  }
  async function reset(address: string, knownAccount = false): Promise<void> {
    try {
      if (customEmail) await requestAccountEmail('resetPassword', address, knownAccount ? user ?? undefined : undefined);
      else await sendPasswordResetEmail(auth, address);
    }
    catch (cause) {
      if (knownAccount || !(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'auth/user-not-found')) throw cause;
    }
    notice(knownAccount ? 'passwordResetSentAccount' : 'passwordResetSent');
  }
  async function requestAccountEmail(mode: 'verifyEmail' | 'resetPassword', address: string, account?: User): Promise<void> {
    let response: Response;
    try {
      const token = account ? await account.getIdToken() : undefined;
      response = await fetch('/api/account/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ mode, email: address, language: getLanguage() }), signal: AbortSignal.timeout(15000),
      });
    } catch { throw { code: 'auth/network-request-failed' }; }
    if (response.status === 429) throw { code: 'auth/too-many-requests' };
    if (response.status === 400) throw { code: 'auth/invalid-email' };
    if (!response.ok) throw { code: 'auth/network-request-failed' };
  }
  async function sendVerification(account: User): Promise<void> {
    auth.languageCode = getLanguage();
    if (customEmail) await requestAccountEmail('verifyEmail', account.email ?? '', account);
    else await sendEmailVerification(account);
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const address = email.value.trim(); const value = password.value; const action = mode;
    void run(async () => {
      if (action === 'reset') { await reset(address); return; }
      if (action === 'signup') {
        if (!agreement.checked) { notice('legalRequired', true); return; }
        const result = await createUserWithEmailAndPassword(auth, address, value);
        password.value = '';
        try { await registered(result.user.uid); }
        catch { /* The agreement can be recorded again after email verification. */ }
        try {
          await sendVerification(result.user); verification.markSent(result.user);
          notice('emailVerificationSent');
        }
        catch { notice('emailVerificationFailed', true); }
      } else { await signInWithEmailAndPassword(auth, address, value); password.value = ''; }
    });
  });
  function switchMode(next: typeof mode, focusEmail = true): void {
    if (pending || mode === next) return;
    mode = next; message = null; agreement.checked = false; password.value = ''; password.type = 'password'; render(user, pending);
    if (focusEmail) email.focus();
  }
  signin.addEventListener('click', () => switchMode('signin', false));
  change.addEventListener('click', () => switchMode('signup', false));
  back.addEventListener('click', () => switchMode('signin'));
  find('account-auth-tabs').addEventListener('keydown', event => {
    if (pending || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? signin : event.key === 'End' ? change : mode === 'signin' ? change : signin;
    switchMode(target === signin ? 'signin' : 'signup', false); target.focus();
  });
  forgot.addEventListener('click', () => switchMode('reset'));
  show.addEventListener('click', () => { password.type = password.type === 'password' ? 'text' : 'password'; render(user, pending); });
  manage.addEventListener('click', () => { if (user?.email) { const address = user.email; void run(() => reset(address, true)); } });
  find<HTMLDialogElement>('account-dialog').addEventListener('close', () => { agreement.checked = false; password.value = ''; password.type = 'password'; message = null; render(user, pending); });
  return { render, refreshVerification: verification.refresh };
}
