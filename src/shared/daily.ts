import type { Guess } from './multiplayer.js';

export const dayLength = 86_400_000;
export interface DailyInfo { day: string; serverNow: number; resetsAt: number }
export interface DailyProgress { day: string; guesses: Guess[]; targetId: string | null; won: boolean }
export function dailyInfo(now: number): DailyInfo {
  return { day: new Date(now).toISOString().slice(0, 10), serverNow: now,
    resetsAt: (Math.floor(now / dayLength) + 1) * dayLength };
}
export function dailyCountdown(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
// Storage is untrusted and optional. Keep at most one catalog's worth of guesses.
export function parseDailyProgress(value: unknown, day: string, ids: ReadonlySet<string>): DailyProgress {
  const empty: DailyProgress = { day, guesses: [], targetId: null, won: false };
  if (!value || typeof value !== 'object') return empty;
  const p = value as Partial<DailyProgress>;
  if (p.day !== day || !Array.isArray(p.guesses) || p.guesses.length > ids.size || typeof p.won !== 'boolean') return empty;
  const seen = new Set<string>();
  for (const guess of p.guesses) {
    if (!guess || !ids.has(guess.countryId) || seen.has(guess.countryId) || !Number.isFinite(guess.distance)
      || guess.distance < 0 || guess.distance > 21000 || typeof guess.correct !== 'boolean' || typeof guess.border !== 'boolean'
      || (guess.correct && guess !== p.guesses.at(-1))) return empty;
    seen.add(guess.countryId);
  }
  if (p.targetId !== null && (typeof p.targetId !== 'string' || !ids.has(p.targetId))) return empty;
  if (p.won !== Boolean(p.guesses.at(-1)?.correct) || (p.won && p.targetId !== p.guesses.at(-1)?.countryId)) return empty;
  return { day, guesses: p.guesses, targetId: p.targetId, won: p.won };
}

