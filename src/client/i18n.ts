import type { Country } from '../shared/countries.js';

export type Language = 'en' | 'es';
const messages = {
  welcome: ['Choose how to play', 'Elegí cómo jugar'],
  singleplayer: ['Singleplayer', 'Un jugador'],
  multiplayer: ['Multiplayer', 'Multijugador'],
  soloDescription: ['Find a country at your own pace.', 'Encontrá un país a tu ritmo.'],
  multiDescription: ['Private games for 2–4 friends.', 'Partidas privadas de 2 a 4 amigos.'],
  countryIndex: ['Country index', 'Índice de países'],
  indexDescription: ['Your world, one discovery at a time.', 'Tu mundo, un país a la vez.'],
  localProgress: ['Saved in this browser. Clearing site data removes your collection.', 'Guardado en este navegador. Borrar los datos del sitio elimina tu colección.'],
  storageUnavailable: ['This browser could not save your collection. Keep playing; progress is temporary.', 'Este navegador no pudo guardar tu colección. Podés jugar, pero el progreso es temporal.'],
  collected: ['Found', 'Encontrado'], notCollected: ['Still to find', 'Por descubrir'],
  allCountries: ['All countries', 'Todos los países'], foundCountries: ['Found countries', 'Encontrados'], missingCountries: ['Still to find', 'Por descubrir'],
  searchIndex: ['Search countries', 'Buscar países'], indexFilter: ['Show countries', 'Mostrar países'],
  noMatches: ['No countries match this search.', 'No hay países que coincidan.'],
  playerCount: ['Players', 'Jugadores'], player: ['Player', 'Jugador'],
  playStyle: ['How to play', 'Cómo jugar'], raceMode: ['Race', 'Carrera'], turnsMode: ['Take turns', 'Por turnos'],
  turnsRule: ['Shared clues. One guess per turn, 30 seconds each. Ten minutes total. Only a correct guess wins.', 'Pistas compartidas. Un intento por turno, 30 segundos cada uno. Diez minutos en total. Solo gana quien acierta.'],
  yourTurn: ['Your turn', 'Tu turno'], turnOf: ['Turn of player', 'Turno del jugador'],
  errorTurn: ['Wait for your turn.', 'Esperá tu turno.'],
  turnsTimeout: ['Nobody found the country. The round is a draw.', 'Nadie encontró el país. La partida termina en empate.'],
  sharedGuesses: ['Shared guesses', 'Intentos compartidos'],
  soloRule: ['Unlimited guesses, no time limit. Find the exact country to add it to your index.', 'Sin límite de intentos ni reloj. Acertá el país para sumarlo a tu índice.'],
  progressAdded: ['Added to your country index.', 'Sumado a tu índice de países.'],
  indexOpen: ['Explore your collection', 'Ver tu colección'],
  privateGame: ['Private game', 'Partida privada'],
  retry: ['Reconnect', 'Reconectar'],
  reload: ['Reload', 'Recargar'],
  mapError: ['The map could not load. Check your connection and reload.', 'No se pudo cargar el mapa. Revisá tu conexión y recargá.'],
  playFriend: ['Play with friends', 'Jugá con amigos'],
  inviteDescription: ['Create a private room and share the link. Everyone searches for the same country.', 'Creá una sala privada y compartí el enlace. Todos buscan el mismo país.'],
  joinDescription: ['An invitation to play. Everyone must be ready before the countdown starts.', 'Una invitación para jugar. Todos deben estar listos para iniciar la cuenta regresiva.'],
  createAnother: ['Create another room', 'Crear otra sala'],
  limitedRule: ['Also ends after 60 seconds without new guesses, or when all quotas are used.', 'También termina tras 60 segundos sin intentos nuevos o cuando todos agotan su cuota.'],
  gameMode: ['Mode', 'Modo'],
  limitedMode: ['Limited guesses', 'Intentos limitados'],
  freeMode: ['Unlimited guesses', 'Intentos libres'],
  quotaLabel: ['Guesses per player', 'Intentos por jugador'],
  threeMinutes: ['Three minutes. The first correct guess wins.', 'Tres minutos. Gana el primero en acertar.'],
  createRoom: ['Create room', 'Crear sala'],
  creatingRoom: ['Creating room…', 'Creando sala…'],
  joiningRoom: ['Joining room…', 'Entrando a la sala…'],
  joinRoom: ['Join room', 'Entrar a la sala'],
  inviteLink: ['Invitation link', 'Enlace de invitación'],
  copyLink: ['Copy', 'Copiar'],
  copied: ['Copied', 'Copiado'],
  copyManually: ['Select and copy the invitation link.', 'Seleccioná y copiá el enlace de invitación.'],
  ready: ["I'm ready", 'Estoy listo'],
  cancelReady: ['Cancel ready', 'Todavía no'],
  rematch: ['Play again', 'Revancha'],
  cancelRematch: ['Cancel rematch', 'Cancelar revancha'],
  leaveRoom: ['Leave room', 'Salir de la sala'],
  you: ['You', 'Vos'],
  opponent: ['Opponent', 'Rival'],
  waiting: ['Waiting for your friend', 'Esperando a tu amigo'],
  readyStatus: ['Ready', 'Listo'],
  notReady: ['Not ready', 'Sin confirmar'],
  offline: ['Disconnected', 'Desconectado'],
  online: ['Connected', 'Conectado'],
  reconnecting: ['Reconnecting… The round clock keeps running.', 'Reconectando… El reloj de la partida sigue corriendo.'],
  startCountdown: ['Get ready', 'Preparados'],
  playing: ['Find the country', 'Encontrá el país'],
  finished: ['Round finished', 'Partida terminada'],
  remaining: ['remaining', 'disponibles'],
  quotaSpent: ['You used all your guesses. Your opponent can still play.', 'Usaste todos tus intentos. Tu rival puede seguir jugando.'],
  win: ['You won', 'Ganaste'],
  lose: ['Your opponent won', 'Ganó tu rival'],
  draw: ['Draw', 'Empate'],
  targetWas: ['The country was', 'El país era'],
  reasonCorrect: ['First correct guess.', 'Primer acierto.'],
  reasonDeadline: ['Time is up. Closest guess wins; ties use guess number, then server arrival.', 'Terminó el tiempo. Gana el más cercano; empates por número de intento y orden de llegada al servidor.'],
  reasonQuota: ['Everyone used all guesses. Closest guess wins; ties use guess number, then server arrival.', 'Todos agotaron los intentos. Gana el más cercano; empates por número de intento y orden de llegada al servidor.'],
  reasonInactive: ['No new guesses for 60 seconds. Closest guess wins; ties use guess number, then server arrival.', 'Pasaron 60 segundos sin intentos nuevos. Gana el más cercano; empates por número de intento y orden de llegada al servidor.'],
  inactivity: ['No-guess cutoff', 'Cierre sin intentos'],
  opponentGuesses: ["Opponent's guesses", 'Intentos del rival'],
  rematchWaiting: ['Waiting for the other player to accept the rematch.', 'Esperando que el otro jugador acepte la revancha.'],
  errorFull: ['This room is full. Ask for a new invitation.', 'Esta sala está llena. Pedí una nueva invitación.'],
  errorGone: ['This room expired or the server restarted. Create a new room.', 'La sala venció o el servidor se reinició. Creá otra sala.'],
  errorOrigin: ['Open the game at its configured address to join or create a room.', 'Abrí el juego en su dirección configurada para entrar o crear una sala.'],
  errorRate: ['Too many requests. Wait a minute before trying again.', 'Demasiadas solicitudes. Esperá un minuto para reintentar.'],
  errorCapacity: ['The server is full, or you already have three rooms. Try again later.', 'El servidor está lleno o ya tenés tres salas. Reintentá más tarde.'],
  errorSession: ['Your player session is unavailable. Reopen the invitation.', 'Tu sesión de jugador no está disponible. Volvé a abrir la invitación.'],
  errorConnected: ['This player is open in another tab. Close it and reopen this invitation.', 'Este jugador está abierto en otra pestaña. Cerrala y volvé a abrir esta invitación.'],
  errorStage: ['Wait for the server to start the round. Late guesses are not accepted.', 'Esperá a que el servidor inicie la partida. No se aceptan intentos fuera de tiempo.'],
  errorGeneric: ['Could not connect. Check the server and try again.', 'No se pudo conectar. Revisá el servidor y reintentá.'],
  cold: ['Far', 'Lejos'], cool: ['Cool', 'Algo lejos'], warm: ['Warm', 'Cerca'], hot: ['Hot', 'Muy cerca'], veryHot: ['Very hot', 'Cerquísima'],
  development: ['In development', 'En desarrollo'],
  notice: ['Private multiplayer is still in development.', 'El multijugador privado todavía está en desarrollo.'],
  explore: ['Country', 'País'],
  placeholder: ['Enter a country', 'Escribí un país'],
  guess: ['Guess', 'Probar'],
  suggestions: ['Country suggestions', 'Sugerencias de países'],
  newRound: ['New round', 'Nueva partida'],
  history: ['Guesses', 'Intentos'],
  empty: ["You haven't made any guesses yet.", 'Todavía no hiciste ningún intento.'],
  playPanel: ['Country guesses', 'Intentos de países'],
  globe: ['Interactive world globe', 'Globo del mundo interactivo'],
  globeControls: ['Interactive globe. Drag to rotate and pinch or scroll to zoom.', 'Globo interactivo. Arrastrá para girar y pellizcá o usá la rueda para acercarte.'],
  map: ['World map with colored guesses', 'Mapa del mundo con intentos coloreados'],
  home: ['Mundi home', 'Inicio de Mundi'],
  reset: ['Reset view', 'Restablecer vista'],
  loading: ['Loading the world…', 'Cargando el mundo…'],
  help: ['Rotate and zoom', 'Girar y acercar'],
  legend: ['Proximity color legend', 'Colores de cercanía'],
  far: ['Far', 'Lejos'],
  near: ['Near', 'Cerca'],
  connecting: ['Connecting…', 'Conectando…'],
  connected: ['Server connected', 'Servidor conectado'],
  unavailable: ['Server unavailable', 'Servidor no disponible'],
  practice: ['Practice', 'Práctica'],
  begin: ['Guess the mystery country. After each guess, we will show the approximate distance in kilometers.', 'Adiviná el país secreto. Te mostraremos la distancia aproximada en kilómetros después de cada intento.'],
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
  const saved = localStorage.getItem('mundi-language');
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
    try { localStorage.setItem('mundi-language', language); } catch { /* Storage is optional. */ }
    render();
    for (const listener of listeners) listener();
  });
}
