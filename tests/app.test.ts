import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';

const apps: FastifyInstance[] = [];

function makeApp(production = false) {
  const config = loadConfig(production
    ? { NODE_ENV: 'production', APP_ORIGIN: 'https://example.com' }
    : { NODE_ENV: 'test' });
  const app = createApp(config, false);
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('HTTP foundation', () => {
  it('redirects Render page links to the canonical domain while preserving the path and query', async () => {
    const app = makeApp(true);
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await app.inject({ method, url: '/?play=multi&room=abc', headers: { host: 'mundi-avdd.onrender.com' } });
      expect(response.statusCode).toBe(308);
      expect(response.headers.location).toBe('https://example.com/?play=multi&room=abc');
    }
    const canonical = await app.inject({ method: 'GET', url: '/', headers: { host: 'example.com', 'x-forwarded-host': 'mundi-avdd.onrender.com' } });
    expect(canonical.headers.location).toBeUndefined();
    const health = await app.inject({ method: 'GET', url: '/health', headers: { host: 'mundi-avdd.onrender.com' } });
    expect(health.statusCode).toBe(200);
    const mutation = await app.inject({ method: 'POST', url: '/api/rooms', headers: { host: 'mundi-avdd.onrender.com', origin: 'https://mundi-avdd.onrender.com' }, payload: {} });
    expect(mutation.headers.location).toBeUndefined();
    expect(mutation.statusCode).toBe(403);
  });

  it('keeps a Render hostname usable when it is still the canonical origin', async () => {
    const app = createApp(loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://mundi-avdd.onrender.com' }), false);
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/', headers: { host: 'mundi-avdd.onrender.com' } });
    expect(response.headers.location).toBeUndefined();
  });

  it('returns only minimal health information', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('sets strict production headers without inline scripts', async () => {
    const response = await makeApp(true).inject({ method: 'GET', url: '/health' });
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not force HTTPS on local development', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/health' });
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('rejects extra query fields without exposing validation details', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/health?unexpected=true' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_REQUEST' });
  });

  it('does not disclose unknown paths or internal failures', async () => {
    const app = makeApp();
    app.get('/test-failure', async () => { throw new Error('private internal detail'); });
    const missing = await app.inject({ method: 'GET', url: '/private?token=hidden' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'NOT_FOUND' });
    const failure = await app.inject({ method: 'GET', url: '/test-failure' });
    expect(failure.statusCode).toBe(500);
    expect(failure.json()).toEqual({ error: 'INTERNAL_ERROR' });
  });

  it('rejects oversized and malformed JSON requests', async () => {
    const app = makeApp();
    app.post('/test-input', {
      schema: { body: { type: 'object', properties: {}, additionalProperties: false } },
    }, async () => ({ ok: true }));
    const oversized = await app.inject({ method: 'POST', url: '/test-input', payload: { value: 'x'.repeat(2048) } });
    expect(oversized.statusCode).toBe(413);
    const malformed = await app.inject({ method: 'POST', url: '/test-input', headers: { 'content-type': 'application/json' }, payload: '{' });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: 'INVALID_REQUEST' });
  });
});
