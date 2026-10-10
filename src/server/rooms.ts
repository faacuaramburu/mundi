import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Action, Band, ErrorCode, Guess, Phase, Progress, Reason, Rules, Seat, Snapshot } from '../shared/multiplayer.js';
import { normalizePlayerName } from '../shared/profile.js';

export interface Geography {
  ids: string[];
  hint(guessId: string, targetId: string): Guess;
}
interface Accepted extends Guess { order: number }
interface Player {
  credential: string; name: string; connected: boolean; ready: boolean; rematch: boolean;
  guesses: Accepted[]; rate: { since: number; count: number };
}
interface Room {
  id: string; rules: Rules; players: (Player | null)[]; phase: Phase; round: number;
  target: string | null; previousTarget: string | null; startsAt: number | null;
  endsAt: number | null; idleEndsAt: number | null; expiresAt: number; order: number;
  result: { winner: Seat | null; reason: Reason } | null;
  turn: Seat | null; turnEndsAt: number | null;
}
export class RoomError extends Error {
  constructor(public readonly code: ErrorCode, public readonly status = 409) { super(code); }
}
export const hashCredential = (token: string): string => createHash('sha256').update(token).digest('hex');
const newPlayer = (credential: string, name: string): Player => ({ credential, name, connected: false, ready: false, rematch: false, guesses: [], rate: { since: 0, count: 0 } });
function playerName(value: string): string {
  const name = normalizePlayerName(value);
  if (name === null) throw new RoomError('INVALID_REQUEST', 400);
  return name;
}
function publicGuess(guess: Accepted): Guess {
  return { countryId: guess.countryId, distance: guess.distance, correct: guess.correct, border: guess.border, band: guess.band };
}
function best(player: Player): Accepted | undefined {
  return player.guesses.reduce<Accepted | undefined>((winner, guess) => !winner || guess.distance < winner.distance ? guess : winner, undefined);
}
export class Rooms {
  private readonly rooms = new Map<string, Room>();
  constructor(private readonly geography: Geography, private readonly now = Date.now,
    private readonly choose = (ids: string[]) => ids[randomInt(ids.length)]!,
    private readonly capacity = 200) {}

