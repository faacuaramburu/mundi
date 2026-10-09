import { countryName, getLanguage, onLanguageChange } from './i18n.js';
import type { Message } from './i18n.js';
import { countryNames, findCountries, normalizeName } from '../shared/countries.js';
import type { Country } from '../shared/countries.js';
import { countryFlag } from './flags.js';

export function bindCountryInput(countries: Country[], submit: (country: Country) => void, error: (message: Message) => void): () => void {
  const form = document.querySelector<HTMLFormElement>('#guess-form')!;
  const input = document.querySelector<HTMLInputElement>('#country-input')!;
  const options = document.querySelector<HTMLUListElement>('#country-options')!;
  let selected: Country | null = null;
  let suggestions: Country[] = [];
  let active = -1;
  function close(): void { options.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
  function choose(country: Country): void { selected = country; input.value = countryName(country); close(); input.focus(); }
  input.addEventListener('input', () => {
    selected = null; active = -1; suggestions = findCountries(countries, input.value); options.replaceChildren();
    for (const country of suggestions) {
      const item = document.createElement('li'); item.setAttribute('role', 'presentation');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'country-option';
      button.id = `country-${country.id}`; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false'); button.tabIndex = -1;
      const name = document.createElement('span'); name.textContent = countryName(country);
      const translation = document.createElement('small'); translation.textContent = getLanguage() === 'es' ? country.name : country.nameEs;
      const labels = document.createElement('span'); labels.className = 'country-option-labels'; labels.append(name, translation);
      button.append(countryFlag(country), labels); button.addEventListener('click', () => choose(country)); item.append(button); options.append(item);
    }
    options.hidden = suggestions.length === 0; input.setAttribute('aria-expanded', String(!options.hidden)); input.removeAttribute('aria-activedescendant');
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !options.hidden) {
      event.preventDefault(); active = active < 0 ? event.key === 'ArrowDown' ? 0 : suggestions.length - 1
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      options.querySelectorAll('button').forEach((button, index) => {
        button.setAttribute('aria-selected', String(index === active));
        if (index === active) { input.setAttribute('aria-activedescendant', button.id); button.scrollIntoView({ block: 'nearest' }); }
      });
    }
    if (event.key === 'Enter' && active >= 0 && !options.hidden) { event.preventDefault(); const country = suggestions.at(active); if (country) choose(country); }
  });
  document.addEventListener('click', event => { if (event.target instanceof Node && !form.contains(event.target)) close(); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (input.disabled) return;
    const query = normalizeName(input.value); const ambiguous = ['congo', 'korea', 'corea'].includes(query);
    const exact = ambiguous ? [] : countries.filter(country => countryNames(country).includes(query));
    const country = selected ?? (exact.length === 1 ? exact[0] : undefined);
    if (!country) { error(ambiguous ? 'ambiguous' : 'invalid'); return; }
    submit(country); selected = null; input.value = ''; close();
  });
  return onLanguageChange(() => { if (selected) input.value = countryName(selected); close(); });
}
