import type { Atlas, Country } from '../shared/countries.js';
import { formatDistance, getHint } from '../shared/countries.js';
import { dailyCountdown, dayLength, parseDailyProgress } from '../shared/daily.js';
import type { DailyInfo, DailyProgress } from '../shared/daily.js';
import type { Guess } from '../shared/multiplayer.js';
import type { Globe } from './globe.js';
import type { Collection } from './collection.js';
import { bindCountryInput } from './country-input.js';
import { bindGiveUp } from './give-up.js';
import { countryName, getLanguage, guessCount, onLanguageChange, setTranslatedText, t } from './i18n.js';
import { countryFlag } from './flags.js';
import { applyHistoryOrder } from './history-order.js';
import { renderRoundResult } from './round-result.js';

const storageKey = (day: string) => `mundi-daily-v1:${day}`;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    signal: AbortSignal.timeout(10000), ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(response.status === 409 ? 'expired' : 'unavailable');
  return await response.json() as T;
}
function readProgress(day: string, ids: ReadonlySet<string>): DailyProgress {
  try { return parseDailyProgress(JSON.parse(localStorage.getItem(storageKey(day)) ?? 'null') as unknown, day, ids); }
  catch { return { day, guesses: [], targetId: null, won: false }; }
}
function schedule(tick: () => void): void {
  const timer = window.setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pageshow', tick);
  const unsubscribe = onLanguageChange(tick);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    clearInterval(timer); unsubscribe(); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pageshow', tick);
  });
}

export function initializeDailyCard(atlas: Atlas): void {
  const ids = new Set(atlas.countries.map(country => country.id));
  const status = element('daily-home-status');
  let info: DailyInfo | null = null; let receivedAt = 0; let loading = false; let retryAfter = 0;
  async function refresh(): Promise<void> {
    if (loading) return;
    loading = true;
    try { info = await request<DailyInfo>('/api/daily'); receivedAt = performance.now(); }
    catch { status.textContent = t('dailyUnavailable'); retryAfter = performance.now() + 15000; }
    finally { loading = false; }
    if (info) tick();
  }
  function tick(): void {
    if (!info) return;
    const remaining = info.resetsAt - (info.serverNow + performance.now() - receivedAt);
    if (remaining <= 0) { if (performance.now() >= retryAfter) void refresh(); return; }
    const progress = readProgress(info.day, ids);
    status.textContent = progress.targetId ? `${t('dailyNext')} ${dailyCountdown(remaining)}`
      : progress.guesses.length ? t('dailyResume') : t('dailyAvailable');
    status.classList.toggle('daily-available', !progress.targetId);
    element('daily-home-link').setAttribute('aria-label', `${t('dailyTitle')}. ${status.textContent}`);
  }
  void refresh(); schedule(tick);
  window.addEventListener('storage', tick);
}

