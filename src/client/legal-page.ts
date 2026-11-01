import { getLanguage, initializeLanguage, onLanguageChange } from './i18n.js';
import { initializeTheme } from './theme.js';

initializeLanguage(); initializeTheme();
function render(): void {
  for (const article of document.querySelectorAll<HTMLElement>('[data-legal-language]')) {
    article.hidden = article.dataset.legalLanguage !== getLanguage();
    if (!article.hidden) {
      const title = article.querySelector('h1')!.textContent;
      document.title = `${title} | Mundi`;
      document.querySelector('meta[name="description"]')?.setAttribute('content', `${title} · Mundi`);
    }
  }
}
onLanguageChange(render); render();
