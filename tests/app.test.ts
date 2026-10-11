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
  it('serves client files without exposing private files or directory traversal', async () => {
    const app = createApp(loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://example.com' }));
    apps.push(app);
    const page = await app.inject({ method: 'GET', url: '/fonts/Barlow-Regular.woff2', headers: { host: 'example.com' } });
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    for (const url of ['/.env', '/.git/config', '/data/distances.json', '/src/server/config.ts', '/%2e%2e/%2e%2e/data/distances.json']) {
      const response = await app.inject({ method: 'GET', url, headers: { host: 'example.com' } });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
      expect(response.headers.location).toBeUndefined();
    }
  });

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

  it('allows the home page to be indexed while excluding rooms and service endpoints', async () => {
    const app = makeApp(true);
    app.get('/', async () => 'Mundi');
    const home = await app.inject({ method: 'GET', url: '/' });
    expect(home.headers['x-robots-tag']).toBeUndefined();
    for (const url of ['/?room=AbCdEfGhIjKlMnOpQrStUv_-', '/?play=multi', '/?view=index', '/health', '/api/rooms/resume']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
    const health = await app.inject({ method: 'HEAD', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.body).toBe('');
    expect(health.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('sets strict production headers without inline scripts', async () => {
    const response = await makeApp(true).inject({ method: 'GET', url: '/health' });
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(response.headers['content-security-policy']).toContain("script-src 'self' https://static.cloudflareinsights.com/beacon.min.js;");
    expect(response.headers['content-security-policy']).toContain("connect-src 'self' wss://example.com https://cloudflareinsights.com/cdn-cgi/rum;");
    expect(response.headers['content-security-policy']).not.toContain('https:;');
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not force HTTPS on local development', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/health' });
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(response.headers['content-security-policy']).not.toContain('cloudflareinsights.com');
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
