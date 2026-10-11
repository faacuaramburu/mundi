import { expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';

it('lets the same browser create a fourth room and share its new invitation', async () => {
  const config = loadConfig({ NODE_ENV: 'test' });
  const app = createApp(config, false);
  let cookie = '';
  const ids: string[] = [];
  try {
    for (let index = 0; index < 4; index++) {
      const response = await app.inject({ method: 'POST', url: '/api/rooms',
        headers: { origin: config.origin, ...(cookie ? { cookie } : {}) },
        payload: { players: 2, mode: 'free', quota: 8 } });
      expect(response.statusCode).toBe(201);
      cookie = String(response.headers['set-cookie']).split(';')[0]!;
      ids.push((response.json() as { roomId: string }).roomId);
    }
    const resume = await app.inject({ method: 'GET', url: '/api/rooms/resume', headers: { cookie } });
    expect(resume.json()).toEqual({ roomId: ids[3] });
    const old = await app.inject({ method: 'POST', url: `/api/rooms/${ids[0]}/join`,
      headers: { origin: config.origin }, payload: {} });
    expect(old.statusCode).toBe(404);
    const guest = await app.inject({ method: 'POST', url: `/api/rooms/${ids[3]}/join`,
      headers: { origin: config.origin }, payload: {} });
    expect(guest.statusCode).toBe(200);
    expect(guest.json()).toEqual({ roomId: ids[3] });
  } finally { await app.close(); }
});
