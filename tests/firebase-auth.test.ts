import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { describe, expect, it, vi } from 'vitest';
import { registerFirebaseAuth } from '../src/server/firebase-auth.js';
import { loadConfig } from '../src/server/config.js';

const firebase = { projectId: 'demo-mundi', authDomain: 'mundi.top', apiKey: 'example-public-api-key-123456', appId: '1:123:web:abcdef' };
describe('Firebase sign-in helper proxy', () => {
  it('preserves reserved paths, queries and form callbacks without forwarding browser credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('<script nonce="firebase-auth-helper">ready()</script>', { headers: { 'content-type': 'text/html', 'set-cookie': 'upstream=private', 'content-encoding': 'gzip' } }));
    const app = Fastify();
    app.register(helmet, { crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } });
    app.get('/game', async () => 'game');
    await registerFirebaseAuth(app, loadConfig({ APP_ORIGIN: 'https://mundi.top', FIREBASE_WEB_CONFIG: JSON.stringify(firebase) }), fetcher);
    try {
      const page = await app.inject({ url: '/__/auth/iframe?apiKey=public&eventId=123', headers: { cookie: 'session=private', authorization: 'secret' } });
      expect(page.statusCode).toBe(200);
      expect(fetcher.mock.calls[0]?.[0]).toBe('https://demo-mundi.firebaseapp.com/__/auth/iframe?apiKey=public&eventId=123');
      expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('headers');
      expect(page.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(page.headers['cross-origin-opener-policy']).toBe('unsafe-none');
      expect((await app.inject('/game')).headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
      expect(page.headers['content-security-policy']).toContain("frame-ancestors 'self'");
      expect(page.headers['content-security-policy']).not.toContain("script-src 'unsafe-inline'");
      expect(page.body).not.toContain('firebase-auth-helper');
      expect(page.headers['set-cookie']).toBeUndefined();
      expect(page.headers['content-encoding']).toBeUndefined();
      const callback = await app.inject({ method: 'POST', url: '/__/auth/handler', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'code=example&state=123' });
      expect(callback.statusCode).toBe(200);
      expect(callback.headers['cross-origin-opener-policy']).toBe('unsafe-none');
      expect(fetcher.mock.calls[1]?.[1]?.body?.toString()).toBe('code=example&state=123');
      for (const url of ['/__/auth/unknown', '/__/auth/https%3A%2F%2Fexample.com', '/__/auth/..%2F..%2Fsecret']) expect((await app.inject({ url })).statusCode).toBe(404);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { await app.close(); }
  });
  it('serves only the configured public Firebase web settings without an upstream request', async () => {
    const fetcher = vi.fn<typeof fetch>(); const app = Fastify();
    await registerFirebaseAuth(app, loadConfig({ APP_ORIGIN: 'https://mundi.top', FIREBASE_WEB_CONFIG: JSON.stringify(firebase) }), fetcher);
    try {
      const response = await app.inject('/__/firebase/init.json');
      expect(response.statusCode).toBe(200); expect(response.json()).toEqual(firebase);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect((await app.inject({ method: 'HEAD', url: '/__/firebase/init.json' })).body).toBe('');
      expect((await app.inject({ method: 'POST', url: '/__/firebase/init.json' })).statusCode).toBe(404);
      expect(fetcher).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('routes the conventional email action path to Mundi without changing one-time codes or trusting continue URLs', async () => {
    const app = Fastify(); const fetcher = vi.fn<typeof fetch>();
    await registerFirebaseAuth(app, loadConfig({ APP_ORIGIN: 'https://mundi.top', FIREBASE_WEB_CONFIG: JSON.stringify(firebase) }), fetcher);
    try {
      const query = '?mode=verifyEmail&oobCode=example%2Bcode&continueUrl=https%3A%2F%2Fexample.test';
      const response = await app.inject('/__/auth/action' + query);
      expect(response.statusCode).toBe(302); expect(response.headers.location).toBe('/cuenta/accion.html' + query);
      expect(response.headers['cache-control']).toBe('no-store'); expect(fetcher).not.toHaveBeenCalled();
      expect((await app.inject({ method: 'POST', url: '/__/auth/action' })).statusCode).toBe(404);
    } finally { await app.close(); }
  });
  it('fails closed when Firebase is unavailable and stays absent without account configuration', async () => {
    const app = Fastify();
    await registerFirebaseAuth(app, loadConfig({ FIREBASE_WEB_CONFIG: JSON.stringify({ ...firebase, authDomain: 'demo-mundi.firebaseapp.com' }) }), vi.fn<typeof fetch>().mockRejectedValue(new Error('private upstream detail')));
    try { expect((await app.inject('/__/auth/handler')).json()).toEqual({ error: 'AUTH_UNAVAILABLE' }); }
    finally { await app.close(); }
    const guest = Fastify(); await registerFirebaseAuth(guest, loadConfig({}));
    try { expect((await guest.inject('/__/auth/handler')).statusCode).toBe(404); expect((await guest.inject('/__/firebase/init.json')).statusCode).toBe(404); }
    finally { await guest.close(); }
  });
});
