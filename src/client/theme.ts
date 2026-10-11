import { setTranslatedAria, setTranslatedText } from './i18n.js';

export function initializeTheme(): void {
  const button = document.querySelector<HTMLButtonElement>('#theme-toggle');
  const label = document.querySelector<HTMLElement>('#theme-label');
  if (!button || !label) return;
  let dark = document.documentElement.dataset.theme !== 'light';
  let transitionTimer = 0;

  function render(): void {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    button!.setAttribute('aria-pressed', String(dark));
    setTranslatedText(label!, dark ? 'lightMode' : 'darkMode');
    setTranslatedAria(button!, dark ? 'enableLightMode' : 'enableDarkMode');
  }
  function toggle(): void {
    window.clearTimeout(transitionTimer);
    document.documentElement.setAttribute('data-theme-transition', '');
    dark = !dark;
    render();
    transitionTimer = window.setTimeout(() => {
      document.documentElement.removeAttribute('data-theme-transition');
    }, 200);
    try { localStorage.setItem('mundi-theme', dark ? 'dark' : 'light'); }
    catch { /* The current page still uses the selected theme. */ }
  }
  render();
  button.addEventListener('click', toggle);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    button.removeEventListener('click', toggle);
    window.clearTimeout(transitionTimer);
    document.documentElement.removeAttribute('data-theme-transition');
  });
}
