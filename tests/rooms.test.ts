import { describe, expect, it } from 'vitest';
import { Rooms, RoomError, hashCredential, proximityBand } from '../src/server/rooms.js';
import type { Geography } from '../src/server/rooms.js';
import type { Rules, Seat } from '../src/shared/multiplayer.js';
import { parseAction } from '../src/server/multiplayer.js';
import { loadGeography } from '../src/server/geography.js';

const ids = ['ARG', 'URY', 'BRA', 'FRA', 'CHL', 'PER', 'BOL', 'COL', 'ECU', 'MEX', 'CAN'];
const geo: Geography = { ids, hint(countryId, targetId) {
  const distance = countryId === targetId || countryId === 'URY' ? 0 : countryId === 'FRA' ? 1000 : 500;
  const correct = countryId === targetId; const border = countryId === 'URY' && !correct;
  return { countryId, distance, correct, border, band: proximityBand(distance, correct, border) };
} };
function setup(rules: Rules = { mode: 'limited', quota: 5 }) {
  let time = 1_000_000;
  const rooms = new Rooms(geo, () => time, choices => choices[0]!);
  const id = rooms.create('creator', rules); rooms.join(id, 'guest');
  rooms.connect(id, 0); rooms.connect(id, 1);
  const guess = (seat: Seat, countryId: string, round = 1) => rooms.action(id, seat, { type: 'guess', countryId, round });
  const start = () => {
    rooms.action(id, 0, { type: 'ready', value: true, round: 1 }); rooms.action(id, 1, { type: 'ready', value: true, round: 1 });
    time += 3000; rooms.tick();
  };
  return { rooms, id, guess, start, move: (ms: number) => { time += ms; }, snapshot: (seat: Seat = 0) => rooms.snapshot(id, seat) };
}
function code(action: () => unknown, expected: string): void {
  try { action(); throw new Error('Expected rejection'); } catch (error) { expect(error).toBeInstanceOf(RoomError); expect((error as RoomError).code).toBe(expected); }
}
describe('authoritative rooms', () => {
  it('reserves exactly two seats and authenticates refreshes', () => {
    const s = setup(); expect(s.rooms.join(s.id, 'creator')).toBe(0); expect(s.rooms.join(s.id, 'guest')).toBe(1);
    code(() => s.rooms.join(s.id, 'intruder'), 'ROOM_FULL'); code(() => s.rooms.seat(s.id, 'intruder'), 'UNAUTHORIZED');
    code(() => s.rooms.connect(s.id, 0), 'ALREADY_CONNECTED');
    expect(hashCredential('session')).not.toContain('session');
  });
  it('requires both ready and rejects guesses throughout the countdown', () => {
    const s = setup(); code(() => s.guess(0, 'ARG'), 'NOT_PLAYING');
    s.rooms.action(s.id, 0, { type: 'ready', value: true, round: 1 }); expect(s.snapshot().phase).toBe('waiting');
    s.rooms.action(s.id, 1, { type: 'ready', value: true, round: 1 });
    s.move(2999); code(() => s.guess(0, 'ARG'), 'NOT_PLAYING'); s.move(1); s.guess(0, 'ARG'); expect(s.snapshot().result?.winner).toBe(0);
  });
  it('cancels a disconnected countdown and requires fresh confirmation', () => {
    const s = setup(); s.rooms.action(s.id, 0, { type: 'ready', value: true, round: 1 }); s.rooms.action(s.id, 1, { type: 'ready', value: true, round: 1 });
    s.rooms.disconnect(s.id, 1); expect(s.snapshot().phase).toBe('waiting'); expect(s.snapshot().you.ready).toBe(false);
    s.move(5000); code(() => s.guess(0, 'ARG'), 'NOT_PLAYING');
  });
  it('keeps clocks running on disconnect at the exact start time', () => {
    const s = setup({ mode: 'free', quota: 8 });
    s.rooms.action(s.id, 0, { type: 'ready', value: true, round: 1 }); s.rooms.action(s.id, 1, { type: 'ready', value: true, round: 1 });
    s.move(3000); s.rooms.disconnect(s.id, 1); expect(s.snapshot().phase).toBe('playing');
    const deadline = s.snapshot().endsAt; s.move(180_000); expect(s.snapshot().result?.reason).toBe('deadline'); expect(s.snapshot().endsAt).toBe(deadline);
  });
  it('keeps the target, credentials, matrix and rival guesses out of active snapshots', () => {
    const s = setup(); s.start(); s.guess(0, 'FRA'); s.guess(1, 'BRA');
    const own = s.snapshot(); const rival = s.snapshot(1);
    expect(JSON.stringify(own)).not.toMatch(/ARG|BRA|creator|guest|credential|matrix|"order"/);
    expect(JSON.stringify(rival)).not.toContain('FRA'); expect(own.opponent?.count).toBe(1); expect(own.opponent?.bestBand).toBe('hot');
    expect(own.result).toBeNull(); s.guess(1, 'ARG'); expect(s.snapshot().result?.histories[1]).toHaveLength(2);
  });
  it('a zero-distance border is not a win; first accepted correct guess wins', () => {
    const s = setup(); s.start(); s.guess(0, 'URY'); expect(s.snapshot().phase).toBe('playing');
    s.guess(1, 'ARG'); code(() => s.guess(0, 'ARG'), 'NOT_PLAYING'); expect(s.snapshot().result?.winner).toBe(1);
  });
  it('duplicates and invalid guesses consume neither quota nor inactivity time', () => {
    const s = setup(); s.start(); s.guess(0, 'BRA'); const cutoff = s.snapshot().idleEndsAt;
    s.move(5000); code(() => s.guess(0, 'BRA'), 'DUPLICATE'); code(() => s.guess(0, 'XXX'), 'INVALID_REQUEST');
    expect(s.snapshot().you.remaining).toBe(4); expect(s.snapshot().idleEndsAt).toBe(cutoff);
    s.move(55_000); code(() => s.guess(0, 'ARG'), 'NOT_PLAYING'); expect(s.snapshot().result?.reason).toBe('inactive');
  });
  it('one exhausted quota leaves the opponent playing; both exhausted finish', () => {
    const s = setup(); s.start(); for (const id of ['BRA', 'FRA', 'CHL', 'PER', 'BOL']) s.guess(0, id);
    expect(s.snapshot().phase).toBe('playing'); code(() => s.guess(0, 'COL'), 'QUOTA');
    for (const id of ['FRA', 'BRA', 'CHL', 'PER', 'BOL']) s.guess(1, id);
    expect(s.snapshot().result).toMatchObject({ reason: 'quota', winner: 0 });
  });
  it('breaks distance ties by the guess number, before arrival order', () => {
    const s = setup(); s.start(); s.guess(0, 'FRA'); s.guess(0, 'BRA'); s.guess(1, 'CHL'); s.move(60_000);
    expect(s.snapshot().result?.winner).toBe(1);
  });
  it('breaks equal distance/guess-number ties by server arrival', () => {
    const s = setup(); s.start(); s.guess(1, 'BRA'); s.guess(0, 'CHL'); s.move(60_000); expect(s.snapshot().result?.winner).toBe(1);
  });
  it('ranks any guess ahead of no guesses; no guesses is a draw', () => {
    const s = setup(); s.start(); s.guess(1, 'FRA'); s.move(60_000); expect(s.snapshot().result?.winner).toBe(1);
    const draw = setup(); draw.start(); draw.move(60_000); expect(draw.snapshot().result?.winner).toBeNull();
  });
  it('rejects a correct guess at or after the three-minute deadline', () => {
    const s = setup({ mode: 'free', quota: 8 }); s.start(); s.guess(0, 'BRA'); s.move(180_000);
    code(() => s.guess(1, 'ARG'), 'NOT_PLAYING'); expect(s.snapshot().result).toMatchObject({ winner: 0, reason: 'deadline' });
  });
  it('uses the earliest elapsed cutoff after a delayed timer', () => {
    const s = setup(); s.start(); s.move(190_000); expect(s.snapshot().result?.reason).toBe('inactive');
  });
  it('retains guesses, quota and player rate limits across reconnect', () => {
    const s = setup(); s.start(); s.guess(0, 'BRA');
    for (let i = 0; i < 18; i++) code(() => s.guess(0, 'BRA'), 'DUPLICATE');
    s.rooms.disconnect(s.id, 0); s.rooms.connect(s.id, 0); expect(s.snapshot().guesses).toHaveLength(1);
    code(() => s.guess(0, 'ARG'), 'RATE_LIMIT'); s.move(10_000); s.guess(0, 'ARG');
  });
  it('requires both rematch votes, changes the target and rejects stale-round guesses', () => {
    const s = setup(); s.start(); s.guess(0, 'ARG');
    s.rooms.action(s.id, 0, { type: 'rematch', value: true, round: 1 }); expect(s.snapshot().phase).toBe('finished');
    s.rooms.action(s.id, 1, { type: 'rematch', value: true, round: 1 }); expect(s.snapshot().phase).toBe('countdown'); expect(s.snapshot().guesses).toEqual([]);
    s.move(3000); code(() => s.guess(0, 'ARG'), 'STALE_ROUND'); s.guess(0, 'URY', 2); expect(s.snapshot().result?.targetId).toBe('URY');
  });
  it('expires rooms and enforces bounded room creation', () => {
    const s = setup(); s.move(30 * 60_000); expect(s.rooms.tick()).toContain(s.id); code(() => s.snapshot(), 'ROOM_GONE');
    const rooms = new Rooms(geo, Date.now, ids => ids[0]!, 1); rooms.create('a', { mode: 'free', quota: 8 }); code(() => rooms.create('b', { mode: 'free', quota: 8 }), 'CAPACITY');
  });
  it('replaces abandoned lobbies instead of blocking the fourth room', () => {
    const rooms = new Rooms(geo); const rules: Rules = { mode: 'free', quota: 8 };
    const first = rooms.create('creator', rules);
    const second = rooms.create('creator', rules);
    const third = rooms.create('creator', rules);
    const fourth = rooms.create('creator', rules);
    code(() => rooms.snapshot(first, 0), 'ROOM_GONE');
    for (const id of [second, third, fourth]) expect(rooms.snapshot(id, 0).phase).toBe('waiting');
    expect(rooms.resumable('creator')).toBe(fourth);
  });
  it('reclaims only the creator\'s abandoned rooms at global capacity', () => {
    const rooms = new Rooms(geo, Date.now, ids => ids[0]!, 2);
    const own = rooms.create('creator', { mode: 'free', quota: 8 });
    const other = rooms.create('guest', { mode: 'free', quota: 8 });
    code(() => rooms.create('stranger', { mode: 'free', quota: 8 }), 'CAPACITY');
    const replacement = rooms.create('creator', { mode: 'free', quota: 8 });
    code(() => rooms.snapshot(own, 0), 'ROOM_GONE');
    expect(rooms.snapshot(other, 0).phase).toBe('waiting');
    expect(rooms.snapshot(replacement, 0).phase).toBe('waiting');
  });
  it('preserves reconnectable lobbies until the player needs another room', () => {
    const rooms = new Rooms(geo); const rules: Rules = { mode: 'free', quota: 8 };
    const id = rooms.create('creator', rules); rooms.connect(id, 0); rooms.disconnect(id, 0);
    rooms.create('creator', rules);
    expect(rooms.join(id, 'creator')).toBe(0); rooms.connect(id, 0);
    expect(rooms.snapshot(id, 0).you.connected).toBe(true);
  });
  it('does not let a guest delete rooms owned by other players to bypass capacity', () => {
    const rooms = new Rooms(geo); const rules: Rules = { mode: 'free', quota: 8 };
    const ids = Array.from({ length: 3 }, (_, index) => {
      const id = rooms.create(`owner-${index}`, rules); rooms.join(id, 'guest'); return id;
    });
    code(() => rooms.create('guest', rules), 'CAPACITY');
    for (const id of ids) expect(rooms.snapshot(id, 0).phase).toBe('waiting');
  });
  it('does not discard a lobby while another player is still connected', () => {
    const rooms = new Rooms(geo); const rules: Rules = { mode: 'free', quota: 8 };
    const ids = Array.from({ length: 3 }, (_, index) => {
      const id = rooms.create('creator', rules); rooms.join(id, `guest-${index}`); rooms.connect(id, 1); return id;
    });
    code(() => rooms.create('creator', rules), 'CAPACITY');
    for (const id of ids) expect(rooms.snapshot(id, 1).you.connected).toBe(true);
    rooms.disconnect(ids[0]!, 1);
    expect(rooms.create('creator', rules)).not.toBe(ids[0]);
    for (const id of ids.slice(1)) expect(rooms.snapshot(id, 1).you.connected).toBe(true);
  });
  it('preserves ongoing rounds even when every player temporarily disconnects', () => {
    const s = setup({ mode: 'free', quota: 8 }); s.start(); s.guess(0, 'BRA');
    s.rooms.disconnect(s.id, 0); s.rooms.disconnect(s.id, 1);
    s.rooms.create('creator', { mode: 'free', quota: 8 });
    s.rooms.create('creator', { mode: 'free', quota: 8 });
    s.rooms.create('creator', { mode: 'free', quota: 8 });
    s.rooms.connect(s.id, 0);
    expect(s.snapshot()).toMatchObject({ phase: 'playing', guesses: [{ countryId: 'BRA' }] });
  });
  it('reclaims finished rooms after everyone leaves and keeps their live results', () => {
    const s = setup({ mode: 'free', quota: 8 }); s.start(); s.guess(0, 'ARG');
    s.rooms.create('creator', { mode: 'free', quota: 8 });
    s.rooms.create('creator', { mode: 'free', quota: 8 });
    s.rooms.create('creator', { mode: 'free', quota: 8 });
    expect(s.snapshot().result?.winner).toBe(0);
    s.rooms.disconnect(s.id, 0); s.rooms.disconnect(s.id, 1);
    s.rooms.create('creator', { mode: 'free', quota: 8 });
    code(() => s.snapshot(), 'ROOM_GONE');
  });
  it('keeps a rematch alive past the previous result retention window', () => {
    const s = setup({ mode: 'free', quota: 8 }); s.start(); s.guess(0, 'ARG');
    const oldExpiry = s.snapshot().expiresAt;
    s.move(9 * 60_000);
    for (const seat of [0, 1] as const) s.rooms.action(s.id, seat, { type: 'rematch', value: true, round: 1 });
    s.move(3000); s.rooms.tick(); s.move(61_000); s.rooms.tick();
    const view = s.snapshot();
    expect(view.serverNow).toBeGreaterThan(oldExpiry);
    expect(view).toMatchObject({ phase: 'playing', round: 2, result: null });
    s.guess(1, 'URY', 2); expect(s.snapshot().result?.winner).toBe(1);
  });
  it('keeps consecutive rounds alive beyond the original thirty-minute lifetime', () => {
    const s = setup({ mode: 'free', quota: 8 }); s.start();
    for (let round = 1; round <= 16; round++) {
      s.move(120_000); s.rooms.tick();
      s.guess(0, round % 2 ? 'ARG' : 'URY', round);
      expect(s.snapshot().result?.reason).toBe('correct');
      for (const seat of [0, 1] as const) s.rooms.action(s.id, seat, { type: 'rematch', value: true, round });
      s.move(3000); s.rooms.tick();
    }
    expect(s.snapshot()).toMatchObject({ phase: 'playing', round: 17 });
  });
  it('does not expire a round started near the lobby expiry', () => {
    const s = setup({ mode: 'free', quota: 8 }); s.move(29 * 60_000); s.start();
    s.move(90_000); s.rooms.tick();
    expect(s.snapshot().phase).toBe('playing'); s.guess(0, 'ARG');
    s.move(10 * 60_000 - 1); s.rooms.tick(); expect(s.snapshot().phase).toBe('finished');
    s.move(1); expect(s.rooms.tick()).toContain(s.id); code(() => s.snapshot(), 'ROOM_GONE');
  });
  it('renews unlimited solo play only for accepted guesses', () => {
    let time = 1_000_000;
    const rooms = new Rooms(geo, () => time, choices => choices[0]!);
    const id = rooms.create('solo', { players: 1, mode: 'free', quota: 8 });
    rooms.connect(id, 0); rooms.action(id, 0, { type: 'ready', value: true, round: 1 });
    time += 29 * 60_000;
    rooms.action(id, 0, { type: 'guess', countryId: 'BRA', round: 1 });
    time += 2 * 60_000; rooms.tick(); expect(rooms.snapshot(id, 0).phase).toBe('playing');
    const expiresAt = rooms.snapshot(id, 0).expiresAt;
    code(() => rooms.action(id, 0, { type: 'guess', countryId: 'BRA', round: 1 }), 'DUPLICATE');
    code(() => rooms.action(id, 0, { type: 'guess', countryId: 'XXX', round: 1 }), 'INVALID_REQUEST');
    expect(rooms.snapshot(id, 0).expiresAt).toBe(expiresAt);
    time = expiresAt; rooms.tick(); code(() => rooms.snapshot(id, 0), 'ROOM_GONE');
  });
  it('validates actual geography without exposing the matrix to the client', () => {
    const actual = loadGeography(); expect(actual.ids).toHaveLength(195); expect(actual.hint('URY', 'ARG')).toMatchObject({ distance: 0, border: true, correct: false });
    expect(actual.hint('BRA', 'FRA').border).toBe(false);
  });
});
describe('socket action schema', () => {
  it('requires a positive numeric round and no extra fields for giving up', () => {
    expect(parseAction({ type: 'giveup', round: 1 })).toEqual({ type: 'giveup', round: 1 });
    for (const value of [{ type: 'giveup' }, { type: 'giveup', round: '1' }, { type: 'giveup', round: 0 },
      { type: 'giveup', round: 1.5 }, { type: 'giveup', round: 1, seat: 0 }]) {
      code(() => parseAction(value), 'INVALID_REQUEST');
    }
  });
  it.each([null, [], {}, { type: 'guess', countryId: 'ARG', round: '1' }, { type: 'guess', countryId: 'ARG', round: 1, seat: 0 },
    { type: 'guess', countryId: 'ARG', round: 1, timestamp: 0 }, { type: 'ready', value: 'true', round: 1 }, { type: 'guess', countryId: '../', round: 1 }])('rejects malformed/extra fields: %j', value => {
    code(() => parseAction(value), 'INVALID_REQUEST');
  });
});