  create(credential: string, rules: Rules, displayName = ''): string {
    const name = playerName(displayName);
    this.tick();
    const count = rules.players ?? 2;
    if (![1, 2, 3, 4].includes(count) || (rules.play && !['race', 'turns'].includes(rules.play))
      || (count === 1 && (rules.mode !== 'free' || rules.play === 'turns'))) throw new RoomError('INVALID_REQUEST', 400);
    if (count === 1) {
      const existing = [...this.rooms.values()].find(room => room.players.length === 1 && room.players[0]?.credential === credential);
      if (existing) return existing.id;
    }
    if (this.rooms.size >= this.capacity || [...this.rooms.values()].filter(room => room.players.some(player => player?.credential === credential)).length >= 3) {
      throw new RoomError('CAPACITY', 429);
    }
    const id = randomBytes(18).toString('base64url');
    this.rooms.set(id, { id, rules: { ...rules, players: count, play: rules.play ?? 'race' }, players: Array.from({ length: count }, (_, index) => index === 0 ? newPlayer(credential, name) : null), phase: 'waiting', round: 1,
      target: null, previousTarget: null, startsAt: null, endsAt: null, idleEndsAt: null,
      expiresAt: this.now() + 30 * 60_000, order: 0, result: null, turn: null, turnEndsAt: null });
    return id;
  }
  private room(id: string): Room {
    const room = this.rooms.get(id);
    if (!room || room.expiresAt <= this.now()) throw new RoomError('ROOM_GONE', 404);
    return room;
  }
  resumable(credential: string): string | null {
    const rooms = [...this.rooms.values()].reverse();
    return rooms.find(room => room.players.length > 1 && room.expiresAt > this.now()
      && room.players.some(player => player?.credential === credential))?.id ?? null;
  }
  join(id: string, credential: string, displayName?: string): Seat {
    const name = displayName === undefined ? undefined : playerName(displayName);
    const room = this.room(id);
    const current = room.players.findIndex(player => player?.credential === credential);
    if (current >= 0) {
      // Names can be edited in the lobby; a running round keeps its player labels.
      const player = room.players.at(current)!;
      if (name !== undefined && room.phase === 'waiting') player.name = name;
      return current as Seat;
    }
    const empty = room.players.findIndex(player => !player);
    if (empty < 0 || room.phase !== 'waiting') throw new RoomError('ROOM_FULL');
    room.players.splice(empty, 1, newPlayer(credential, name ?? ''));
    return empty as Seat;
  }
  seat(id: string, credential: string): Seat {
    const index = this.room(id).players.findIndex(player => player?.credential === credential);
    if (index < 0) throw new RoomError('UNAUTHORIZED', 401);
    return index as Seat;
  }
  connect(id: string, seat: Seat): void {
    const player = this.room(id).players.at(seat);
    if (!player) throw new RoomError('UNAUTHORIZED', 401);
    if (player.connected) throw new RoomError('ALREADY_CONNECTED');
    player.connected = true;
  }
  disconnect(id: string, seat: Seat): void {
    const room = this.rooms.get(id);
    const player = room?.players.at(seat);
    if (!room || !player) return;
    this.advance(room);
    player.connected = false;
    player.ready = false;
    player.rematch = false;
    if (room.phase === 'countdown') {
      room.phase = 'waiting'; room.startsAt = null; room.endsAt = null; room.idleEndsAt = null;
      room.target = null;
      room.turn = null; room.turnEndsAt = null;
      for (const other of room.players) if (other) other.ready = false;
    }
  }
  action(id: string, seat: Seat, action: Action): void {
    const room = this.room(id);
    this.advance(room);
    const player = room.players.at(seat);
    if (!player?.connected) throw new RoomError('UNAUTHORIZED', 401);
    const now = this.now();
    if (now - player.rate.since >= 10_000) player.rate = { since: now, count: 0 };
    if (++player.rate.count > 20) throw new RoomError('RATE_LIMIT', 429);
    if (action.round !== room.round) throw new RoomError('STALE_ROUND');
    if (action.type === 'ready') {
      if (room.phase !== 'waiting') throw new RoomError('NOT_PLAYING');
      player.ready = action.value;
      if (room.players.every(other => other?.ready && other.connected)) this.begin(room);
      return;
    }
    if (action.type === 'rematch') {
      if (room.phase !== 'finished') throw new RoomError('NOT_PLAYING');
      player.rematch = action.value;
      if (room.players.every(other => other?.rematch && other.connected)) {
        room.round++; room.result = null; room.order = 0;
        for (const other of room.players) if (other) { other.guesses = []; other.rematch = false; other.ready = true; }
        this.begin(room);
      }
      return;
    }
    if (room.phase !== 'playing' || !room.target) throw new RoomError('NOT_PLAYING');
    if (action.type === 'giveup') {
      if (room.rules.players !== 1 || room.rules.mode !== 'free') throw new RoomError('FORBIDDEN');
      this.finish(room, 'giveup');
      return;
    }
    if (room.rules.play === 'turns' && room.turn !== seat) throw new RoomError('NOT_YOUR_TURN');
    if (!this.geography.ids.includes(action.countryId)) throw new RoomError('INVALID_REQUEST', 400);
    const seen = room.rules.play === 'turns' ? room.players.flatMap(other => other?.guesses ?? []) : player.guesses;
    if (seen.some(guess => guess.countryId === action.countryId)) throw new RoomError('DUPLICATE');
    if (room.rules.mode === 'limited' && player.guesses.length >= room.rules.quota) throw new RoomError('QUOTA');
    room.expiresAt = now + 30 * 60_000;
    player.guesses.push({ ...this.geography.hint(action.countryId, room.target), order: ++room.order });
    if (room.rules.mode === 'limited' && room.rules.play !== 'turns') room.idleEndsAt = now + 60_000;
    if (action.countryId === room.target) this.finish(room, 'correct', seat);
    else if (room.rules.mode === 'limited' && room.players.every(other => other && other.guesses.length >= room.rules.quota)) this.finish(room, 'quota');
    else if (room.rules.play === 'turns') this.nextTurn(room, now);
  }
  private begin(room: Room): void {
    room.expiresAt = this.now() + 30 * 60_000;
    room.target = this.choose(this.geography.ids.filter(id => id !== room.previousTarget));
    const solo = room.players.length === 1;
    room.phase = solo ? 'playing' : 'countdown'; room.startsAt = this.now() + (solo ? 0 : 3000);
    room.endsAt = room.players.length === 1 ? null : room.startsAt + (room.rules.play === 'turns' ? 600_000 : 180_000);
    room.idleEndsAt = room.rules.mode === 'limited' && room.rules.play !== 'turns' ? room.startsAt + 60_000 : null;
    room.turn = room.rules.play === 'turns' ? ((room.round - 1) % room.players.length) as Seat : null;
    room.turnEndsAt = room.turn !== null ? room.startsAt + 30_000 : null;
  }
  private nextTurn(room: Room, now: number): void {
    for (let offset = 1; offset <= room.players.length; offset++) {
      const seat = ((room.turn! + offset) % room.players.length) as Seat;
      const player = room.players.at(seat);
      if (player && (room.rules.mode === 'free' || player.guesses.length < room.rules.quota)) {
        room.turn = seat; room.turnEndsAt = now + 30_000; return;
      }
    }
    this.finish(room, 'quota');
  }
  private finish(room: Room, reason: Reason, correctWinner?: Seat): void {
    let winner: Seat | null = correctWinner ?? null;
    if (correctWinner === undefined && room.rules.play !== 'turns' && room.players.length > 1) {
      const ranked = room.players.flatMap((player, seat) => {
        const guess = player ? best(player) : undefined;
        return player && guess ? [{ seat, guess, number: player.guesses.indexOf(guess) }] : [];
      }).sort((a, b) => a.guess.distance - b.guess.distance || a.number - b.number || a.guess.order - b.guess.order);
      winner = ranked.length ? ranked[0]!.seat as Seat : null;
    }
    room.phase = 'finished'; room.previousTarget = room.target; room.result = { winner, reason };
    room.turn = null; room.turnEndsAt = null;
    room.expiresAt = this.now() + 10 * 60_000;
  }
  private advance(room: Room): boolean {
    const now = this.now();
    if (room.phase === 'countdown' && room.startsAt !== null && now >= room.startsAt) { room.phase = 'playing'; this.advance(room); return true; }
    if (room.phase !== 'playing') return false;
    // If both clocks expired, use the earlier cutoff, even after a delayed timer tick.
    if (room.idleEndsAt !== null && now >= room.idleEndsAt && room.idleEndsAt <= room.endsAt!) { this.finish(room, 'inactive'); return true; }
    if (room.endsAt !== null && now >= room.endsAt) { this.finish(room, 'deadline'); return true; }
    if (room.turnEndsAt !== null && now >= room.turnEndsAt) {
      // Skip every elapsed turn after a delayed tick; never extend a stale turn.
      while (room.turnEndsAt !== null && now >= room.turnEndsAt) this.nextTurn(room, room.turnEndsAt);
      return true;
    }
    return false;
  }
  tick(): string[] {
    const changed: string[] = [];
    for (const [id, room] of this.rooms) {
      if (room.expiresAt <= this.now()) { this.rooms.delete(id); changed.push(id); }
      else if (this.advance(room)) changed.push(id);
    }
    return changed;
  }
  snapshot(id: string, seat: Seat): Snapshot {
    const room = this.room(id);
    this.advance(room);
    const player = room.players.at(seat);
    if (!player) throw new RoomError('UNAUTHORIZED', 401);
    const progress = (other: Player): Progress => ({ name: other.name, connected: other.connected, ready: other.ready, rematch: other.rematch,
      count: other.guesses.length, remaining: room.rules.mode === 'free' ? null : room.rules.quota - other.guesses.length,
      bestBand: best(other)?.band ?? null });
    const opponent = room.players.at(seat === 0 ? 1 : 0);
    return { type: 'snapshot', roomId: room.id, seat, round: room.round, phase: room.phase, rules: { ...room.rules },
      serverNow: this.now(), startsAt: room.startsAt, endsAt: room.endsAt, idleEndsAt: room.idleEndsAt,
      expiresAt: room.expiresAt, you: progress(player), opponent: opponent ? progress(opponent) : null,
      players: room.players.map(other => other ? progress(other) : null), turn: room.turn, turnEndsAt: room.turnEndsAt,
      guesses: (room.rules.play === 'turns' ? room.players.flatMap(other => other?.guesses ?? []).sort((a, b) => a.order - b.order) : player.guesses).map(publicGuess),
      result: room.result && room.target ? { targetId: room.target,
        ...room.result, histories: room.players.map(other => other?.guesses.map(publicGuess) ?? []) } : null };
  }
}

export function proximityBand(distance: number, correct: boolean, border: boolean): Band {
  return correct ? 'correct' : border ? 'border' : distance < 500 ? 'veryHot' : distance < 1500 ? 'hot'
    : distance < 3000 ? 'warm' : distance < 6000 ? 'cool' : 'cold';
}
