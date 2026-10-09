import { countryName, foundMessage, getLanguage, guessCount, onLanguageChange, setTranslatedText, t } from './i18n.js';
import distanceData from '../../data/distances.json';
import { countryNames, findCountries, formatDistance, getHint, normalizeName } from '../shared/countries.js';
import type { Atlas, Country } from '../shared/countries.js';
import type { Globe } from './globe.js';
import { turnBrandOrbit } from './brand-motion.js';
import { applyHistoryOrder } from './history-order.js';

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error('Practice interface unavailable');
  return result;
}

function randomIndex(length: number): number {
  const values = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / length) * length;
  do { crypto.getRandomValues(values); } while (values[0]! >= limit);
  return values[0]! % length;
}

export function startPractice(atlas: Atlas, globe: Globe): void {
  const form = element<HTMLFormElement>('#guess-form');
  const input = element<HTMLInputElement>('#country-input');
  const guessButton = element<HTMLButtonElement>('#guess-button');
  const options = element<HTMLUListElement>('#country-options');
  const feedback = element<HTMLParagraphElement>('#feedback');
  const history = element<HTMLOListElement>('#guess-history');
  const count = element<HTMLElement>('#guess-count');
  const empty = element<HTMLElement>('#empty-history');
  const guessed = new Set<string>();
  const indices = new Map(distanceData.ids.map((id, index) => [id, index]));
  const countriesById = new Map(atlas.countries.map((country) => [country.id, country]));
  const fixedTarget = countriesById.get(new URLSearchParams(location.search).get('target') ?? '');
  let target = fixedTarget ?? atlas.countries[randomIndex(atlas.countries.length)]!;
  let selected: Country | null = null;
  let suggestions: Country[] = [];
  let activeIndex = -1;
  let finished = false;

  const translations: (() => void)[] = [];
  feedback.removeAttribute('data-i18n');
  let renderFeedback = () => { feedback.textContent = t('begin'); };
  function showFeedback(render: () => string): void {
    renderFeedback = () => { feedback.textContent = render(); };
    renderFeedback();
  }
  const unsubscribe = onLanguageChange(() => {
    count.textContent = guessCount(guessed.size);
    if (selected) input.value = countryName(selected);
    closeSuggestions();
    renderFeedback();
    for (const translate of translations) translate();
  });
  if (import.meta.hot) import.meta.hot.dispose(unsubscribe);

  form.hidden = false;
  element<HTMLElement>('#practice-actions').hidden = false;
  setTranslatedText(element<HTMLElement>('#mode-label'), 'practice');
  renderFeedback();
  count.textContent = guessCount(0);

  function closeSuggestions(): void {
    options.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function choose(country: Country): void {
    selected = country;
    input.value = countryName(country);
    closeSuggestions();
    input.focus();
  }

  function updateActive(): void {
    const buttons = options.querySelectorAll<HTMLButtonElement>('.country-option');
    buttons.forEach((button, index) => button.setAttribute('aria-selected', String(index === activeIndex)));
    const active = buttons.item(activeIndex);
    if (activeIndex >= 0 && active) {
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  input.addEventListener('input', () => {
    selected = null;
    suggestions = findCountries(atlas.countries, input.value);
    activeIndex = -1;
    options.replaceChildren();
    for (const country of suggestions) {
      const item = document.createElement('li');
      item.setAttribute('role', 'presentation');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'country-option';
      button.id = `country-${country.id}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;
      const name = document.createElement('span');
      name.textContent = countryName(country);
      const translation = document.createElement('small');
      translation.textContent = getLanguage() === 'es' ? country.name : country.nameEs;
      button.append(name, translation);
      button.addEventListener('click', () => choose(country));
      item.append(button);
      options.append(item);
    }
    options.hidden = suggestions.length === 0;
    input.setAttribute('aria-expanded', String(!options.hidden));
    input.removeAttribute('aria-activedescendant');
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSuggestions();
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !options.hidden) {
      event.preventDefault();
      activeIndex = activeIndex < 0
        ? (event.key === 'ArrowDown' ? 0 : suggestions.length - 1)
        : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      updateActive();
    }
    if (event.key === 'Enter' && activeIndex >= 0 && !options.hidden) {
      event.preventDefault();
      const country = suggestions.at(activeIndex);
      if (country) choose(country);
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Node && !form.contains(event.target)) closeSuggestions();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (finished) return;
    const query = normalizeName(input.value);
    const ambiguous = ['congo', 'korea', 'corea'].includes(query);
    const exact = ambiguous ? [] : atlas.countries.filter((country) => countryNames(country).includes(query));
    const country = selected ?? (exact.length === 1 ? exact[0] : undefined);
    feedback.className = 'feedback';
    if (!country) {
      showFeedback(() => t(ambiguous ? 'ambiguous' : 'invalid'));
      feedback.classList.add('error');
      return;
    }
    if (guessed.has(country.id)) {
      showFeedback(() => t('duplicate'));
      feedback.classList.add('error');
      return;
    }
    const row = distanceData.matrix.at(indices.get(country.id)!);
    const distance = row?.at(indices.get(target.id)!);
    if (distance === undefined) throw new Error('Distance unavailable');
    const hint = getHint(distance, country.id === target.id, country.neighbors.includes(target.id));
    guessed.add(country.id);
    globe.paint(country, hint.color);
    turnBrandOrbit();
    const entry = document.createElement('li');
    entry.className = 'guess-entry';
    entry.dataset.distance = String(distance);
    entry.dataset.order = String(guessed.size);
    const number = document.createElement('span');
    number.className = 'guess-number';
    number.textContent = String(guessed.size).padStart(2, '0');
    const swatch = document.createElement('span');
    swatch.className = 'guess-swatch';
    swatch.style.backgroundColor = hint.color;
    swatch.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'guess-name';
    name.textContent = countryName(country);
    const label = document.createElement('span');
    label.className = 'guess-hint';
    const translateEntry = () => {
      name.textContent = countryName(country);
      const distanceLabel = formatDistance(distance, getLanguage());
      label.textContent = hint.correct ? `${distanceLabel} \u00b7 ${t('correct')}` : hint.border ? `${distanceLabel} \u00b7 ${t('border')}` : distanceLabel;
    };
    translations.push(translateEntry);
    translateEntry();
    entry.append(number, swatch, name, label);
    history.prepend(entry);
    applyHistoryOrder(history);
    count.textContent = guessCount(guessed.size);
    empty.hidden = true;
    if (hint.correct) {
      finished = true;
      input.disabled = true;
      guessButton.disabled = true;
      showFeedback(() => foundMessage(target, guessed.size));
      feedback.classList.add('success');
    } else {
      showFeedback(() => {
        const distanceLabel = formatDistance(distance, getLanguage());
        return hint.border ? `${countryName(country)}: ${distanceLabel} \u00b7 ${t('borderFeedback')}` : `${countryName(country)}: ${distanceLabel} ${t('distanceFeedback')}`;
      });
    }
    selected = null;
    input.value = '';
    closeSuggestions();
    if (!finished) input.focus();
  });

  element<HTMLButtonElement>('#new-round').addEventListener('click', () => {
    const candidates = atlas.countries.filter((country) => country.id !== target.id);
    target = candidates[randomIndex(candidates.length)]!;
    guessed.clear();
    selected = null;
    finished = false;
    input.disabled = false;
    guessButton.disabled = false;
    input.value = '';
    history.replaceChildren();
    count.textContent = guessCount(0);
    translations.length = 0;
    empty.hidden = false;
    feedback.className = 'feedback';
    showFeedback(() => t('fresh'));
    closeSuggestions();
    globe.clear();
    input.focus();
  });
}
