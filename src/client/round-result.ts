import type { Country } from '../shared/countries.js';
import { countryName, t } from './i18n.js';
import { countryFlag } from './flags.js';

export function renderRoundResult(node: HTMLElement, country: Country, headline: string, won: boolean, note = ''): void {
  node.className = `feedback round-result${won ? ' success' : ''}`;
  const title = document.createElement('strong');
  title.className = 'result-title'; title.textContent = headline;
  const target = document.createElement('span');
  target.className = 'result-country';
  target.append(`${t('targetWas')} `, countryFlag(country), countryName(country));
  node.replaceChildren(title, target);
  if (note) {
    const detail = document.createElement('span');
    detail.className = 'result-note'; detail.textContent = note;
    node.append(detail);
  }
}
