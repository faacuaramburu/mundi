import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import type { Action, Rules, Seat } from '../shared/multiplayer.js';
import type { Config } from './config.js';
import { loadGeography } from './geography.js';
import { hashCredential, RoomError, Rooms } from './rooms.js';
import { playerNameLimit } from '../shared/profile.js';

const cookieName = 'mundi-session';
const roomParams = { type: 'object', required: ['id'], additionalProperties: false,
  properties: { id: { type: 'string', pattern: '^[A-Za-z0-9_-]{24}$' } } };
const empty = { type: 'object', properties: {}, additionalProperties: false };
const nameProperty = { type: 'string', maxLength: playerNameLimit };
function session(request: FastifyRequest): string | null {
  const values = (request.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
  if (values.length !== 1) return null;
  const token = values[0]!.slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function parseAction(input: unknown): Action {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RoomError('INVALID_REQUEST', 400);
  const value = input as Record<string, unknown>;
  if (!Number.isSafeInteger(value.round) || (value.round as number) < 1) throw new RoomError('INVALID_REQUEST', 400);
  if (value.type === 'guess' && Object.keys(value).length === 3 && typeof value.countryId === 'string' && /^[A-Z]{3}$/.test(value.countryId)) {
    return { type: 'guess', countryId: value.countryId, round: value.round as number };
  }
  if ((value.type === 'ready' || value.type === 'rematch') && Object.keys(value).length === 3 && typeof value.value === 'boolean') {
    return { type: value.type, value: value.value, round: value.round as number };
  }
  throw new RoomError('INVALID_REQUEST', 400);
}
interface Connection { roomId: string; seat: Seat; socket: WebSocket; ipKey: string; alive: boolean; since: number; messages: number }
export async function registerMultiplayer(app: FastifyInstance, config: Config, rooms = new Rooms(loadGeography())): Promise<void> {
  const sockets = new Set<Connection>();
  const rates = new Map<string, { since: number; count: number }>();
  const now = Date.now;
  function checkSocketCapacity(ipKey: string): void {
    if (sockets.size >= 400 || [...sockets].filter(connection => connection.ipKey === ipKey).length >= 16) throw new RoomError('CAPACITY', 429);
  }
  function limit(key: string, max: number): void {
    const time = now();
    let bucket = rates.get(key);
    if (!bucket || time - bucket.since >= 60_000) {
      if (!bucket && rates.size >= 4000) throw new RoomError('CAPACITY', 429);
      bucket = { since: time, count: 0 }; rates.set(key, bucket);
    }
    if (++bucket.count > max) throw new RoomError('RATE_LIMIT', 429);
  }
  function send(connection: Connection, message: unknown): void {
    if (connection.socket.readyState !== 1) return;
    if (connection.socket.bufferedAmount > 64 * 1024) { connection.socket.terminate(); return; }
    connection.socket.send(JSON.stringify(message), error => { if (error) connection.socket.terminate(); });
  }
  function broadcast(roomId: string): void {
    for (const connection of sockets) if (connection.roomId === roomId) {
      try { send(connection, rooms.snapshot(roomId, connection.seat)); }
      catch { send(connection, { type: 'error', error: 'ROOM_GONE' }); connection.socket.close(1008); }
    }
  }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof RoomError) { reply.code(error.status).send({ error: error.code }); return; }
    const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST' });
  });
  app.addHook('onRequest', async (request) => {
    limit(`http:${hashCredential(request.ip)}`, 90);
    if (request.method !== 'GET' || request.headers.upgrade) {
      if (request.headers.origin !== config.origin) throw new RoomError('FORBIDDEN', 403);
    }
  });
  app.post<{ Body: Rules & { name?: string } }>('/api/rooms', { schema: { querystring: empty, body: {
    type: 'object', required: ['mode', 'quota'], additionalProperties: false,
    properties: { mode: { type: 'string', enum: ['free', 'limited'] }, quota: { type: 'integer', enum: [5, 8, 10, 15] },
      players: { type: 'integer', enum: [1, 2, 3, 4] }, play: { type: 'string', enum: ['race', 'turns'] }, name: nameProperty },
  } } }, async (request, reply) => {
    limit(`create:${hashCredential(request.ip)}`, 6);
    const token = session(request) ?? randomBytes(32).toString('base64url');
    const { name, ...rules } = request.body;
    const roomId = rooms.create(hashCredential(token), rules, name);
    reply.header('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${config.environment === 'production' ? '; Secure' : ''}`);
    return reply.code(201).send({ roomId });
  });
  app.get('/api/rooms/resume', { schema: { querystring: empty } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const token = session(request);
    return { roomId: token ? rooms.resumable(hashCredential(token)) : null };
  });
  app.post<{ Params: { id: string }; Body: { name?: string } }>('/api/rooms/:id/join', { schema: { params: roomParams, querystring: empty,
    body: { type: 'object', properties: { name: nameProperty }, additionalProperties: false } } }, async (request, reply) => {
    const token = session(request) ?? randomBytes(32).toString('base64url');
    rooms.join(request.params.id, hashCredential(token), request.body.name);
    reply.header('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${config.environment === 'production' ? '; Secure' : ''}`);
    broadcast(request.params.id);
    return { roomId: request.params.id };
  });
  app.get<{ Params: { id: string } }>('/api/rooms/:id/socket', {
    websocket: true, schema: { params: roomParams, querystring: empty },
    preValidation: async (request) => {
      limit(`connect:${hashCredential(request.ip)}`, 30);
      const token = session(request);
      if (!token) throw new RoomError('UNAUTHORIZED', 401);
      rooms.seat(request.params.id, hashCredential(token));
      checkSocketCapacity(hashCredential(request.ip));
    },
  }, (socket, request) => {
    const roomId = request.params.id;
    const seat = rooms.seat(roomId, hashCredential(session(request)!));
    try { checkSocketCapacity(hashCredential(request.ip)); rooms.connect(roomId, seat); }
    catch (error) { socket.send(JSON.stringify({ type: 'error', error: error instanceof RoomError ? error.code : 'UNAUTHORIZED' })); socket.close(1008); return; }
    const connection: Connection = { roomId, seat, socket, ipKey: hashCredential(request.ip), alive: true, since: now(), messages: 0 };
    sockets.add(connection);
    socket.on('error', () => { socket.terminate(); });
    socket.on('pong', () => { connection.alive = true; });
    socket.on('close', () => { sockets.delete(connection); rooms.disconnect(roomId, seat); broadcast(roomId); });
    socket.on('message', (bytes, binary) => {
      try {
        if (now() - connection.since >= 10_000) { connection.since = now(); connection.messages = 0; }
        limit(`message:${connection.ipKey}`, 240);
        if (++connection.messages > 30) throw new RoomError('RATE_LIMIT', 429);
        if (binary) throw new RoomError('INVALID_REQUEST', 400);
        let input: unknown;
        try { input = JSON.parse(bytes.toString()); } catch { throw new RoomError('INVALID_REQUEST', 400); }
        rooms.action(roomId, seat, parseAction(input));
        broadcast(roomId);
      } catch (error) {
        const code = error instanceof RoomError ? error.code : 'INVALID_REQUEST';
        send(connection, { type: 'error', error: code });
        // Time may have expired while processing a rejected guess.
        broadcast(roomId);
        if (code === 'RATE_LIMIT') socket.close(1008);
      }
    });
    broadcast(roomId);
  });
  const timer = setInterval(() => {
    for (const roomId of rooms.tick()) broadcast(roomId);
    for (const [key, bucket] of rates) if (now() - bucket.since >= 60_000) rates.delete(key);
  }, 250);
  const heartbeat = setInterval(() => {
    for (const connection of sockets) {
      if (!connection.alive) { connection.socket.terminate(); continue; }
      connection.alive = false; connection.socket.ping();
    }
  }, 30_000);
  timer.unref(); heartbeat.unref();
  app.addHook('preClose', async () => {
    clearInterval(timer); clearInterval(heartbeat);
    for (const connection of sockets) connection.socket.terminate();
  });
}
