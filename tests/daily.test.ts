import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { loadGeography } from '../src/server/geography.js';
import { dailyTarget, registerDaily } from '../src/server/daily.js';
import { dailyCountdown, dailyInfo, parseDailyProgress } from '../src/shared/daily.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
describe('daily challenge', () => {
  it('uses a single UTC rollover for everyone', () => {
    const end = dailyInfo(Date.parse('2026-11-01T23:59:59.999Z'));
    const next = dailyInfo(end.resetsAt);
    expect(end.day).toBe('2026-11-01'); expect(next.day).toBe('2026-11-02');
    expect(end.resetsAt).toBe(next.serverNow);
    expect(dailyCountdown(22 * 3600000 + 14 * 60000)).toBe('22 h 14 min');
    expect(dailyCountdown(-1)).toBe('0 h 01 min');
  });
  it('keeps the target on the server, returns hints, and rejects yesterday at midnight', async () => {
    let now = Date.parse('2026-11-01T23:59:59Z');
    const app = Fastify(); apps.push(app);
    const geography = loadGeography(); registerDaily(app, geography, () => now);
    const target = dailyTarget('2026-11-01', geography.ids);
    expect(dailyTarget('2026-11-01', [...geography.ids].reverse())).toBe(target);
    const info = await app.inject('/api/daily');
    expect(info.json()).toEqual(dailyInfo(now)); expect(info.body).not.toContain(target);
    const other = geography.ids.find(id => id !== target)!;
    const guess = await app.inject({ method: 'POST', url: '/api/daily/guess', payload: { day: '2026-11-01', countryId: other } });
    expect(guess.json()).toEqual(geography.hint(other, target)); expect(guess.body).not.toContain(target);
    const win = await app.inject({ method: 'POST', url: '/api/daily/guess', payload: { day: '2026-11-01', countryId: target } });
    expect(win.json()).toMatchObject({ correct: true, distance: 0 });
    const reveal = await app.inject({ method: 'POST', url: '/api/daily/giveup', payload: { day: '2026-11-01' } });
    expect(reveal.json()).toEqual({ targetId: target });
    now += 1000;
    const expired = await app.inject({ method: 'POST', url: '/api/daily/guess', payload: { day: '2026-11-01', countryId: target } });
    expect(expired.statusCode).toBe(409);
  });
  it('applies existing origin checks and validation to daily endpoints', async () => {
    const app = createApp(loadConfig({ NODE_ENV: 'test' }), false); apps.push(app);
    const payload = { day: dailyInfo(Date.now()).day, countryId: 'USA' };
    const foreign = await app.inject({ method: 'POST', url: '/api/daily/guess', headers: { origin: 'https://other.example' }, payload });
    expect(foreign.statusCode).toBe(403);
    const headers = { origin: 'http://localhost:3000' };
    for (const body of [{ ...payload, countryId: 'ZZZ' }, { ...payload, targetId: 'USA' }]) {
      const invalid = await app.inject({ method: 'POST', url: '/api/daily/guess', headers, payload: body });
      expect(invalid.statusCode).toBe(400);
    }
    const future = await app.inject({ method: 'POST', url: '/api/daily/giveup', headers, payload: { day: '2099-01-01' } });
    expect(future.statusCode).toBe(409);
    const valid = await app.inject({ method: 'POST', url: '/api/daily/guess', headers, payload });
    expect(valid.statusCode).toBe(200); expect(valid.headers['cache-control']).toBe('no-store');
  });
  it('restores completion and rejects corrupt or duplicate saved guesses', () => {
    const ids = new Set(['USA', 'CAN']); const day = '2026-11-01';
    const guess = { countryId: 'USA', correct: true, border: false, distance: 0, band: 'correct' };
    const progress = { day, guesses: [guess], targetId: 'USA', won: true };
    expect(parseDailyProgress(progress, day, ids)).toEqual(progress);
    for (const invalid of [{ ...progress, day: '2026-10-31' }, { ...progress, guesses: [guess, guess] },
      { ...progress, targetId: null }, { ...progress, guesses: [{ ...guess, distance: -1 }] }]) {
      expect(parseDailyProgress(invalid, day, ids).guesses).toEqual([]);
    }
  });
});

