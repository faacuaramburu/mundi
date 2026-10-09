import type { Country } from '../shared/countries.js';

export function countryFlag(country: Country): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'country-flag';
  image.src = `/flags/${country.id}.svg`;
  image.alt = ''; image.setAttribute('aria-hidden', 'true');
  image.width = 28; image.height = 21; image.loading = 'lazy';
  return image;
}
