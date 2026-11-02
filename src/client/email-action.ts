import { initializeApp } from 'firebase/app';
import { applyActionCode, checkActionCode, confirmPasswordReset, getAuth, verifyPasswordResetCode } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import type { FirebaseWebConfig } from '../shared/account.js';
import { getLanguage, initializeLanguage, onLanguageChange, t } from './i18n.js';
import { initializeTheme } from './theme.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode'); const code = params.get('oobCode'); const apiKey = params.get('apiKey');
// Codes stay only in this page's memory, outside subsequent URLs/referrers.
history.replaceState(null, '', location.pathname);
initializeLanguage(); initializeTheme();
const requestedLanguage = params.get('lang');
if ((requestedLanguage === 'es' || requestedLanguage === 'en') && requestedLanguage !== getLanguage()) document.querySelector<HTMLButtonElement>('#language-toggle')!.click();
const find = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
const form = find<HTMLFormElement>('email-action-form');
const password = find<HTMLInputElement>('new-password'); const confirmation = find<HTMLInputElement>('confirm-password');
const show = find<HTMLButtonElement>('email-action-show'); const submit = find<HTMLButtonElement>('email-action-submit');
const retry = find<HTMLButtonElement>('email-action-retry');
let auth: Auth | null = null;
let resetReady = false;
let state: 'loading' | 'ready' | 'working' | 'success' | 'invalid' | 'network' | 'weak' | 'mismatch' = 'loading';
const text = () => getLanguage() === 'es' ? {
  verify: 'Verificá tu correo', reset: 'Elegí tu nueva contraseña', recover: 'Protegé tu cuenta',
  loading: 'Comprobando el enlace…', ready: 'Usá una contraseña nueva de al menos 8 caracteres.', working: 'Guardando…',
  verified: 'Tu correo ya está verificado. Podés volver a Mundi y seguir jugando.', resetDone: 'Tu contraseña se cambió. Ya podés iniciar sesión con la nueva.', recovered: 'El cambio se confirmó. Si no lo pediste vos, cambiá tu contraseña desde Mundi.',
  invalid: 'Este enlace no es válido, venció o ya se usó. Volvé a Mundi para solicitar uno nuevo.',
  network: 'No pudimos completar la solicitud. Revisá tu conexión y volvé a intentar.',
  mismatch: 'Las contraseñas no coinciden. Escribí la misma en los dos campos.',
  newPassword: 'Nueva contraseña', confirm: 'Repetí la contraseña', save: 'Guardar contraseña', retry: 'Volver a intentar', home: 'Volver a Mundi',
} : {
  verify: 'Verify your email', reset: 'Choose your new password', recover: 'Secure your account',
  loading: 'Checking your link…', ready: 'Use a new password with at least 8 characters.', working: 'Saving…',
  verified: 'Your email is verified. You can return to Mundi and keep playing.', resetDone: 'Your password has changed. You can now sign in with your new password.', recovered: 'The change is confirmed. If you did not request it, change your password from Mundi.',
  invalid: 'This link is invalid, has expired, or was already used. Return to Mundi to request a new one.',
  network: 'We could not complete the request. Check your connection and try again.',
  mismatch: 'The passwords do not match. Enter the same password in both fields.',
  newPassword: 'New password', confirm: 'Repeat your password', save: 'Save password', retry: 'Try again', home: 'Back to Mundi',
};
function render(): void {
  const copy = text(); const busy = state === 'loading' || state === 'working';
  const title = mode === 'resetPassword' ? copy.reset : mode === 'verifyEmail' ? copy.verify : copy.recover;
  find('email-action-title').textContent = title; document.title = `${title} | Mundi`;
  const status = find('email-action-status');
  status.textContent = state === 'success' ? mode === 'resetPassword' ? copy.resetDone : mode === 'verifyEmail' ? copy.verified : copy.recovered
    : state === 'invalid' ? copy.invalid : state === 'network' ? copy.network : state === 'weak' ? t('passwordWeak') : state === 'mismatch' ? copy.mismatch
      : state === 'loading' ? copy.loading : state === 'working' ? copy.working : copy.ready;
  status.classList.toggle('error', ['invalid', 'network', 'weak', 'mismatch'].includes(state));
  form.hidden = !resetReady || ['loading', 'success', 'invalid'].includes(state);
  form.setAttribute('aria-busy', String(busy));
  for (const control of [password, confirmation, show, submit]) control.disabled = busy;
  find('new-password-label').textContent = copy.newPassword; find('confirm-password-label').textContent = copy.confirm;
  submit.textContent = busy ? copy.working : copy.save;
  show.setAttribute('aria-label', t(password.type === 'password' ? 'passwordShow' : 'passwordHide'));
  show.setAttribute('aria-pressed', String(password.type === 'text'));
  retry.hidden = state !== 'network'; retry.textContent = copy.retry;
  find('email-action-home').textContent = copy.home;
}
function failed(error: unknown): void {
  const reason = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  state = reason === 'auth/network-request-failed' || reason === 'auth/too-many-requests' ? 'network'
    : reason === 'auth/weak-password' || reason === 'auth/password-does-not-meet-requirements' ? 'weak' : 'invalid';
  render();
}
async function initialize(): Promise<void> {
  state = 'loading'; render();
  if (!code || code.length > 4096 || !['verifyEmail', 'resetPassword', 'recoverEmail', 'verifyAndChangeEmail', 'revertSecondFactorAddition'].includes(mode ?? '')) { state = 'invalid'; render(); return; }
  try {
    if (!auth) {
      const response = await fetch('/api/account/config');
      if (!response.ok) { state = 'network'; render(); return; }
      const config = await response.json() as { enabled: boolean; firebase?: FirebaseWebConfig };
      if (!config.enabled || !config.firebase || (apiKey && apiKey !== config.firebase.apiKey)) { state = 'invalid'; render(); return; }
      auth = getAuth(initializeApp(config.firebase));
    }
    if (mode === 'resetPassword') { await verifyPasswordResetCode(auth, code); resetReady = true; state = 'ready'; }
    else {
      const info = await checkActionCode(auth, code);
      const matches = (mode === 'verifyEmail' && info.operation === 'VERIFY_EMAIL') || (mode === 'recoverEmail' && info.operation === 'RECOVER_EMAIL')
        || (mode === 'verifyAndChangeEmail' && info.operation === 'VERIFY_AND_CHANGE_EMAIL') || (mode === 'revertSecondFactorAddition' && info.operation === 'REVERT_SECOND_FACTOR_ADDITION');
      if (!matches) { state = 'invalid'; render(); return; }
      await applyActionCode(auth, code); state = 'success';
    }
    render();
  } catch (error) { if (error instanceof TypeError) { state = 'network'; render(); } else failed(error); }
}
form.addEventListener('submit', event => {
  event.preventDefault(); if (!auth || !code || !resetReady || state === 'working') return;
  if (password.value !== confirmation.value) { state = 'mismatch'; render(); confirmation.focus(); return; }
  const value = password.value; state = 'working'; render();
  void confirmPasswordReset(auth, code, value).then(() => {
    password.value = ''; confirmation.value = ''; state = 'success'; render();
  }).catch(failed);
});
show.addEventListener('click', () => { password.type = confirmation.type = password.type === 'password' ? 'text' : 'password'; render(); });
retry.addEventListener('click', () => { void initialize(); });
window.addEventListener('pagehide', () => { password.value = ''; confirmation.value = ''; });
onLanguageChange(render); void initialize();
