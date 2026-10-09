export type Seat = 0 | 1 | 2 | 3;
export type Band = 'cold' | 'cool' | 'warm' | 'hot' | 'veryHot' | 'border' | 'correct';
export type Phase = 'waiting' | 'countdown' | 'playing' | 'finished';
export type Reason = 'correct' | 'deadline' | 'quota' | 'inactive';
export interface Rules { mode: 'free' | 'limited'; quota: 5 | 8 | 10 | 15; players?: 1 | 2 | 3 | 4; play?: 'race' | 'turns' }
export interface Guess { countryId: string; distance: number; border: boolean; correct: boolean; band: Band }
export interface Progress { name: string; connected: boolean; ready: boolean; rematch: boolean; count: number; remaining: number | null; bestBand: Band | null }
export interface Snapshot {
  type: 'snapshot'; roomId: string; seat: Seat; round: number; phase: Phase;
  rules: Rules; serverNow: number; startsAt: number | null; endsAt: number | null;
  idleEndsAt: number | null; expiresAt: number; you: Progress; opponent: Progress | null;
  guesses: Guess[];
  players: (Progress | null)[]; turn: Seat | null; turnEndsAt: number | null;
  result: { targetId: string; winner: Seat | null; reason: Reason; histories: Guess[][] } | null;
}
export type Action = { type: 'ready'; value: boolean; round: number }
  | { type: 'rematch'; value: boolean; round: number }
  | { type: 'guess'; countryId: string; round: number };
export type ErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN' | 'ROOM_FULL' | 'ROOM_GONE' | 'UNAUTHORIZED'
  | 'CAPACITY' | 'RATE_LIMIT' | 'ALREADY_CONNECTED' | 'NOT_PLAYING' | 'QUOTA' | 'DUPLICATE' | 'STALE_ROUND' | 'NOT_YOUR_TURN';
export type ServerMessage = Snapshot | { type: 'error'; error: ErrorCode };
