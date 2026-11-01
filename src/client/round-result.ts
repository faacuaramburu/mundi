import type { Country } from '../shared/countries.js';
import { countryName, t } from './i18n.js';
import { countryFlag } from './flags.js';

export function renderRoundResult(node: HTMLElement, country: Country, headline: string, won: boolean, note = ''): void {
  node.className = `feedback round-result${won ? ' success' : ''}`;
  const title = document.createElement('strong');
  title.className = 'result-title'; title.textContent = headline;
  const target = document.createElement('span');
  target.className = 'result-country';
  const name = document.createElement('span');
  name.className = 'result-country-name';
  name.append(countryFlag(country), countryName(country));
  target.append(t('targetWas'), name);
  node.replaceChildren(title, target);
  if (note) {
    const detail = document.createElement('span');
    detail.className = 'result-note'; detail.textContent = note;
    node.append(detail);
  }
}

