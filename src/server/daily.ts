import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { dailyInfo } from '../shared/daily.js';
import type { Geography } from './rooms.js';
import { RoomError } from './rooms.js';

export function dailyTarget(day: string, ids: readonly string[]): string {
  const index = createHash('sha256').update(`mundi-daily-v1:${day}`).digest().readUInt32BE(0) % ids.length;
  return [...ids].sort().at(index)!;
}

// Registered within the existing origin-check and rate-limit scope.
export function registerDaily(app: FastifyInstance, geography: Geography, now = Date.now): void {
  const empty = { type: 'object', properties: {}, additionalProperties: false };
  const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
  function target(requestDay: string): string {
    const info = dailyInfo(now());
    if (requestDay !== info.day) throw new RoomError('STALE_ROUND', 409);
    return dailyTarget(info.day, geography.ids);
  }
  app.get('/api/daily', { schema: { querystring: empty } }, async () => dailyInfo(now()));
  app.post<{ Body: { day: string; countryId: string } }>('/api/daily/guess', { schema: {
    querystring: empty, body: { type: 'object', required: ['day', 'countryId'], additionalProperties: false,
      properties: { day, countryId: { type: 'string', pattern: '^[A-Z]{3}$' } } },
  } }, async request => {
    const targetId = target(request.body.day);
    if (!geography.ids.includes(request.body.countryId)) throw new RoomError('INVALID_REQUEST', 400);
    return geography.hint(request.body.countryId, targetId);
  });
  app.post<{ Body: { day: string } }>('/api/daily/giveup', { schema: {
    querystring: empty, body: { type: 'object', required: ['day'], additionalProperties: false, properties: { day } },
  } }, async request => ({ targetId: target(request.body.day) }));
}

