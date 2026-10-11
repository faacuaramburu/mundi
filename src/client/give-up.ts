import { onLanguageChange, setTranslatedText } from './i18n.js';

export function bindGiveUp(onConfirm: () => void): (visible: boolean, enabled?: boolean) => void {
  const actions = document.querySelector<HTMLElement>('#give-up-actions')!;
  const button = document.querySelector<HTMLButtonElement>('#give-up-button')!;
  const cancel = document.querySelector<HTMLButtonElement>('#cancel-give-up')!;
  let confirming = false;
  function render(): void {
    setTranslatedText(button, confirming ? 'revealCountry' : 'giveUp');
    cancel.hidden = !confirming;
  }
  button.addEventListener('click', () => {
    if (button.disabled || actions.hidden) return;
    if (confirming) { confirming = false; render(); onConfirm(); }
    else { confirming = true; render(); }
  });
  cancel.addEventListener('click', () => { confirming = false; render(); button.focus(); });
  const unsubscribe = onLanguageChange(render);
  if (import.meta.hot) import.meta.hot.dispose(unsubscribe);
  return (visible, enabled = true) => {
    actions.hidden = !visible;
    button.disabled = !enabled; cancel.disabled = !enabled;
    if (!visible || !enabled) confirming = false;
    render();
  };
}
