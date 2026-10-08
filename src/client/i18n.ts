import type { Country } from '../shared/countries.js';

export type Language = 'en' | 'es';
const messages = {
  development: ['IN DEVELOPMENT', 'EN DESARROLLO'],
  worldClue: ['THE WORLD IS YOUR CLUE', 'EL MUNDO ES TU PISTA'],
  title: ['A little closer. A world away.', 'Cada vez más cerca. Un mundo por descubrir.'],
  intro: ['One country is hiding in plain sight. Every guess gets you closer.', 'Hay un país por descubrir. Cada intento te acerca un poco más.'],
  notice: ['The globe is ready. Private 1v1 rooms are coming next.', 'El globo está listo. Las salas privadas 1v1 llegarán pronto.'],
  explore: ['Where do you want to explore?', '¿Qué país querés probar?'],
  placeholder: ['Try a country…', 'Escribí un país…'],
  guess: ['Guess ↗', 'Probar ↗'],
  suggestions: ['Country suggestions', 'Sugerencias de países'],
  controls: ['Drag to explore. Scroll or pinch to zoom.', 'Arrastrá para explorar. Usá la rueda o pellizcá para acercarte.'],
  newRound: ['New mystery country ↻', 'Nuevo país secreto ↻'],
  history: ['Your explorations', 'Tus intentos'],
  empty: ['Every journey starts with a first guess.', 'Todo viaje empieza con un primer intento.'],
  globe: ['Interactive world globe', 'Globo del mundo interactivo'],
  globeControls: ['Interactive globe. Drag to rotate and pinch or scroll to zoom.', 'Globo interactivo. Arrastrá para girar y pellizcá o usá la rueda para acercarte.'],
  map: ['World map with colored guesses', 'Mapa del mundo con intentos coloreados'],
  home: ['Globle MP home', 'Inicio de Globle MP'],
  caption: ['A WHOLE WORLD TO DISCOVER', 'UN MUNDO POR DESCUBRIR'],
  reset: ['Reset view', 'Restablecer vista'],
  loading: ['Loading the world…', 'Cargando el mundo…'],
  help: ['↔ Drag to rotate · Pinch or scroll to zoom', '↔ Arrastrá para girar · Pellizcá o usá la rueda para acercarte'],
  legend: ['Proximity color legend', 'Colores de cercanía'],
  far: ['Far away', 'Lejos'],
  near: ['Getting closer', 'Más cerca'],
  borderNote: ['A shared land border? You’ll know you’re right next door.', 'Si comparten una frontera terrestre, te lo avisamos.'],
  footer: ['Explore a little. Learn a lot.', 'Explorá un poco. Aprendé mucho.'],
  made: ['Made with', 'Hecho con'],
  accounts: ['No accounts. Just geography.', 'Sin cuentas. Solo geografía.'],
  connecting: ['Connecting…', 'Conectando…'],
  connected: ['Server connected', 'Servidor conectado'],
  unavailable: ['Server unavailable', 'Servidor no disponible'],
  practice: ['LOCAL PRACTICE', 'PRÁCTICA LOCAL'],
  find: ['FIND THE MYSTERY COUNTRY', 'ENCONTRÁ EL PAÍS SECRETO'],
  practiceNotice: ['Practice on your own · Private multiplayer is coming next.', 'Practicá por tu cuenta · El multijugador privado llegará pronto.'],
  begin: ['Names in English or Spanish. Choose a country to begin.', 'Podés escribir en español o inglés. Elegí un país para empezar.'],
  ambiguous: ['Please choose the specific country from the suggestions.', 'Elegí el país específico entre las sugerencias.'],
  invalid: ['Choose a country from the suggestions. English and Spanish names work.', 'Elegí un país entre las sugerencias. Podés escribir en español o inglés.'],
  duplicate: ['You already explored that country. Try somewhere new.', 'Ya probaste ese país. Elegí otro.'],
  correct: ['Correct', 'Correcto'],
  border: ['Shares a border', 'Comparte frontera'],
  borderFeedback: ['Shares a land border with the mystery country.', 'Comparte una frontera terrestre con el país secreto.'],
  distanceFeedback: ['from the mystery country. Keep exploring.', 'del país secreto. Seguí explorando.'],
  fresh: ['A new mystery country awaits. Where will you explore first?', 'Hay un nuevo país secreto. ¿Dónde empezamos?'],
  fallback: ['3D is unavailable on this device. Your guesses still work on the map.', 'El 3D no está disponible en este dispositivo. Podés seguir jugando en el mapa.'],
  lost: ['3D connection lost. Continue using the map, or reload to restore the globe.', 'Se perdió la conexión 3D. Seguí en el mapa o recargá para recuperar el globo.'],
} as const;
export type Message = keyof typeof messages;
let language: Language = 'en';
try {
  const saved = localStorage.getItem('globle-language');
  language = saved === 'es' || saved === 'en' ? saved : navigator.language.startsWith('es') ? 'es' : 'en';
} catch { /* Storage is optional. */ }
const listeners = new Set<() => void>();
export function getLanguage(): Language { return language; }
export function t(key: Message): string {
  // Keys come from this typed catalog; DOM keys are checked with Object.hasOwn.
  // eslint-disable-next-line security/detect-object-injection
  return messages[key][language === 'es' ? 1 : 0];
}
export function countryName(country: Country): string { return language === 'es' ? country.nameEs : country.name; }
export function guessCount(count: number): string {
  return `${count} ${language === 'es' ? count === 1 ? 'intento' : 'intentos' : count === 1 ? 'guess' : 'guesses'}`;
}
export function foundMessage(country: Country, count: number): string {
  return language === 'es' ? `¡Encontraste ${countryName(country)} en ${guessCount(count)}! ¿Jugamos otra vez?` : `You found ${countryName(country)} in ${guessCount(count)}! Ready for another journey?`;
}
export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setTranslatedText(node: Element, key: Message): void {
  node.setAttribute('data-i18n', key);
  node.textContent = t(key);
}
export function setTranslatedAria(node: Element, key: Message): void {
  node.setAttribute('data-i18n-aria', key);
  node.setAttribute('aria-label', t(key));
}
function render(): void {
  document.documentElement.lang = language;
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const key = node.getAttribute('data-i18n');
    if (key && Object.hasOwn(messages, key)) node.textContent = t(key as Message);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    const key = node.getAttribute('data-i18n-aria');
    if (key && Object.hasOwn(messages, key)) node.setAttribute('aria-label', t(key as Message));
  }
  document.querySelector('#country-input')?.setAttribute('placeholder', t('placeholder'));
  const button = document.querySelector('#language-toggle');
  if (button) {
    button.textContent = language === 'es' ? 'English' : 'Español';
    button.setAttribute('lang', language === 'es' ? 'en' : 'es');
    button.setAttribute('aria-label', language === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish');
  }
}
export function initializeLanguage(): void {
  render();
  document.querySelector('#language-toggle')?.addEventListener('click', () => {
    language = language === 'es' ? 'en' : 'es';
    try { localStorage.setItem('globle-language', language); } catch { /* Storage is optional. */ }
    render();
    for (const listener of listeners) listener();
  });
}
