import { publicProfilePath } from '../shared/public-profile.js';
import { t } from './i18n.js';

/** Navigate in script: the site's CSP intentionally disallows native form submissions. */
export function initializePlayerSearch(): void {
  const form = document.querySelector<HTMLFormElement>('#player-search')!;
  const input = document.querySelector<HTMLInputElement>('#player-username')!;
  input.addEventListener('input', () => input.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const path = publicProfilePath(input.value);
    if (path) location.assign(path);
    else { input.setCustomValidity(t('usernameInvalid')); input.reportValidity(); }
  });
}
