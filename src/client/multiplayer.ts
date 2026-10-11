import type { Atlas } from '../shared/countries.js';
import { formatDistance, getHint } from '../shared/countries.js';
import type { Action, ErrorCode, PlayerGuess, Rules, ServerMessage, Snapshot } from '../shared/multiplayer.js';
import type { Globe } from './globe.js';
import { bindCountryInput } from './country-input.js';
import { countryName, getLanguage, guessCount, onLanguageChange, setTranslatedText, t, winnerMessage } from './i18n.js';
import type { Message } from './i18n.js';
import { turnBrandOrbit } from './brand-motion.js';
import { countryFlag } from './flags.js';
import type { Collection } from './collection.js';
import { applyHistoryOrder } from './history-order.js';
import { renderRoundResult } from './round-result.js';
import { getPlayerName, onProfileChange } from './profile.js';
import { animateGuess, animateRoundResult } from './game-motion.js';
import { roomApiPath } from './room-path.js';
import { bindGiveUp } from './give-up.js';

const element = <T extends HTMLElement>(id: string): T => document.querySelector<T>(`#${id}`)!;
function errorMessage(code: ErrorCode): Message {
  switch (code) {
    case 'ROOM_FULL': return 'errorFull'; case 'ROOM_GONE': return 'errorGone';
    case 'FORBIDDEN': return 'errorOrigin'; case 'RATE_LIMIT': return 'errorRate';
    case 'CAPACITY': return 'errorCapacity'; case 'UNAUTHORIZED': return 'errorSession';
    case 'ALREADY_CONNECTED': return 'errorConnected'; case 'NOT_PLAYING': case 'STALE_ROUND': return 'errorStage';
    case 'DUPLICATE': return 'duplicate'; case 'QUOTA': return 'quotaSpent'; default: return 'errorGeneric';
    case 'NOT_YOUR_TURN': return 'errorTurn';
  }
}
export function startMultiplayer(atlas: Atlas, globe: Globe, collection: Collection): void {
  const countries = new Map(atlas.countries.map(country => [country.id, country]));
  const lobby = element('room-lobby'); const sessionPanel = element('room-session');
  const form = element<HTMLFormElement>('guess-form'); const input = element<HTMLInputElement>('country-input');
  const guessButton = element<HTMLButtonElement>('guess-button'); const feedback = element('feedback');
  const historySection = document.querySelector<HTMLElement>('.history-section')!;
  const readyButton = element<HTMLButtonElement>('ready-button'); const rematchButton = element<HTMLButtonElement>('rematch-button');
  const createButton = element<HTMLButtonElement>('create-button'); const joinButton = element<HTMLButtonElement>('join-room');
  const reconnectButton = element<HTMLButtonElement>('reconnect-button');
  const mode = element<HTMLSelectElement>('room-mode'); const quota = element<HTMLSelectElement>('room-quota');
  const invite = element<HTMLInputElement>('invite-link');
  const play = element<HTMLSelectElement>('room-play'); const playerCount = element<HTMLSelectElement>('room-players');
  const startSolo = new URLSearchParams(location.search).get('play') === 'solo';
  let roomId = new URLSearchParams(location.search).get('room');
  let snapshot: Snapshot | null = null; let socket: WebSocket | null = null;
  let stopped = false; let disposed = false; let attempts = 0; let retryTimer = 0; let pendingTimer = 0;
  let receivedAt = 0; let pending = false; let lastRound = 0; let painted = 0; let revealedRound = 0;
  let error: Message | null = null;
  let newDiscovery = false;
  const showGiveUp = bindGiveUp(() => {
    if (snapshot) send({ type: 'giveup', round: snapshot.round });
  });
  const isConnected = () => socket?.readyState === WebSocket.OPEN && !stopped;
  const serverTime = () => snapshot ? snapshot.serverNow + performance.now() - receivedAt : 0;
  const clock = (ms: number) => { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  const playerLabel = (s: Snapshot, seat: number) => s.players.at(seat)?.name || `${t('player')} ${seat + 1}`;
  function showError(key: Message): void { error = key; render(); }
  function updateClock(): void {
    if (!snapshot) return;
    const now = serverTime();
    element('round-clock').textContent = snapshot.phase === 'countdown' ? String(Math.max(0, Math.ceil((snapshot.startsAt! - now) / 1000)))
      : snapshot.phase === 'playing' && snapshot.endsAt !== null ? clock(snapshot.endsAt - now) : '';
    element('turn-status').textContent = snapshot.phase === 'playing' && snapshot.turn !== null
      ? `${snapshot.turn === snapshot.seat ? t('yourTurn') : `${t('turnOf')} ${playerLabel(snapshot, snapshot.turn)}`} · ${clock(snapshot.turnEndsAt! - now)}` : '';
    element('idle-clock').hidden = true;
    const canGuess = isConnected() && !pending && snapshot.phase === 'playing'
      && (snapshot.endsAt === null || now < snapshot.endsAt) && (snapshot.you.remaining === null || snapshot.you.remaining > 0)
      && (snapshot.turn === null || snapshot.turn === snapshot.seat);
    input.disabled = !canGuess; guessButton.disabled = !canGuess;
    showGiveUp(snapshot.rules.players === 1 && snapshot.rules.mode === 'free' && snapshot.phase === 'playing', canGuess);
  }
  function renderHistory(node: HTMLElement, guesses: PlayerGuess[]): void {
    node.replaceChildren();
    guesses.forEach((guess, index) => {
      const country = countries.get(guess.countryId); if (!country) return;
      const entry = document.createElement('li'); entry.className = 'guess-entry';
      entry.dataset.distance = String(guess.distance); entry.dataset.order = String(index + 1);
      entry.dataset.correct = String(guess.correct);
      const number = document.createElement('span'); number.className = 'guess-number'; number.textContent = String(index + 1).padStart(2, '0');
      const swatch = document.createElement('span'); swatch.className = 'guess-swatch'; swatch.setAttribute('aria-hidden', 'true');
      swatch.style.backgroundColor = getHint(guess.distance, guess.correct, guess.border).color;
      const name = document.createElement('span'); name.className = 'guess-name'; name.textContent = countryName(country);
      name.prepend(countryFlag(country));
      if (snapshot && (snapshot.rules.players ?? 2) > 1) {
        const author = document.createElement('span'); author.className = 'guess-player';
        author.textContent = `${t('guessedBy')} ${playerLabel(snapshot, guess.playerSeat)}`;
        name.append(author);
      }
      const hint = document.createElement('span'); hint.className = 'guess-hint';
      hint.textContent = formatDistance(guess.distance, getLanguage()) + (guess.correct ? ` · ${t('correct')}` : guess.border ? ` · ${t('border')}` : '');
      entry.append(number, swatch, name, hint); node.prepend(entry);
    });
    if (node.id === 'guess-history') applyHistoryOrder(node, guesses.at(-1)?.correct ?? false);
  }
  function render(): void {
    feedback.className = 'feedback';
    if (!snapshot) {
      feedback.textContent = error ? t(error) : '';
      feedback.classList.toggle('error', !!error);
      if (error === 'errorGone' || error === 'errorFull') joinButton.hidden = true;
      return;
    }
    const s = snapshot;
    const solo = s.rules.players === 1;
    const compact = solo || s.phase === 'playing' || s.phase === 'finished';
    document.querySelector<HTMLElement>('.round-heading')!.hidden = solo;
    element('round-title').hidden = compact;
    element('room-rules').hidden = compact;
    element('session-profile').hidden = solo || s.phase !== 'waiting';
    element('you-progress').hidden = compact;
    document.querySelector<HTMLElement>('.player-lines')!.hidden = solo || s.phase === 'finished';
    const allConnected = s.players.every(player => player?.connected);
    lobby.hidden = true; sessionPanel.hidden = false;
    setTranslatedText(element('mode-label'), solo ? 'singleplayer' : s.rules.play === 'turns' ? 'turnsMode' : 'privateGame');
    const title = s.phase === 'waiting' ? 'privateGame' : s.phase === 'countdown' ? 'startCountdown' : s.phase === 'playing' ? 'playing' : 'finished';
    element('round-title').textContent = t(title);
    element('room-rules').textContent = solo ? t('soloRule') : `${s.rules.mode === 'free' ? t('freeMode') : `${s.rules.quota} ${t('quotaLabel').toLowerCase()}`} · ${t(s.rules.play === 'turns' ? 'turnsRule' : 'threeMinutes')}`;
    element('invite-area').hidden = solo || s.phase !== 'waiting';
    const progress = (label: string, player: Snapshot['you'] | null): string => {
      if (!player) return t('waiting');
      const state = !player.connected ? t('offline') : s.phase === 'waiting' || s.phase === 'countdown' ? t(player.ready ? 'readyStatus' : 'notReady') : t('online');
      const remainingText = player.remaining === 1 && getLanguage() === 'es' ? 'disponible' : t('remaining');
      return `${label} · ${state} · ${guessCount(player.count)}${player.remaining === null ? '' : ` · ${player.remaining} ${remainingText}`}${player.bestBand ? ` · ${t(player.bestBand)}` : ''}`;
    };
    element('you-progress').textContent = progress(s.you.name ? `${s.you.name} (${t('you')})` : t('you'), s.you);
    const opponents = element('opponent-progress'); opponents.replaceChildren(); opponents.hidden = solo;
    s.players.forEach((player, seat) => {
      if (seat === s.seat) return;
      const line = document.createElement('span'); line.className = 'player-progress';
      line.textContent = compact && player ? `${playerLabel(s, seat)} · ${guessCount(player.count)}` : progress(playerLabel(s, seat), player); opponents.append(line);
    });
    readyButton.hidden = solo || s.phase !== 'waiting';
    readyButton.disabled = !isConnected() || pending || !allConnected;
    readyButton.textContent = t(s.you.ready ? 'cancelReady' : 'ready'); readyButton.setAttribute('aria-pressed', String(s.you.ready));
    rematchButton.hidden = s.phase !== 'finished'; rematchButton.disabled = !isConnected() || pending || !allConnected;
    rematchButton.textContent = t(solo ? 'newRound' : s.you.rematch ? 'cancelRematch' : 'rematch');
    rematchButton.setAttribute('aria-pressed', String(s.you.rematch));
    reconnectButton.hidden = !stopped || !!error && ['errorConnected', 'errorGone', 'errorSession'].includes(error);
    form.hidden = s.phase === 'waiting' || s.phase === 'countdown'; historySection.hidden = form.hidden;
    renderHistory(element('guess-history'), s.guesses); element('guess-count').textContent = guessCount(s.guesses.length);
    setTranslatedText(element('history-title'), s.rules.play === 'turns' ? 'sharedGuesses' : 'history');
    element('empty-history').hidden = s.guesses.length > 0;
    element('opponent-results').hidden = !s.result || solo || s.rules.play === 'turns';
    if (s.result) {
      const others = element('opponent-history'); others.replaceChildren();
      s.result.histories.forEach((guesses, seat) => {
        if (seat === s.seat) return;
        const group = document.createElement('li'); const title = document.createElement('h3'); title.textContent = playerLabel(s, seat);
        const list = document.createElement('ol'); list.className = 'guess-history'; renderHistory(list, guesses); group.append(title, list); others.append(group);
      });
    }
    if (error) { feedback.textContent = t(error); feedback.classList.add('error'); }
    else if (!isConnected()) feedback.textContent = t('reconnecting');
    else if (s.result) {
      const country = countries.get(s.result.targetId)!;
      const outcome = s.result.winner === null ? 'draw' : s.result.winner === s.seat ? 'win' : 'lose';
      const winner = s.result.winner;
      const headline = s.result.reason === 'giveup' ? t('gaveUp') : outcome === 'lose' && winner !== null
        ? winnerMessage(winner + 1, s.result.histories.at(winner)?.length ?? 0, s.players.at(winner)?.name) : t(outcome);
      const notes: string[] = [];
      if (s.result.reason !== 'correct' && s.result.reason !== 'giveup') {
        notes.push(t(winner !== null ? 'closestResult' : s.result.reason === 'quota' ? 'quotaResult'
          : s.result.reason === 'inactive' ? 'inactiveResult' : 'deadlineResult'));
      }
      if (s.you.rematch && !solo) notes.push(t('rematchWaiting'));
      if (newDiscovery) notes.push(t('progressAdded'));
      if (s.result.histories.at(s.seat)?.some(guess => guess.correct) && !collection.canSave) notes.push(t('storageUnavailable'));
      renderRoundResult(feedback, country, headline, outcome === 'win', notes.join(' '));
    } else if (s.phase === 'waiting') feedback.textContent = allConnected ? t('ready') : t('waiting');
    else if (s.phase === 'countdown') feedback.textContent = t('startCountdown');
    else if (s.you.remaining === 0) feedback.textContent = t('quotaSpent');
    else {
      const last = s.guesses.at(-1); const country = last ? countries.get(last.countryId) : null;
      feedback.textContent = last && country ? `${countryName(country)}: ${formatDistance(last.distance, getLanguage())} ${t(last.border ? 'borderFeedback' : 'distanceFeedback')}` : t('begin');
    }
    updateClock();
  }
  function send(action: Action): void {
    if (!isConnected() || pending) return;
    error = null; pending = true;
    socket!.send(JSON.stringify(action)); render();
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => { pending = false; socket?.close(); showError('errorGeneric'); }, 10_000);
  }
  function connect(): void {
    if (!roomId || disposed) return;
    stopped = false; reconnectButton.hidden = true;
    const url = new URL(`${roomApiPath(roomId)}/socket`, location.origin); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const current = new WebSocket(url); socket = current;
    current.addEventListener('message', event => {
      if (current !== socket || disposed) return;
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'error') {
        pending = false; window.clearTimeout(pendingTimer);
        if (['ROOM_GONE', 'UNAUTHORIZED', 'ALREADY_CONNECTED', 'RATE_LIMIT'].includes(message.error)) stopped = true;
        showError(errorMessage(message.error)); return;
      }
      if (message.type !== 'snapshot') return;
      const wasPlaying = snapshot?.round === message.round && snapshot.phase === 'playing';
      attempts = 0; pending = false; window.clearTimeout(pendingTimer);
      if (message.round !== lastRound) { globe.clear(); painted = 0; lastRound = message.round; error = null; newDiscovery = false; }
      const added = message.guesses.slice(painted);
      for (const guess of added) { const country = countries.get(guess.countryId); if (country) globe.paint(country, getHint(guess.distance, guess.correct, guess.border).color); }
      if (added.length) turnBrandOrbit();
      if (message.result && revealedRound !== message.round) {
        const target = countries.get(message.result.targetId);
        if (target) globe.paint(target, getHint(0, true, false).color);
        if (message.result.histories.at(message.seat)?.some(guess => guess.correct)) newDiscovery = collection.add(message.result.targetId);
        revealedRound = message.round;
      }
      painted = message.guesses.length;
      snapshot = message; receivedAt = performance.now();
      element('server-status').textContent = t('connected'); render();
      if (wasPlaying && added.length) {
        const entry = element('guess-history').querySelector<HTMLElement>(`[data-order="${message.guesses.length}"]`);
        if (entry) animateGuess(entry);
      }
      if (wasPlaying && message.result && feedback.classList.contains('round-result')) {
        animateRoundResult(feedback, message.result.winner === message.seat);
        if (message.result.reason === 'giveup') rematchButton.focus();
      }
      if (message.rules.players === 1 && message.phase === 'waiting' && !message.you.ready) send({ type: 'ready', value: true, round: message.round });
    });
    current.addEventListener('close', () => {
      if (current !== socket || disposed) return;
      pending = false; window.clearTimeout(pendingTimer);
      element('server-status').textContent = t('unavailable');
      if (!stopped && attempts < 8) {
        retryTimer = window.setTimeout(() => { void recover(); }, Math.min(15_000, 1000 * 2 ** attempts++));
      } else { stopped = true; if (!error) error = 'errorGeneric'; }
      render();
    });
  }
  async function recover(): Promise<void> {
    if (disposed || stopped || !roomId) return;
    try { await request(`${roomApiPath(roomId)}/join`, {}); error = null; connect(); }
    catch {
      if (error === 'errorGone' || error === 'errorSession' || error === 'errorFull' || error === 'errorOrigin' || error === 'errorRate' || attempts >= 8) { stopped = true; render(); }
      else retryTimer = window.setTimeout(() => { attempts++; void recover(); }, Math.min(15_000, 1000 * 2 ** attempts));
    }
  }
  async function request(url: string, body: object): Promise<{ roomId: string }> {
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, name: getPlayerName() }), signal: AbortSignal.timeout(10_000) });
    const data = await response.json() as { roomId: string; error?: ErrorCode };
    if (!response.ok) { showError(errorMessage(data.error ?? 'INVALID_REQUEST')); throw new Error('Room request rejected'); }
    return data;
  }
  function enter(id: string): void {
    roomApiPath(id);
    roomId = id; error = null;
    feedback.textContent = t('connecting');
    const url = new URL(location.href); url.search = ''; url.searchParams.set('room', id); history.replaceState(null, '', url);
    invite.value = url.href; connect();
  }
  async function join(): Promise<void> {
    joinButton.disabled = true; joinButton.textContent = t('joiningRoom');
    try { const data = await request(`${roomApiPath(roomId)}/join`, {}); enter(data.roomId); }
    catch { if (!error) showError('errorGeneric'); } finally { joinButton.disabled = false; joinButton.textContent = t('joinRoom'); }
  }
  function updateRules(): void {
    element('quota-field').hidden = mode.value === 'free';
    element('limited-rule').hidden = mode.value === 'free' || play.value === 'turns';
    element('race-rule').hidden = play.value === 'turns'; element('turns-rule').hidden = play.value !== 'turns';
  }
  mode.addEventListener('change', updateRules); play.addEventListener('change', updateRules);
  element<HTMLFormElement>('create-room').addEventListener('submit', event => {
    event.preventDefault(); createButton.disabled = true; createButton.textContent = t('creatingRoom'); error = null;
    void request('/api/rooms', { mode: mode.value, quota: Number(quota.value), play: play.value, players: Number(playerCount.value) } as Rules)
      .then(data => enter(data.roomId)).catch(() => { if (!error) showError('errorGeneric'); })
      .finally(() => { createButton.disabled = false; createButton.textContent = t('createRoom'); });
  });
  joinButton.addEventListener('click', () => { error = null; void join(); });
  readyButton.addEventListener('click', () => { if (snapshot) send({ type: 'ready', value: !snapshot.you.ready, round: snapshot.round }); });
  rematchButton.addEventListener('click', () => { if (snapshot) send({ type: 'rematch', value: !snapshot.you.rematch, round: snapshot.round }); });
  reconnectButton.addEventListener('click', () => { attempts = 0; error = null; stopped = false; void recover(); });
  element('copy-invite').addEventListener('click', () => {
    void (async () => { await navigator.clipboard?.writeText(invite.value); if (!navigator.clipboard) throw new Error('Clipboard unavailable'); })().then(() => {
      element('copy-invite').textContent = t('copied'); window.setTimeout(() => { if (!disposed) element('copy-invite').textContent = t('copyLink'); }, 2000);
    }).catch(() => { invite.focus(); invite.select(); showError('copyManually'); });
  });
  invite.addEventListener('click', () => invite.select());
  const unbind = bindCountryInput(atlas.countries, country => {
    if (!snapshot) return;
    if (snapshot.guesses.some(guess => guess.countryId === country.id)) { showError('duplicate'); return; }
    send({ type: 'guess', countryId: country.id, round: snapshot.round });
  }, showError);
  historySection.hidden = true;
  lobby.hidden = false; feedback.removeAttribute('data-i18n'); feedback.textContent = '';
  if (roomId) {
    element('create-room').hidden = true; element('practice-link').hidden = true;
    joinButton.hidden = false; element('room-home').hidden = false;
    setTranslatedText(element('room-title'), 'privateGame');
    setTranslatedText(document.querySelector('.room-description')!, 'joinDescription');
    if (/^[A-Za-z0-9_-]{24}$/.test(roomId)) void join(); else { joinButton.hidden = true; showError('errorGone'); }
  } else if (startSolo) {
    lobby.hidden = true; feedback.textContent = t('connecting');
    setTranslatedText(element('mode-label'), 'singleplayer');
    void request('/api/rooms', { mode: 'free', quota: 8, players: 1, play: 'race' })
      .then(data => enter(data.roomId)).catch(() => {
        lobby.hidden = false; element('create-room').hidden = true; element('room-home').hidden = false;
        setTranslatedText(element('room-title'), 'singleplayer'); if (!error) showError('errorGeneric');
      });
  }
  const unsubscribe = onLanguageChange(render);
  const unsubscribeProfile = onProfileChange(() => {
    if (!roomId || disposed || snapshot?.phase !== 'waiting') return;
    void request(`${roomApiPath(roomId)}/join`, {}).catch(() => { if (!error) showError('errorGeneric'); });
  });
  const clockTimer = window.setInterval(updateClock, 200);
  const leavePage = () => {
    disposed = true; socket?.close(); window.clearInterval(clockTimer);
    window.clearTimeout(retryTimer); window.clearTimeout(pendingTimer); unsubscribeProfile();
  };
  const restorePage = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
  window.addEventListener('pagehide', leavePage);
  window.addEventListener('pageshow', restorePage);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    window.removeEventListener('pagehide', leavePage); window.removeEventListener('pageshow', restorePage);
    disposed = true; socket?.close(); window.clearInterval(clockTimer); window.clearTimeout(retryTimer); window.clearTimeout(pendingTimer); unsubscribe(); unsubscribeProfile(); unbind();
  });
}
