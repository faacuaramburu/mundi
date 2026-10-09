import { setTranslatedAria, setTranslatedText } from './i18n.js';

export function initializeTheme(): void {
  const button = document.querySelector<HTMLButtonElement>('#theme-toggle');
  const label = document.querySelector<HTMLElement>('#theme-label');
  if (!button || !label) return;
  let dark = document.documentElement.dataset.theme !== 'light';

  function render(): void {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    button!.setAttribute('aria-pressed', String(dark));
    setTranslatedText(label!, dark ? 'lightMode' : 'darkMode');
    setTranslatedAria(button!, dark ? 'enableLightMode' : 'enableDarkMode');
  }
  function toggle(): void {
    dark = !dark;
    render();
    try { localStorage.setItem('mundi-theme', dark ? 'dark' : 'light'); }
    catch { /* The current page still uses the selected theme. */ }
  }
  render();
  button.addEventListener('click', toggle);
  if (import.meta.hot) import.meta.hot.dispose(() => button.removeEventListener('click', toggle));
}
