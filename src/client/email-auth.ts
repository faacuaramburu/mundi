import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import { getLanguage, t } from './i18n.js';
import type { Message } from './i18n.js';

/** Firebase owns credentials; passwords stay only in the current form/request. */
export function initializeEmailAuth(auth: Auth, setPending: (value: boolean) => void): { render: (user: User | null, pending: boolean) => void } {
  const find = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
  const panel = find('account-email-panel');
  const form = find<HTMLFormElement>('account-email-form');
  const email = find<HTMLInputElement>('account-email');
  const password = find<HTMLInputElement>('account-password');
  const submit = find<HTMLButtonElement>('account-email-submit');
  const change = find<HTMLButtonElement>('account-email-switch');
  const forgot = find<HTMLButtonElement>('account-forgot-password');
  const show = find<HTMLButtonElement>('account-password-show');
  const manage = find<HTMLButtonElement>('account-password-reset');
  const feedback = find('account-email-feedback');
  let mode: 'signin' | 'signup' | 'reset' = 'signin';
  let user: User | null = null; let pending = false;
  let message: Message | null = null; let error = false;

  function render(next: User | null, busy: boolean): void {
    if (next?.uid !== user?.uid) { password.value = ''; password.type = 'password'; mode = 'signin'; message = null; }
    user = next; pending = busy;
    panel.hidden = !!user;
    find('account-method-separator').hidden = !!user;
    manage.hidden = !user?.email; manage.disabled = pending;
    find('account-password-field').hidden = mode === 'reset';
    password.required = mode !== 'reset'; password.disabled = pending || mode === 'reset';
    password.minLength = mode === 'signup' ? 8 : 0;
    password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    find('account-password-hint').hidden = mode !== 'signup';
    show.textContent = t(password.type === 'password' ? 'passwordShow' : 'passwordHide');
    show.setAttribute('aria-pressed', String(password.type === 'text'));
    for (const control of [email, submit, change, forgot, show]) control.disabled = pending;
    form.setAttribute('aria-busy', String(pending));
    submit.textContent = t(pending ? 'emailWorking' : mode === 'signup' ? 'emailCreate' : mode === 'reset' ? 'passwordSendLink' : 'accountLogin');
    forgot.hidden = mode !== 'signin';
    find('account-email-switch-hint').textContent = mode === 'reset' ? '' : t(mode === 'signin' ? 'emailNewAccount' : 'emailHaveAccount');
    change.textContent = t(mode === 'signin' ? 'emailCreate' : 'emailBackToSignIn');
    feedback.hidden = !message; feedback.textContent = message ? t(message) : '';
    feedback.classList.toggle('error', error);
    if (!user) find('account-title').textContent = t(mode === 'signup' ? 'emailCreateTitle' : mode === 'reset' ? 'passwordResetTitle' : 'accountLogin');
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
  async function reset(address: string): Promise<void> {
    try { await sendPasswordResetEmail(auth, address); }
    catch (cause) {
      if (!(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'auth/user-not-found')) throw cause;
    }
    notice('passwordResetSent');
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const address = email.value.trim(); const value = password.value; const action = mode;
    void run(async () => {
      if (action === 'reset') { await reset(address); return; }
      if (action === 'signup') {
        const result = await createUserWithEmailAndPassword(auth, address, value);
        password.value = '';
        try { await sendEmailVerification(result.user); notice('emailVerificationSent'); }
        catch { notice('emailCreated'); }
      } else { await signInWithEmailAndPassword(auth, address, value); password.value = ''; }
    });
  });
  function switchMode(next: typeof mode): void {
    if (pending) return;
    mode = next; message = null; password.value = ''; password.type = 'password'; render(user, pending); email.focus();
  }
  change.addEventListener('click', () => switchMode(mode === 'signin' ? 'signup' : 'signin'));
  forgot.addEventListener('click', () => switchMode('reset'));
  show.addEventListener('click', () => { password.type = password.type === 'password' ? 'text' : 'password'; render(user, pending); });
  manage.addEventListener('click', () => { if (user?.email) { const address = user.email; void run(() => reset(address)); } });
  find<HTMLDialogElement>('account-dialog').addEventListener('close', () => { password.value = ''; password.type = 'password'; message = null; render(user, pending); });
  return { render };
}
