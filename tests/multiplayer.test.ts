import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { loadGeography } from '../src/server/geography.js';
import { Rooms } from '../src/server/rooms.js';
import type { ServerMessage, Snapshot } from '../src/shared/multiplayer.js';

const apps: FastifyInstance[] = [];
const clients: WebSocket[] = [];
const origin = 'http://localhost:3000';
async function setup(production = false) {
  let time = Date.now();
  const rooms = new Rooms(loadGeography(), () => time, ids => ids.includes('ARG') ? 'ARG' : ids[0]!);
  const config = loadConfig(production ? { NODE_ENV: 'production', APP_ORIGIN: 'https://example.com' } : { NODE_ENV: 'test' });
  const app = createApp(config, false, rooms); apps.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address(); if (!address || typeof address === 'string') throw new Error('Missing test server');
  const base = `ws://127.0.0.1:${address.port}`;
  const post = (url: string, payload: object, cookie?: string, requestOrigin = config.origin) => app.inject({ method: 'POST', url, payload,
    headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}) } });
  const created = await post('/api/rooms', { mode: 'limited', quota: 8 });
  const roomId = (created.json() as { roomId: string }).roomId;
  const cookie = String(created.headers['set-cookie']).split(';')[0]!;
  return { app, post, roomId, cookie, base, rooms, move: (ms: number) => { time += ms; } };
}
async function connect(url: string, cookie?: string, requestOrigin = origin) {
  const messages: ServerMessage[] = [];
  const socket = new WebSocket(url, { headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}) } }); clients.push(socket);
  socket.on('message', bytes => { messages.push(JSON.parse(bytes.toString()) as ServerMessage); });
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.on('error', () => { /* Termination during cleanup is expected. */ });
  return { socket, messages, async until(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const found = messages.find(predicate); if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Expected socket message did not arrive');
  } };
}
async function rejectedUpgrade(url: string, cookie: string | undefined, requestOrigin: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}) } }); clients.push(socket);
    socket.on('error', () => { /* Rejected upgrade. */ });
    socket.on('unexpected-response', (request, response) => { const status = response.statusCode ?? 0; response.resume(); request.destroy(); resolve(status); });
    socket.on('open', () => { socket.terminate(); reject(new Error('Upgrade should have been rejected')); });
  });
}
afterEach(async () => { for (const client of clients.splice(0)) client.terminate(); await Promise.all(apps.splice(0).map(app => app.close())); });
describe('private multiplayer transport', () => {
  it('publishes names over sockets and rejects invalid profile payloads', async () => {
    const s = await setup();
    expect((await s.post(`/api/rooms/${s.roomId}/join`, { name: '  Facu ' }, s.cookie)).statusCode).toBe(200);
    const guest = await s.post(`/api/rooms/${s.roomId}/join`, { name: 'Ana' });
    const guestCookie = String(guest.headers['set-cookie']).split(';')[0]!;
    const peer = await connect(`${s.base}/api/rooms/${s.roomId}/socket`, guestCookie);
    const snapshot = await peer.until(m => m.type === 'snapshot') as Snapshot;
    expect(snapshot.you.name).toBe('Ana'); expect(snapshot.opponent?.name).toBe('Facu');
    await s.post(`/api/rooms/${s.roomId}/join`, { name: 'Facu_2' }, s.cookie);
    await peer.until(m => m.type === 'snapshot' && m.opponent?.name === 'Facu_2');
    for (const payload of [{ name: '<script>' }, { name: 'x'.repeat(25) }, { name: 3 }, { name: 'OK', credential: 'fake' }]) {
      expect((await s.post(`/api/rooms/${s.roomId}/join`, payload, s.cookie)).statusCode).toBe(400);
    }
    const created = await s.post('/api/rooms', { mode: 'free', quota: 8, name: 'Creator' }, s.cookie);
    const createdId = (created.json() as { roomId: string }).roomId;
    expect(s.rooms.snapshot(createdId, 0).you.name).toBe('Creator');
    expect(s.rooms.snapshot(createdId, 0).rules).not.toHaveProperty('name');
  });
  it('offers only the session owner a resumable multiplayer room and expires it', async () => {
    const s = await setup();
    const resume = () => s.app.inject({ method: 'GET', url: '/api/rooms/resume', headers: { cookie: s.cookie } });
    const owned = await resume();
    expect(owned.json()).toEqual({ roomId: s.roomId });
    expect(owned.headers['cache-control']).toBe('no-store');
    expect((await s.app.inject({ method: 'GET', url: '/api/rooms/resume' })).json()).toEqual({ roomId: null });
    const stranger = await s.post('/api/rooms', { mode: 'free', quota: 8, players: 1 });
    const strangerCookie = String(stranger.headers['set-cookie']).split(';')[0]!;
    expect((await s.app.inject({ method: 'GET', url: '/api/rooms/resume', headers: { cookie: strangerCookie } })).json()).toEqual({ roomId: null });
    s.move(30 * 60_000);
    expect((await resume()).json()).toEqual({ roomId: null });
  });
  it('creates random invitations with protected cookies, reserves seats and restores a session', async () => {
    const s = await setup(); expect(s.roomId).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const restored = await s.post(`/api/rooms/${s.roomId}/join`, {}, s.cookie); expect(restored.statusCode).toBe(200);
    expect(restored.headers['set-cookie']).toContain('HttpOnly; SameSite=Strict');
    const guest = await s.post(`/api/rooms/${s.roomId}/join`, {}); expect(guest.statusCode).toBe(200);
    const third = await s.post(`/api/rooms/${s.roomId}/join`, {}); expect(third.statusCode).toBe(409); expect(third.json()).toEqual({ error: 'ROOM_FULL' });
    expect(third.headers['set-cookie']).toBeUndefined();
  });
  it('uses Secure session cookies in production', async () => {
    const s = await setup(true); const response = await s.post(`/api/rooms/${s.roomId}/join`, {}, s.cookie);
    expect(response.headers['set-cookie']).toContain('; Secure');
  });
  it('starts solo immediately and accepts guesses without a countdown', async () => {
    const s = await setup();
    const created = await s.post('/api/rooms', { mode: 'free', quota: 8, players: 1 }, s.cookie);
    const id = (created.json() as { roomId: string }).roomId;
    const peer = await connect(`${s.base}/api/rooms/${id}/socket`, s.cookie);
    peer.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1 }));
    const playing = await peer.until(m => m.type === 'snapshot' && m.phase === 'playing') as Snapshot;
    expect(playing.startsAt).toBe(playing.serverNow); expect(playing.endsAt).toBeNull();
    peer.socket.send(JSON.stringify({ type: 'guess', countryId: 'ARG', round: 1 }));
    await peer.until(m => m.type === 'snapshot' && m.phase === 'finished');
    peer.socket.send(JSON.stringify({ type: 'rematch', value: true, round: 1 }));
    const next = await peer.until(m => m.type === 'snapshot' && m.round === 2) as Snapshot;
    expect(next.phase).toBe('playing');
  });
  it('resumes an active game with the same seat, guesses, quota and deadline', async () => {
    const s = await setup();
    const guest = await s.post(`/api/rooms/${s.roomId}/join`, {});
    const guestCookie = String(guest.headers['set-cookie']).split(';')[0]!;
    const url = `${s.base}/api/rooms/${s.roomId}/socket`;
    const first = await connect(url, s.cookie); const second = await connect(url, guestCookie);
    first.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1 }));
    second.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1 }));
    await first.until(m => m.type === 'snapshot' && m.phase === 'countdown');
    s.move(3000); first.socket.send(JSON.stringify({ type: 'guess', countryId: 'BRA', round: 1 }));
    const before = await first.until(m => m.type === 'snapshot' && m.you.count === 1) as Snapshot;
    const closed = new Promise(resolve => first.socket.once('close', resolve)); first.socket.close(); await closed;
    const resume = await s.app.inject({ method: 'GET', url: '/api/rooms/resume', headers: { cookie: s.cookie } });
    expect(resume.json()).toEqual({ roomId: s.roomId });
    await s.post(`/api/rooms/${s.roomId}/join`, {}, s.cookie);
    const restored = await connect(url, s.cookie);
    const after = await restored.until(m => m.type === 'snapshot') as Snapshot;
    expect(after.seat).toBe(before.seat); expect(after.guesses).toEqual(before.guesses);
    expect(after.you.remaining).toBe(7); expect(after.endsAt).toBe(before.endsAt);
  });
  it('rejects extra fields/coercion and untrusted or absent mutation origins', async () => {
    const s = await setup();
    for (const body of [{ mode: 'limited', quota: '8' }, { mode: 'free', quota: 8, target: 'ARG' }, { mode: 'limited', quota: 9 }]) {
      expect((await s.post('/api/rooms', body)).statusCode).toBe(400);
    }
    expect((await s.post('/api/rooms', { mode: 'free', quota: 8 }, undefined, 'https://evil.example')).statusCode).toBe(403);
    expect((await s.app.inject({ method: 'POST', url: '/api/rooms', payload: { mode: 'free', quota: 8 } })).statusCode).toBe(403);
    expect((await s.post(`/api/rooms/${s.roomId}/join?seat=0`, {}, s.cookie)).statusCode).toBe(400);
  });
  it('rejects websocket origins, missing cookies and forged identities', async () => {
    const s = await setup(); const url = `${s.base}/api/rooms/${s.roomId}/socket`;
    expect(await rejectedUpgrade(url, s.cookie, 'https://evil.example')).toBe(403);
    expect(await rejectedUpgrade(url, undefined, origin)).toBe(401);
    expect(await rejectedUpgrade(url, `mundi-session=${'x'.repeat(43)}`, origin)).toBe(401);
    expect(await rejectedUpgrade(`${s.base}/health`, s.cookie, origin)).toBe(404);
    expect(await rejectedUpgrade(`${s.base}/unknown`, s.cookie, origin)).toBe(404);
  });
  it('sends distinct snapshots to two clients and authoritative results/rematches', async () => {
    const s = await setup(); const guestResponse = await s.post(`/api/rooms/${s.roomId}/join`, {});
    const guestCookie = String(guestResponse.headers['set-cookie']).split(';')[0]!;
    const url = `${s.base}/api/rooms/${s.roomId}/socket`;
    const first = await connect(url, s.cookie); const second = await connect(url, guestCookie);
    await first.until(m => m.type === 'snapshot' && m.opponent?.connected === true);
    first.socket.send(JSON.stringify({ type: 'guess', countryId: 'ARG', round: 1 }));
    await first.until(m => m.type === 'error' && m.error === 'NOT_PLAYING');
    first.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1 })); second.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1 }));
    const countdown = await first.until(m => m.type === 'snapshot' && m.phase === 'countdown') as Snapshot;
    expect(countdown.result).toBeNull(); expect(JSON.stringify(countdown)).not.toContain('ARG');
    s.move(3000); first.socket.send(JSON.stringify({ type: 'guess', countryId: 'URY', round: 1 }));
    const rivalView = await second.until(m => m.type === 'snapshot' && m.opponent?.count === 1) as Snapshot;
    expect(rivalView.opponent?.bestBand).toBe('border'); expect(JSON.stringify(rivalView)).not.toMatch(/URY|ARG|"distance"/);
    second.socket.send(JSON.stringify({ type: 'guess', countryId: 'ARG', round: 1 }));
    const result = await first.until(m => m.type === 'snapshot' && m.phase === 'finished') as Snapshot;
    expect(result.result).toMatchObject({ targetId: 'ARG', winner: 1, reason: 'correct' }); expect(result.result?.histories.at(0)?.at(0)?.countryId).toBe('URY');
    first.socket.send(JSON.stringify({ type: 'rematch', value: true, round: 1 })); second.socket.send(JSON.stringify({ type: 'rematch', value: true, round: 1 }));
    const rematch = await first.until(m => m.type === 'snapshot' && m.round === 2) as Snapshot;
    expect(rematch.phase).toBe('countdown'); expect(rematch.guesses).toEqual([]); expect(rematch.result).toBeNull();
  });
  it('plays shared turns through four independent authenticated sockets', async () => {
    const s = await setup();
    const created = await s.post('/api/rooms', { players: 4, play: 'turns', mode: 'free', quota: 8 });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { roomId: string }).roomId;
    const cookies = [String(created.headers['set-cookie']).split(';')[0]!];
    for (let seat = 1; seat < 4; seat++) {
      const joined = await s.post(`/api/rooms/${id}/join`, {});
      expect(joined.statusCode).toBe(200); cookies.push(String(joined.headers['set-cookie']).split(';')[0]!);
    }
    const peers = [];
    for (const cookie of cookies) peers.push(await connect(`${s.base}/api/rooms/${id}/socket`, cookie));
    await peers[0]!.until(m => m.type === 'snapshot' && m.players.every(player => player?.connected));
    for (const peer of peers) peer.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1 }));
    await peers[0]!.until(m => m.type === 'snapshot' && m.phase === 'countdown');
    s.move(3000); peers[0]!.socket.send(JSON.stringify({ type: 'guess', countryId: 'BRA', round: 1 }));
    const shared = await peers[3]!.until(m => m.type === 'snapshot' && m.turn === 1) as Snapshot;
    expect(shared.guesses.at(0)?.countryId).toBe('BRA'); expect(shared.result).toBeNull();
    peers[2]!.socket.send(JSON.stringify({ type: 'guess', countryId: 'ARG', round: 1 }));
    await peers[2]!.until(m => m.type === 'error' && m.error === 'NOT_YOUR_TURN');
    peers[1]!.socket.send(JSON.stringify({ type: 'guess', countryId: 'ARG', round: 1 }));
    const result = await peers[3]!.until(m => m.type === 'snapshot' && m.phase === 'finished') as Snapshot;
    expect(result.result).toMatchObject({ winner: 1, targetId: 'ARG' }); expect(result.result?.histories).toHaveLength(4);
  });
  it('keeps a seat reserved after disconnect and rejects simultaneous duplicate connections', async () => {
    const s = await setup(); const url = `${s.base}/api/rooms/${s.roomId}/socket`;
    const first = await connect(url, s.cookie); const duplicate = await connect(url, s.cookie);
    await duplicate.until(m => m.type === 'error' && m.error === 'ALREADY_CONNECTED');
    const closed = new Promise(resolve => first.socket.once('close', resolve)); first.socket.close(); await closed;
    await new Promise(resolve => setTimeout(resolve, 10));
    const restored = await connect(url, s.cookie); const view = await restored.until(m => m.type === 'snapshot') as Snapshot;
    expect(view.seat).toBe(0); expect(view.you.connected).toBe(true);
  });
  it('rejects impersonation fields and oversized websocket messages without changing readiness', async () => {
    const s = await setup(); const first = await connect(`${s.base}/api/rooms/${s.roomId}/socket`, s.cookie);
    first.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1, seat: 1 }));
    await first.until(m => m.type === 'error' && m.error === 'INVALID_REQUEST'); expect(s.rooms.snapshot(s.roomId, 0).you.ready).toBe(false);
    const closed = new Promise<number>(resolve => first.socket.once('close', resolve)); first.socket.send('x'.repeat(2048));
    expect(await closed).toBe(1009);
  });
  it('bounds room creation by IP even with new cookies', async () => {
    const s = await setup(); for (let i = 0; i < 5; i++) expect((await s.post('/api/rooms', { mode: 'free', quota: 8 })).statusCode).toBe(201);
    const rejected = await s.post('/api/rooms', { mode: 'free', quota: 8 }); expect(rejected.statusCode).toBe(429); expect(rejected.json()).toEqual({ error: 'RATE_LIMIT' });
  });
  it('expires a live room and closes both the invitation and socket', async () => {
    const s = await setup(); const first = await connect(`${s.base}/api/rooms/${s.roomId}/socket`, s.cookie);
    s.move(30 * 60_000);
    await first.until(m => m.type === 'error' && m.error === 'ROOM_GONE');
    expect((await s.post(`/api/rooms/${s.roomId}/join`, {}, s.cookie)).statusCode).toBe(404);
  });
  it('preserves action limits after a new connection', async () => {
    const s = await setup(); const url = `${s.base}/api/rooms/${s.roomId}/socket`;
    const first = await connect(url, s.cookie);
    for (let i = 0; i < 20; i++) first.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1 }));
    await first.until(m => m.type === 'snapshot' && m.you.ready);
    const closed = new Promise(resolve => first.socket.once('close', resolve)); first.socket.close(); await closed;
    await new Promise(resolve => setTimeout(resolve, 10));
    const restored = await connect(url, s.cookie); restored.socket.send(JSON.stringify({ type: 'ready', value: true, round: 1 }));
    await restored.until(m => m.type === 'error' && m.error === 'RATE_LIMIT');
  });
});
