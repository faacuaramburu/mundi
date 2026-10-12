import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { Rooms, RoomError, proximityBand } from '../src/server/rooms.js';
import type { Geography } from '../src/server/rooms.js';
import type { Seat } from '../src/shared/multiplayer.js';
import { normalizeRoomCode, formatRoomCode } from '../src/shared/room-code.js';

const geo: Geography = { ids: ['ARG', 'BRA', 'FRA'], hint(countryId, targetId) {
  const correct = countryId === targetId; const distance = correct ? 0 : 500;
  return { countryId, correct, distance, border: false, band: proximityBand(distance, correct, false) };
} };
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
function setup(players: 2 | 4 = 2, play: 'race' | 'turns' = 'race') {
  let now = 100_000;
  const rooms = new Rooms(geo, () => now, ids => ids[0]!);
  const id = rooms.create('owner', { mode: 'free', quota: 8, players, play }, 'Alex');
  for (let seat = 1; seat < players; seat++) rooms.join(id, `guest-${seat}`, `Player ${seat + 1}`);
  for (let seat = 0; seat < players; seat++) rooms.connect(id, seat as Seat);
  const snapshot = () => rooms.snapshot(id, 0);
  const start = () => {
    for (let seat = 0; seat < players; seat++) rooms.action(id, seat as Seat, { type: 'ready', value: true, round: snapshot().round });
    now += 3000; rooms.tick();
  };
  const next = () => {
    const round = snapshot().round;
    for (let seat = 0; seat < players; seat++) rooms.action(id, seat as Seat, { type: 'rematch', value: true, round });
    now += 3000; rooms.tick();
  };
  return { rooms, id, snapshot, start, next, move(ms: number) { now += ms; } };
}
describe('room codes and lobby scores', () => {
  it('accepts formatted or lowercase codes and rejects ambiguous or oversized input', () => {
    expect(normalizeRoomCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(formatRoomCode('ABCDEFGH')).toBe('ABCD-EFGH');
    for (const value of ['ABCD', 'ABCD-IJKL', 'ABCD-0FGH', 'ABCD/EFGH', 'A'.repeat(100), '__proto__']) expect(normalizeRoomCode(value)).toBeNull();
  });
  it('keeps codes stable across rounds and restores the reserved seat by code', () => {
    const s = setup(); const code = s.snapshot().roomCode!; s.start();
    expect(s.rooms.joinCode(formatRoomCode(code).toLowerCase(), 'owner')).toBe(s.id);
    expect(s.rooms.seat(s.id, 'owner')).toBe(0);
    s.rooms.action(s.id, 0, { type: 'guess', countryId: 'ARG', round: 1 }); s.next();
    expect(s.snapshot().roomCode).toBe(code);
    expect(() => s.rooms.joinCode(code, 'stranger')).toThrowError(new RoomError('ROOM_FULL'));
    s.move(31 * 60_000);
    expect(() => s.rooms.joinCode(code, 'owner')).toThrowError(new RoomError('ROOM_GONE', 404));
  });
  it('counts each completed round once, retains scores through rematches/reconnects, and resets a new lobby', () => {
    const s = setup(4); s.start();
    s.rooms.action(s.id, 2, { type: 'guess', countryId: 'ARG', round: 1 });
    for (let repeat = 0; repeat < 4; repeat++) { s.rooms.tick(); expect(s.snapshot().players.map(player => player?.wins)).toEqual([0, 0, 1, 0]); }
    expect(() => s.rooms.action(s.id, 1, { type: 'guess', countryId: 'ARG', round: 1 })).toThrow();
    s.next(); expect(s.snapshot().players.map(player => player?.wins)).toEqual([0, 0, 1, 0]);
    s.rooms.action(s.id, 0, { type: 'guess', countryId: 'BRA', round: 2 });
    s.rooms.disconnect(s.id, 2); s.rooms.connect(s.id, 2);
    expect(s.rooms.snapshot(s.id, 2).you.wins).toBe(1);
    expect(s.snapshot().players.map(player => player?.wins)).toEqual([1, 0, 1, 0]);
    const fresh = s.rooms.create('owner', { mode: 'free', quota: 8 });
    expect(s.rooms.snapshot(fresh, 0).you.wins).toBe(0);
    expect(s.rooms.snapshot(fresh, 0).roomCode).not.toBe(s.snapshot().roomCode);
  });
  it('gives no points for a draw and credits the actual winning turn or closest player', () => {
    const draw = setup(); draw.start(); draw.move(180_000);
    expect(draw.snapshot().result?.winner).toBeNull(); expect(draw.snapshot().players.map(player => player?.wins)).toEqual([0, 0]);
    const timed = setup(); timed.start(); timed.rooms.action(timed.id, 1, { type: 'guess', countryId: 'BRA', round: 1 }); timed.move(180_000);
    expect(timed.snapshot().players.map(player => player?.wins)).toEqual([0, 1]);
    const turns = setup(4, 'turns'); turns.start();
    turns.rooms.action(turns.id, 0, { type: 'guess', countryId: 'FRA', round: 1 });
    turns.rooms.action(turns.id, 1, { type: 'guess', countryId: 'ARG', round: 1 });
    expect(turns.snapshot().players.map(player => player?.wins)).toEqual([0, 1, 0, 0]);
  });
  it('joins by code over HTTP with the same cookie security, slot limits and input validation as invite links', async () => {
    const rooms = new Rooms(geo); const config = loadConfig({ NODE_ENV: 'test' }); const app = createApp(config, false, rooms); apps.push(app);
    const post = (url: string, payload: object, cookie?: string, origin = config.origin) => app.inject({ method: 'POST', url, payload, headers: { origin, ...(cookie ? { cookie } : {}) } });
    const created = await post('/api/rooms', { mode: 'free', quota: 8, name: 'Alex' });
    const id = created.json().roomId as string; const code = rooms.snapshot(id, 0).roomCode!;
    const joined = await post('/api/rooms/join', { code: formatRoomCode(code).toLowerCase(), name: 'Bea' });
    expect(joined.statusCode).toBe(200); expect(joined.json()).toEqual({ roomId: id });
    const cookie = String(joined.headers['set-cookie']); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict');
    expect(rooms.snapshot(id, 1).you).toMatchObject({ name: 'Bea', wins: 0 });
    expect((await post('/api/rooms/join', { code }, cookie.split(';')[0]!)).statusCode).toBe(200);
    expect((await post('/api/rooms/join', { code })).statusCode).toBe(409);
    expect((await post('/api/rooms/join', { code, wins: 99 })).statusCode).toBe(400);
    expect((await post('/api/rooms/join', { code, seat: 0 })).statusCode).toBe(400);
    expect((await post('/api/rooms/join', { code }, undefined, 'https://evil.example')).statusCode).toBe(403);
    expect((await post('/api/rooms/join', { code: 'ABCD/EFGH' })).statusCode).toBe(400);
    const absent = code === 'ABCDEFGH' ? 'BBBBBBBB' : 'ABCDEFGH';
    expect((await post('/api/rooms/join', { code: absent })).statusCode).toBe(404);
  });
  it('bounds attempts to find a room by code and never gives solo rounds a code', async () => {
    const rooms = new Rooms(geo); const config = loadConfig({ NODE_ENV: 'test' }); const app = createApp(config, false, rooms); apps.push(app);
    for (let attempt = 0; attempt < 12; attempt++) expect((await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { origin: config.origin }, payload: { code: 'ABCDEFGH' } })).statusCode).toBe(404);
    const limited = await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { origin: config.origin }, payload: { code: 'ABCDEFGH' } });
    expect(limited.statusCode).toBe(429); expect(limited.json()).toEqual({ error: 'RATE_LIMIT' });
    const solo = rooms.create('solo', { players: 1, mode: 'free', quota: 8 });
    expect(rooms.snapshot(solo, 0).roomCode).toBeNull();
  });
});
