import type { Discoveries } from '../shared/account.js';
import { mergeDaily, mergeDiscoveries, normalizeDaily, parseDiscoveries } from '../shared/account.js';
import type { DailyProgress } from '../shared/daily.js';
import { dayLength } from '../shared/daily.js';
import { normalizePlayerName } from '../shared/profile.js';
import { progressGet, progressKeys, progressRemove, progressSet, restoreProgress } from './progress-storage.js';

export interface LocalAccountProgress { discoveries: Discoveries; daily: Map<string, DailyProgress>; name: string; nameUpdatedAt: number }
function json(key: string, scope: string | null): unknown {
  try { return JSON.parse(progressGet(key, scope) ?? 'null') as unknown; } catch { return null; }
}
export function validDailyDay(day: string, now = Date.now()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`))
    && day >= new Date(now - 366 * dayLength).toISOString().slice(0, 10)
    && day <= new Date(now + dayLength).toISOString().slice(0, 10);
}
export function readAccountProgress(scope: string | null, ids: ReadonlySet<string>): LocalAccountProgress {
  const savedIds = json('mundi-collection-v1', scope);
  const dates = json('mundi-collection-dates-v1', scope);
  const datesById = new Map(Array.isArray(dates) ? dates.filter((entry): entry is [string, number] => Array.isArray(entry) && entry.length === 2) : []);
  const discoveries = parseDiscoveries(Object.fromEntries(Array.isArray(savedIds)
    ? savedIds.filter((id): id is string => typeof id === 'string' && ids.has(id)).map(id => {
      const date = datesById.get(id);
      return [id, typeof date === 'number' && Number.isSafeInteger(date) && date > 0 && date <= Date.now() ? date : null];
    }) : []), ids);
  const daily = new Map<string, DailyProgress>();
  for (const key of progressKeys(scope)) {
    const day = key.slice('mundi-daily-v1:'.length);
    if (!validDailyDay(day)) continue;
    const p = normalizeDaily(json(key, scope), day, ids);
    if (p.guesses.length || p.targetId) daily.set(day, p);
  }
  const rawNameDate = Number(progressGet('mundi-player-name-updated-at', scope));
  return { discoveries, daily, name: normalizePlayerName(progressGet('mundi-player-name', scope) ?? '') ?? '',
    nameUpdatedAt: Number.isSafeInteger(rawNameDate) && rawNameDate >= 0 && rawNameDate <= Date.now() ? rawNameDate : 0 };
}
export function storeAccountProgress(scope: string, next: LocalAccountProgress, notify = true, durable = false): void {
  let changed = false;
  const set = (key: string, value: string) => {
    if (!durable && progressGet(key, scope) === value) return;
    progressSet(key, value, false, scope); changed = true;
  };
  set('mundi-collection-v1', JSON.stringify(Object.keys(next.discoveries)));
  set('mundi-collection-dates-v1', JSON.stringify(Object.entries(next.discoveries).filter(([, date]) => date !== null)));
  set('mundi-player-name', next.name);
  set('mundi-player-name-updated-at', String(next.nameUpdatedAt));
  for (const [day, p] of next.daily) set(`mundi-daily-v1:${day}`, JSON.stringify(p));
  if (notify && changed) restoreProgress();
}
export function importGuestProgress(uid: string, ids: ReadonlySet<string>): void {
  const guest = readAccountProgress(null, ids); const account = readAccountProgress(uid, ids);
  const next = { ...account, discoveries: mergeDiscoveries(account.discoveries, guest.discoveries), daily: new Map(account.daily) };
  for (const [day, p] of guest.daily) next.daily.set(day, mergeDaily(account.daily.get(day) ?? { day, guesses: [], won: false, targetId: null }, p));
  if (guest.name && (!account.name || guest.nameUpdatedAt > account.nameUpdatedAt)) { next.name = guest.name; next.nameUpdatedAt = guest.nameUpdatedAt; }
  // Only consume guest data after it is safely copied into this account's local cache.
  storeAccountProgress(uid, next, false, true);
  for (const key of ['mundi-collection-v1', 'mundi-collection-dates-v1', 'mundi-player-name', 'mundi-player-name-updated-at', ...progressKeys(null)]) progressRemove(key, null);
}