export async function startDaily(atlas: Atlas, globe: Globe, collection: Collection): Promise<void> {
  const countries = new Map(atlas.countries.map(country => [country.id, country]));
  const ids = new Set(countries.keys());
  const form = element<HTMLFormElement>('guess-form');
  const input = element<HTMLInputElement>('country-input');
  const button = element<HTMLButtonElement>('guess-button');
  const feedback = element('feedback'); const panel = element('daily-panel');
  const share = element<HTMLButtonElement>('daily-share'); const shareText = element<HTMLTextAreaElement>('daily-share-text');
  let info: DailyInfo; let progress: DailyProgress; let receivedAt = 0; let busy = true; let loading = false; let storageAvailable = true;
  let error = ''; let copied = false; let retryAfter = 0;
  feedback.removeAttribute('data-i18n');
  panel.hidden = false; form.hidden = false;
  document.querySelector<HTMLElement>('.history-section')!.hidden = false;
  setTranslatedText(element('mode-label'), 'dailyTitle');
  feedback.textContent = t('connecting'); input.disabled = true; button.disabled = true;
  const showGiveUp = bindGiveUp(() => { void giveUp(); });
  function save(): void {
    try { localStorage.setItem(storageKey(progress.day), JSON.stringify(progress)); }
    catch { storageAvailable = false; }
  }
  function mergeSaved(): void {
    const saved = readProgress(progress.day, ids);
    if (saved.targetId || saved.guesses.length > progress.guesses.length) progress = saved;
  }
  function streak(): number {
    let date = Date.parse(`${progress.day}T00:00:00Z`); let count = 0;
    if (!progress.won) date -= dayLength;
    for (let n = 0; n < 366; n++, date -= dayLength) {
      const day = new Date(date).toISOString().slice(0, 10);
      if (!(day === progress.day ? progress : readProgress(day, ids)).won) break;
      count++;
    }
    return count;
  }
  function resultText(): string {
    return `Mundi · ${t('dailyTitle')} · ${progress.day}\n${progress.won ? `✅ ${guessCount(progress.guesses.length)}` : t('dailyNotSolved')}\nhttps://mundi.top/?play=daily`;
  }
  function paint(): void {
    globe.clear();
    for (const guess of progress.guesses) {
      const country = countries.get(guess.countryId);
      if (country) globe.paint(country, getHint(guess.distance, guess.correct, guess.border).color);
    }
    const target = countries.get(progress.targetId ?? '');
    if (target) globe.paint(target, getHint(0, true, false).color);
  }
  function render(): void {
    if (!info) return;
    const done = progress.targetId !== null;
    input.disabled = busy || done; button.disabled = busy || done;
    showGiveUp(!done, !busy);
    element('daily-date').textContent = `${info.day} · ${t('dailyRule')}`;
    element('daily-storage').hidden = storageAvailable;
    element('daily-result-actions').hidden = !done;
    share.textContent = t(copied ? 'copied' : 'dailyShare');
    shareText.value = done ? resultText() : '';
    element('daily-streak').textContent = `${t('dailyStreak')}: ${streak()}`;
    const history = element('guess-history'); history.replaceChildren();
    progress.guesses.forEach((guess, index) => {
      const country = countries.get(guess.countryId)!;
      const entry = document.createElement('li'); entry.className = 'guess-entry';
      entry.dataset.distance = String(guess.distance); entry.dataset.order = String(index + 1); entry.dataset.correct = String(guess.correct);
      const number = document.createElement('span'); number.className = 'guess-number'; number.textContent = String(index + 1).padStart(2, '0');
      const swatch = document.createElement('span'); swatch.className = 'guess-swatch'; swatch.setAttribute('aria-hidden', 'true');
      swatch.style.backgroundColor = getHint(guess.distance, guess.correct, guess.border).color;
      const name = document.createElement('span'); name.className = 'guess-name'; name.append(countryFlag(country), countryName(country));
      const hint = document.createElement('span'); hint.className = 'guess-hint';
      hint.textContent = `${formatDistance(guess.distance, getLanguage())}${guess.correct ? ` · ${t('correct')}` : guess.border ? ` · ${t('border')}` : ''}`;
      entry.append(number, swatch, name, hint); history.prepend(entry);
    });
    applyHistoryOrder(history, progress.won);
    element('guess-count').textContent = guessCount(progress.guesses.length);
    element('empty-history').hidden = progress.guesses.length > 0;
    feedback.className = 'feedback';
    if (error) { feedback.textContent = error; feedback.classList.add('error'); }
    else if (done) renderRoundResult(feedback, countries.get(progress.targetId!)!, t(progress.won ? 'dailyCompleted' : 'gaveUp'), progress.won);
    else {
      const last = progress.guesses.at(-1);
      feedback.textContent = last ? `${countryName(countries.get(last.countryId)!)}: ${formatDistance(last.distance, getLanguage())} ${t(last.border ? 'borderFeedback' : 'distanceFeedback')}` : t('begin');
    }
    tick();
  }
  async function loadDay(): Promise<void> {
    if (loading) return;
    loading = true; busy = true; input.disabled = true; button.disabled = true;
    try {
      info = await request<DailyInfo>('/api/daily'); receivedAt = performance.now();
      progress = readProgress(info.day, ids); error = ''; copied = false; shareText.hidden = true;
      try { localStorage.setItem('mundi-daily-storage-check', '1'); localStorage.removeItem('mundi-daily-storage-check'); }
      catch { storageAvailable = false; }
      input.value = ''; element('country-options').hidden = true; input.setAttribute('aria-expanded', 'false');
      paint();
    } finally { loading = false; busy = false; }
    render();
  }
  function tick(): void {
    if (!info) return;
    const remaining = info.resetsAt - (info.serverNow + performance.now() - receivedAt);
    if (remaining <= 0) {
      if (!busy && performance.now() >= retryAfter) {
        retryAfter = performance.now() + 15000;
        void loadDay().catch(() => { error = t('dailyUnavailable'); render(); });
      }
      return;
    }
    element('daily-countdown').hidden = progress.targetId === null;
    element('daily-countdown').textContent = `${t('dailyNext')} ${dailyCountdown(remaining)}`;
  }
  async function act(body: object, path: string): Promise<unknown> {
    busy = true; error = ''; render();
    try { return await request(path, body); }
    catch (cause) {
      if (cause instanceof Error && cause.message === 'expired') await loadDay();
      error = t('dailyUnavailable'); return null;
    } finally { busy = false; }
  }
  async function guess(country: Country): Promise<void> {
    if (busy || progress.targetId) return;
    mergeSaved();
    if (progress.targetId) { paint(); render(); return; }
    if (progress.guesses.some(guess => guess.countryId === country.id)) { error = t('duplicate'); render(); return; }
    const day = info.day;
    const result = await act({ day, countryId: country.id }, '/api/daily/guess') as Guess | null;
    if (result && info.day === day) {
      mergeSaved();
      if (!progress.targetId && !progress.guesses.some(guess => guess.countryId === result.countryId)) {
        progress.guesses.push(result);
        if (result.correct) { progress.targetId = country.id; progress.won = true; collection.add(country.id); }
      }
      save(); paint();
    }
    render(); if (!progress.targetId) input.focus();
  }
  async function giveUp(): Promise<void> {
    if (busy || progress.targetId) return;
    mergeSaved();
    if (progress.targetId) { paint(); render(); return; }
    const day = info.day;
    const result = await act({ day }, '/api/daily/giveup') as { targetId: string } | null;
    if (result && info.day === day) { mergeSaved(); progress.targetId ??= result.targetId; save(); paint(); }
    render();
  }
  bindCountryInput(atlas.countries, country => { void guess(country); }, message => { error = t(message); render(); });
  share.addEventListener('click', () => {
    void navigator.clipboard?.writeText(resultText()).then(() => { copied = true; render(); })
      .catch(() => { shareText.hidden = false; shareText.focus(); shareText.select(); });
    if (!navigator.clipboard) { shareText.hidden = false; shareText.focus(); shareText.select(); }
  });
  window.addEventListener('storage', event => {
    if (info && !busy && event.key === storageKey(info.day)) { progress = readProgress(info.day, ids); paint(); render(); }
  });
  onLanguageChange(render); schedule(tick);
  try { await loadDay(); }
  catch {
    feedback.textContent = t('dailyUnavailable');
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-button';
    setTranslatedText(retry, 'reload'); retry.addEventListener('click', () => location.reload()); panel.append(retry);
  }
}

