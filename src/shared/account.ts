import { parseDailyProgress } from './daily.js';
import type { DailyProgress } from './daily.js';

export interface FirebaseWebConfig { apiKey: string; authDomain: string; projectId: string; appId: string }
export type Discoveries = Record<string, number | null>;
export function parseDiscoveries(value: unknown, ids: ReadonlySet<string>, now = Date.now()): Discoveries {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, date]) => ids.has(id)
    && (date === null || (typeof date === 'number' && Number.isSafeInteger(date) && date > 0 && date <= now)))
    .sort(([a], [b]) => a.localeCompare(b))) as Discoveries;
}
export function mergeDiscoveries(a: Discoveries, b: Discoveries): Discoveries {
  const result = new Map(Object.entries(a));
  for (const [id, date] of Object.entries(b)) {
    const previous = result.get(id);
    result.set(id, previous == null ? date : date === null ? previous : Math.min(previous, date));
  }
  return Object.fromEntries([...result].sort(([a], [b]) => a.localeCompare(b)));
}
export function normalizeDaily(value: unknown, day: string, ids: ReadonlySet<string>): DailyProgress {
  const p = parseDailyProgress(value, day, ids);
  return { ...p, guesses: p.guesses.map(g => ({ countryId: g.countryId, distance: g.distance,
    border: g.border, correct: g.correct, band: g.correct ? 'correct' : g.border ? 'border' : 'cold' })) };
}
// Conflicting unfinished attempts are kept as a complete history, never concatenated.
// Prefer completion, then a win, then the better winning score or longer unfinished game.
export function mergeDaily(a: DailyProgress, b: DailyProgress): DailyProgress {
  if (a.day !== b.day) throw new Error('Cannot merge different daily challenges');
  const rank = (p: DailyProgress) => p.won ? 2 : p.targetId ? 1 : 0;
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  if (a.guesses.length !== b.guesses.length) return a.won
    ? a.guesses.length < b.guesses.length ? a : b
    : a.guesses.length > b.guesses.length ? a : b;
  return JSON.stringify(a) <= JSON.stringify(b) ? a : b;
}

