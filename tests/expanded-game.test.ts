import { describe, expect, it } from 'vitest';
import { Rooms, RoomError, proximityBand } from '../src/server/rooms.js';
import type { Rules, Seat } from '../src/shared/multiplayer.js';
import { parseCollection } from '../src/shared/collection.js';
import { normalizePlayerName } from '../src/shared/profile.js';

const ids = ['ARG', 'BRA', 'FRA', 'URY', 'CHL', 'PER', 'BOL', 'COL', 'ECU', 'CAN', 'MEX', 'USA'];
function game(rules: Rules) {
  let now = 100000;
  const rooms = new Rooms({ ids, hint(countryId, targetId) {
    const correct = countryId === targetId; const distance = correct ? 0 : countryId === 'URY' ? 0 : 500;
    const border = !correct && distance === 0;
    return { countryId, distance, correct, border, band: proximityBand(distance, correct, border) };
  } }, () => now, choices => choices[0]!);
  const id = rooms.create('p0', rules);
  const count = rules.players ?? 2;
  for (let seat = 1; seat < count; seat++) expect(rooms.join(id, `p${seat}`)).toBe(seat);
  for (let seat = 0; seat < count; seat++) rooms.connect(id, seat as Seat);
  function start() {
    for (let seat = 0; seat < count; seat++) rooms.action(id, seat as Seat, { type: 'ready', value: true, round: 1 });
    now += 3000; rooms.tick();
  }
  const snapshot = (seat: Seat = 0) => rooms.snapshot(id, seat);
  return { rooms, id, start, snapshot, move(ms: number) { now += ms; rooms.tick(); },
    guess(seat: Seat, countryId: string, round = 1) { rooms.action(id, seat, { type: 'guess', countryId, round }); } };
}
function reject(action: () => void, expected: string) {
  let rejected: unknown;
  try { action(); } catch (error) { rejected = error; }
  expect(rejected).toBeInstanceOf(RoomError);
  expect((rejected as RoomError).code).toBe(expected);
}
describe('expanded play', () => {
  it('identifies each shared guess by its authenticated seat after reconnecting and finishing', () => {
    const s = game({ players: 4, play: 'turns', mode: 'free', quota: 8 });
    ['Alex', 'Bea', 'Cam', 'Dani'].forEach((name, seat) => s.rooms.join(s.id, `p${seat}`, name));
    s.start();
    s.guess(0, 'BRA'); s.guess(1, 'FRA'); s.guess(2, 'URY'); s.guess(3, 'CHL');
    s.rooms.disconnect(s.id, 2); s.rooms.connect(s.id, 2);
    for (const seat of [0, 1, 2, 3] as const) {
      const view = s.snapshot(seat);
      expect(view.guesses.map(guess => guess.playerSeat)).toEqual([0, 1, 2, 3]);
      expect(view.guesses.map(guess => view.players[guess.playerSeat]?.name)).toEqual(['Alex', 'Bea', 'Cam', 'Dani']);
      expect(JSON.stringify(view)).not.toMatch(/"ARG"|"credential"|"order"|"p[0-3]"/);
    }
    s.guess(0, 'ARG');
    expect(s.snapshot(3).result?.histories.map(guesses => guesses.map(guess => guess.playerSeat)))
      .toEqual([[0, 0], [1], [2], [3]]);
  });
  it('keeps race guesses private until the result while retaining their authors', () => {
    const s = game({ players: 4, play: 'race', mode: 'free', quota: 8 }); s.start();
    s.guess(0, 'BRA'); s.guess(1, 'FRA'); s.guess(2, 'URY');
    expect(s.snapshot(1).guesses.map(guess => guess.playerSeat)).toEqual([1]);
    expect(s.snapshot(3).guesses).toEqual([]);
    expect(JSON.stringify(s.snapshot(3))).not.toMatch(/"(?:BRA|FRA|URY|ARG)"/);
    s.guess(3, 'ARG');
    expect(s.snapshot().result?.histories.map(guesses => guesses.map(guess => guess.playerSeat)))
      .toEqual([[0], [1], [2], [3]]);
  });
  it('giving up reveals the solo target without awarding a win or a correct guess, and starts a fresh round', () => {
    const s = game({ players: 1, mode: 'free', quota: 8 });
    reject(() => s.rooms.action(s.id, 0, { type: 'giveup', round: 1 }), 'NOT_PLAYING');
    s.start(); s.guess(0, 'BRA');
    expect(s.snapshot().result).toBeNull();
    s.rooms.action(s.id, 0, { type: 'giveup', round: 1 });
    expect(s.snapshot().phase).toBe('finished');
    expect(s.snapshot().result).toMatchObject({ targetId: 'ARG', winner: null, reason: 'giveup' });
    expect(s.snapshot().result?.histories[0]?.map(guess => guess.countryId)).toEqual(['BRA']);
    expect(s.snapshot().result?.histories[0]?.some(guess => guess.correct)).toBe(false);
    reject(() => s.guess(0, 'ARG'), 'NOT_PLAYING');
    reject(() => s.rooms.action(s.id, 0, { type: 'giveup', round: 1 }), 'NOT_PLAYING');
    s.rooms.action(s.id, 0, { type: 'rematch', value: true, round: 1 });
    expect(s.snapshot()).toMatchObject({ phase: 'playing', round: 2, guesses: [], result: null });
    reject(() => s.rooms.action(s.id, 0, { type: 'giveup', round: 1 }), 'STALE_ROUND');
    s.guess(0, 'BRA', 2); expect(s.snapshot().result?.winner).toBe(0);
  });
  it.each(['race', 'turns'] as const)('rejects giving up in multiplayer %s without revealing the target', play => {
    const s = game({ players: 2, play, mode: 'free', quota: 8 }); s.start();
    reject(() => s.rooms.action(s.id, 0, { type: 'giveup', round: 1 }), 'FORBIDDEN');
    expect(s.snapshot()).toMatchObject({ phase: 'playing', result: null, guesses: [] });
    expect(JSON.stringify(s.snapshot())).not.toContain('ARG');
    s.guess(0, 'ARG'); expect(s.snapshot().result?.winner).toBe(0);
  });
  it('shares normalized names, permits lobby edits and retains them during play and rematch', () => {
    const s = game({ players: 2, mode: 'free', quota: 8 });
    s.rooms.join(s.id, 'p0', '  José  M. '); s.rooms.join(s.id, 'p1', 'Lucía_2');
    expect(s.snapshot().players.map(player => player?.name)).toEqual(['José M.', 'Lucía_2']);
    expect(s.snapshot(1).opponent?.name).toBe('José M.');
    s.rooms.join(s.id, 'p0'); expect(s.snapshot().you.name).toBe('José M.');
    s.start(); s.rooms.join(s.id, 'p0', 'Different');
    expect(s.snapshot().you.name).toBe('José M.');
    s.guess(1, 'ARG');
    s.rooms.action(s.id, 0, { type: 'rematch', value: true, round: 1 });
    s.rooms.action(s.id, 1, { type: 'rematch', value: true, round: 1 });
    expect(s.snapshot().players.map(player => player?.name)).toEqual(['José M.', 'Lucía_2']);
    expect(JSON.stringify(s.snapshot())).not.toMatch(/credential|"p0"|"p1"/);
  });
  it('rejects markup, control characters, invisible names and oversized names', () => {
    const s = game({ players: 2, mode: 'free', quota: 8 });
    for (const name of ['<img src=x>', 'Joe\nAdmin', 'Joe\u200b', 'x'.repeat(25)]) {
      expect(normalizePlayerName(name)).toBeNull();
      reject(() => s.rooms.join(s.id, 'p0', name), 'INVALID_REQUEST');
    }
    expect(normalizePlayerName('')).toBe('');
    expect(normalizePlayerName('Ｆａｃｕ')).toBe('Facu');
    expect(s.snapshot().you.name).toBe('');
  });
  it('solo keeps targets private, has no guess deadline and supports a new round', () => {
    const s = game({ players: 1, mode: 'free', quota: 8 }); s.start();
    expect(s.snapshot().endsAt).toBeNull(); expect(s.snapshot().players).toHaveLength(1);
    expect(JSON.stringify(s.snapshot())).not.toContain('ARG');
    s.move(300000); s.guess(0, 'BRA'); expect(s.snapshot().phase).toBe('playing');
    s.guess(0, 'ARG'); expect(s.snapshot().result?.winner).toBe(0);
    s.rooms.action(s.id, 0, { type: 'rematch', value: true, round: 1 }); s.move(3000);
    s.guess(0, 'BRA', 2); expect(s.snapshot().result?.targetId).toBe('BRA');
    reject(() => s.rooms.join(s.id, 'intruder'), 'ROOM_FULL');
  });
  it('four players reserve distinct seats and hide all three rival histories', () => {
    const s = game({ players: 4, mode: 'free', quota: 8 }); s.start();
    for (const seat of [1, 2, 3] as const) s.guess(seat, ids.at(seat)!);
    expect(s.snapshot().players.map(player => player?.count)).toEqual([0, 1, 1, 1]);
    expect(JSON.stringify(s.snapshot())).not.toMatch(/"(?:BRA|FRA|URY|p0|p1)"/);
    reject(() => s.rooms.join(s.id, 'p4'), 'ROOM_FULL');
    s.guess(3, 'ARG'); expect(s.snapshot().result?.winner).toBe(3);
    expect(s.snapshot().result?.histories).toHaveLength(4);
  });
  it('reuses a solo session when returning from the index instead of spending room capacity', () => {
    const s = game({ players: 1, mode: 'free', quota: 8 }); s.start(); s.guess(0, 'BRA');
    s.rooms.disconnect(s.id, 0);
    for (let i = 0; i < 5; i++) expect(s.rooms.create('p0', { players: 1, mode: 'free', quota: 8 })).toBe(s.id);
    s.rooms.connect(s.id, 0); expect(s.snapshot().you.count).toBe(1);
  });
  it('requires every selected seat to be filled and ready before starting', () => {
    const rooms = new Rooms({ ids, hint: () => { throw new Error('Unexpected hint'); } });
    const id = rooms.create('a', { players: 3, mode: 'free', quota: 8 });
    rooms.connect(id, 0); rooms.action(id, 0, { type: 'ready', value: true, round: 1 });
    expect(rooms.snapshot(id, 0).phase).toBe('waiting');
  });
  it('turns share hints, reject out-of-turn play, and keep invalid/duplicate turns', () => {
    const s = game({ players: 3, play: 'turns', mode: 'limited', quota: 5 }); s.start();
    reject(() => s.guess(1, 'ARG'), 'NOT_YOUR_TURN');
    reject(() => s.guess(0, 'XXX'), 'INVALID_REQUEST'); expect(s.snapshot().turn).toBe(0);
    s.guess(0, 'BRA'); expect(s.snapshot(2).guesses.at(0)?.countryId).toBe('BRA');
    expect(s.snapshot().turn).toBe(1); reject(() => s.guess(1, 'BRA'), 'DUPLICATE');
    expect(s.snapshot().turn).toBe(1); expect(s.snapshot(1).you.count).toBe(0);
    s.guess(1, 'ARG'); expect(s.snapshot().result?.winner).toBe(1);
  });
  it('turn timeout survives disconnection and handles delayed ticks fairly', () => {
    const s = game({ players: 4, play: 'turns', mode: 'free', quota: 8 }); s.start();
    s.rooms.disconnect(s.id, 0); s.move(29999); expect(s.snapshot(1).turn).toBe(0);
    s.move(1); expect(s.snapshot(1).turn).toBe(1);
    s.move(60000); expect(s.snapshot(1).turn).toBe(3);
    s.guess(3, 'ARG'); expect(s.snapshot(1).result?.winner).toBe(3);
  });
  it('turns ending without an exact answer are a draw, even with a close guess', () => {
    const s = game({ players: 2, play: 'turns', mode: 'free', quota: 8 }); s.start();
    s.guess(0, 'URY'); s.move(600000);
    expect(s.snapshot().result).toMatchObject({ reason: 'deadline', winner: null });
  });
  it('turns do not disclose the target and quotas count personal guesses', () => {
    const s = game({ players: 2, play: 'turns', mode: 'limited', quota: 5 }); s.start();
    for (let i = 0; i < 10; i++) s.guess((i % 2) as Seat, ids[i + 1]!);
    expect(s.snapshot().result).toMatchObject({ reason: 'quota', winner: null });
    expect(s.snapshot().you.count).toBe(5); expect(s.snapshot(1).you.count).toBe(5);
  });
  it('race deadline ranks all four players instead of only the first two', () => {
    const s = game({ players: 4, mode: 'free', quota: 8 }); s.start();
    s.guess(0, 'BRA'); s.guess(2, 'URY'); s.move(180000);
    expect(s.snapshot().result?.winner).toBe(2);
  });
  it('four-player rematch requires everyone and rotates the first turn', () => {
    const s = game({ players: 4, play: 'turns', mode: 'free', quota: 8 }); s.start(); s.guess(0, 'ARG');
    for (const seat of [0, 1, 2] as const) s.rooms.action(s.id, seat, { type: 'rematch', value: true, round: 1 });
    expect(s.snapshot().phase).toBe('finished');
    s.rooms.action(s.id, 3, { type: 'rematch', value: true, round: 1 }); s.move(3000);
    expect(s.snapshot().turn).toBe(1); expect(s.snapshot().guesses).toEqual([]);
  });
});
describe('stored collection validation', () => {
  it('filters malformed, unknown and duplicate IDs without creating discoveries', () => {
    expect(parseCollection(['ARG', 'XXX', null, {}, 'ARG', 'BRA'], new Set(ids))).toEqual(['ARG', 'BRA']);
    expect(parseCollection({ ARG: true }, new Set(ids))).toEqual([]);
  });
});
