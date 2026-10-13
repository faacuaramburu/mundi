import type { Country } from '../shared/countries.js';

export type Language = 'en' | 'es';
const messages = {
  indexOrder: ['Sort countries', 'Ordenar países'],
  indexAlphabetical: ['Alphabetical', 'Alfabéticamente'],
  indexNewest: ['Recently added first', 'Más recientes primero'],
  indexOldest: ['Oldest added first', 'Más antiguos primero'],
  indexDateNote: ['Countries without a recorded discovery date appear last.', 'Los países sin fecha de descubrimiento registrada aparecen al final.'],
  indexDateUnknown: ['Date not recorded', 'Fecha no registrada'],
  indexDiscoveredOn: ['Discovered on', 'Descubierto el'],
  seoTitle: ['Mundi | Online Multiplayer Geography Game', 'Mundi | Geografía multijugador online'],
  seoDescription: ['Play Mundi, a free country guessing game. Explore the globe solo or play online multiplayer with 2 to 4 friends. No account needed.', 'Mundi es un juego gratuito de geografía. Adivina países en el globo, juega solo o en multijugador online con 2 a 4 amigos. Sin cuenta.'],
  homeDescription: ['Guess the country. Play solo or online with friends.', 'Un juego de geografía para jugar solo o con amigos.'],
  faq: ['FAQ', 'Preguntas frecuentes'],
  faqTitle: ['Countries and distances', 'Países y distancias'],
  faqMultiplayerQuestion: ['Can I play Mundi with friends?', '¿Puedo jugar Mundi con amigos?'],
  faqMultiplayerAnswer: ['Mundi is a geography guessing game. Guess the mystery country using distance clues on a globe, play solo or create an online multiplayer room for 2 to 4 friends. Race to find the country or take turns with shared clues. No account is required.', 'Mundi es un juego de geografía. El objetivo es adivinar un país secreto mediante pistas de distancia en el globo. Se puede jugar solo o crear una sala multijugador online para 2 a 4 amigos, competir por encontrar el país o alternar turnos con pistas compartidas. No requiere una cuenta.'],
  faqRosterQuestion: ['Which countries can be the answer?', '¿Qué países pueden ser la respuesta?'],
  faqRosterAnswer: ['Mundi has a fixed list of 195 countries: the 193 UN member states, plus Palestine and the Holy See, shown as Vatican City. These are the same countries you can guess and collect in your index.', 'Mundi utiliza una lista fija de 195 países: los 193 Estados miembros de la ONU, más Palestina y la Santa Sede, representada como Ciudad del Vaticano. Todos pueden aparecer como país secreto, introducirse como respuesta y añadirse al índice al acertar.'],
  faqTerritoriesQuestion: ['Which countries and territories are not included?', '¿Qué países y territorios no están incluidos?'],
  faqTerritoriesAnswer: ['The map shows countries and territories as geographic context. Only the 195 countries in the catalog can be the mystery country, be accepted as a guess and be added to your index.', 'El mapa muestra países y territorios como referencia geográfica. Solo los 195 países del catálogo pueden ser el país secreto, aceptarse como respuesta y añadirse al índice.'],
  faqUkQuestion: ['Can I guess England or Scotland?', '¿Cómo se representa el Reino Unido?'],
  faqUkAnswer: ['The accepted answer is United Kingdom. England, Scotland, Wales and Northern Ireland do not have separate entries in the game.', 'La respuesta que acepta el juego es Reino Unido. Inglaterra, Escocia, Gales e Irlanda del Norte no tienen entradas separadas.'],
  faqDistanceQuestion: ['How are distances calculated?', '¿Cómo se calculan las distancias?'],
  faqDistanceAnswer: ['We estimate the shortest distance between the boundaries of your guess and the mystery country, including coastlines and islands in their playing areas. We measure along the Earth’s surface, not between capitals or country centers.', 'Se estima la distancia más corta entre los límites del país elegido y el país secreto, incluidas las costas y las islas de sus áreas de juego. La medición sigue la superficie terrestre; no se calcula entre capitales ni centros de países.'],
  faqDistanceAccuracy: ['The ≈ symbol means the distance is approximate: we use Natural Earth map outlines, sample their boundaries at intervals of up to 10 km and round the result to the nearest kilometer.', 'El símbolo ≈ indica que la distancia es aproximada. El cálculo utiliza los contornos de Natural Earth y puntos sobre sus límites a intervalos de hasta 10 km. El resultado se redondea al kilómetro más cercano.'],
  faqDistanceZero: ['Countries that share a land border show 0 km and “Shares a border”. The correct answer also shows 0 km, but is marked “Correct”. A rounded distance can also be 0 km: only “Correct” means you found the country.', 'Los países con una frontera terrestre común muestran 0 km y la indicación “Comparte frontera”. La respuesta exacta también muestra 0 km, acompañada de “Correcto”. El redondeo puede producir una distancia de 0 km: únicamente la indicación “Correcto” confirma un acierto.'],
  faqMapQuestion: ['How do overseas territories affect distances?', '¿Cómo afectan los territorios de ultramar a las distancias?'],
  faqMapAnswer: ['Distances use the country boundaries included in Mundi’s map. Some overseas areas are shown only as context. For example, France includes European France and Corsica; French Guiana is excluded from its playing area, so Brazil does not count as France’s neighbor.', 'Las distancias se calculan con los límites incluidos en el mapa de Mundi. Algunas zonas de ultramar aparecen únicamente como referencia geográfica. En el caso de Francia, el área de juego comprende Francia europea y Córcega, pero excluye Guayana Francesa. Por este motivo, Brasil no se considera un país vecino de Francia en el juego.'],
  faqIndex: ['See all 195 countries in the index', 'Ver los 195 países en el índice'],
  faqSources: ['UN references:', 'Referencias de la ONU:'],
  faqMembers: ['Member states', 'Estados miembros'],
  faqObservers: ['Observer states', 'Estados observadores'],
  profileName: ['Your name (optional)', 'Tu nombre (opcional)'],
  profileSave: ['Save', 'Guardar'],
  profilePlaceholder: ['Guest', 'Invitado'],
  profileHint: ['Friends see this name. Saved in this browser.', 'Tus amigos ven este nombre. Se guarda en este navegador.'],
  profileSaved: ['Name saved in this browser.', 'Nombre guardado en este navegador.'],
  profileGuest: ['You will play as a guest.', 'Vas a jugar como invitado.'],
  profileTemporary: ['Name set for this page. This browser could not save it.', 'Nombre listo para esta página. El navegador no pudo guardarlo.'],
  profileInvalid: ['Use up to 24 letters, numbers, spaces, dots, hyphens or underscores.', 'Usá hasta 24 letras, números, espacios, puntos, guiones o guiones bajos.'],
  mapHelp: ['Drag and zoom', 'Arrastrar y acercar'],
  mapView: ['Map view', 'Vista del mapa'],
  globeView: ['Globe', 'Globo'],
  flatView: ['Flat map', 'Mapa plano'],
  continent: ['Continent', 'Continente'],
  allRegions: ['All continents', 'Todos los continentes'],
  africa: ['Africa', 'África'],
  asia: ['Asia', 'Asia'],
  europe: ['Europe', 'Europa'],
  northAmerica: ['North America', 'América del Norte'],
  southAmerica: ['South America', 'América del Sur'],
  oceania: ['Oceania', 'Oceanía'],
  proximity: ['Proximity', 'Cercanía'],
  guessedBy: ['Guessed by', 'Elegido por'],
  sortDistance: ['Sort closest guesses first', 'Ordenar intentos del más cercano al más lejano'],
  sortRecent: ['Restore most recent guesses first', 'Volver a mostrar primero los intentos más recientes'],
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
  yourTurn: ['Your turn', 'Tu turno'], turnOf: ['Turn of', 'Turno de'],
  errorTurn: ['Wait for your turn.', 'Esperá tu turno.'],
  turnsTimeout: ['Nobody found the country. The round is a draw.', 'Nadie encontró el país. La partida termina en empate.'],
  sharedGuesses: ['Shared guesses', 'Intentos compartidos'],
  soloRule: ['Unlimited guesses, no time limit. Find the exact country to add it to your index.', 'Sin límite de intentos ni reloj. Acertá el país para sumarlo a tu índice.'],
  progressAdded: ['Country added to your index.', 'País agregado a tu índice.'],
  indexOpen: ['Explore your collection', 'Ver tu colección'],
  privateGame: ['Private game', 'Partida privada'],
  retry: ['Reconnect', 'Reconectar'],
  resumeRoom: ['Return to your game', 'Volver a la partida'],
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
  joinCode: ['Join with a room code', 'Entrar con un código de sala'],
  roomCode: ['Room code', 'Código de sala'],
  codeInvalid: ['Enter the eight-character room code, for example ABCD-EFGH.', 'Introduce el código de ocho caracteres, por ejemplo ABCD-EFGH.'],
  codeNotFound: ['No active room has this code. Check it or ask for a new code.', 'No hay una sala activa con ese código. Revísalo o pide un código nuevo.'],
  roundsWon: ['Rounds won', 'Rondas ganadas'],
  copyCode: ['Copy room code', 'Copiar código de sala'],
  copyCodeManually: ['Select and copy the room code.', 'Selecciona y copia el código de sala.'],
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
  giveUp: ['Give up', 'Rendirse'],
  revealCountry: ['Reveal country', 'Revelar país'],
  cancelGiveUp: ['Keep playing', 'Seguir jugando'],
  gaveUp: ['You gave up', 'Te rendiste'],
  lose: ['Your opponent won', 'Ganó tu rival'],
  draw: ['Draw', 'Empate'],
  targetWas: ['The country was', 'El país era'],
  closestResult: ['Closest guess wins.', 'Ganó el intento más cercano.'],
  deadlineResult: ['Time is up.', 'Terminó el tiempo.'],
  quotaResult: ['Guess limit reached.', 'Se agotaron los intentos.'],
  inactiveResult: ['No new guesses for 60 seconds.', 'Sin intentos nuevos durante 60 segundos.'],
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
  darkMode: ['Dark mode', 'Modo oscuro'],
  lightMode: ['Light mode', 'Modo claro'],
  enableDarkMode: ['Switch to dark mode', 'Cambiar a modo oscuro'],
  enableLightMode: ['Switch to light mode', 'Cambiar a modo claro'],
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
export function winnerMessage(player: number, count: number, name = ''): string {
  const label = name || (language === 'es' ? `El jugador ${player}` : `Player ${player}`);
  return language === 'es' ? `${label} ganó en ${guessCount(count)}` : `${label} won in ${guessCount(count)}`;
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
  document.title = t('seoTitle');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('seoDescription'));
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', t('seoTitle'));
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', t('seoDescription'));
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
