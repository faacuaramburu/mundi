import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/server/config.js';

describe('configuration', () => {
  it('defaults to local-only development', () => {
    expect(loadConfig({})).toEqual({
      environment: 'development', host: '127.0.0.1', port: 3000, origin: 'http://127.0.0.1:5173',
    });
  });

  it('requires an explicit HTTPS origin in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('APP_ORIGIN');
    expect(() => loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://localhost:3000' })).toThrow('HTTPS');
    expect(loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://example.com' }).host).toBe('0.0.0.0');
  });

  it('uses Render’s assigned HTTPS origin and port in production', () => {
    expect(loadConfig({ NODE_ENV: 'production', RENDER: 'true', RENDER_EXTERNAL_URL: 'https://mundi-example.onrender.com', PORT: '10000' }))
      .toEqual({ environment: 'production', host: '0.0.0.0', port: 10000, origin: 'https://mundi-example.onrender.com' });
  });

  it('keeps explicit custom origins and local development independent of Render', () => {
    expect(loadConfig({ NODE_ENV: 'production', RENDER: 'true', RENDER_EXTERNAL_URL: 'https://mundi-example.onrender.com', APP_ORIGIN: 'https://example.com' }).origin).toBe('https://example.com');
    expect(loadConfig({ RENDER: 'true', RENDER_EXTERNAL_URL: 'https://mundi-example.onrender.com' }).origin).toBe('http://127.0.0.1:5173');
    expect(() => loadConfig({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://mundi-example.onrender.com' })).toThrow('APP_ORIGIN');
  });

  it.each(['http://mundi-example.onrender.com', 'https://mundi-example.onrender.com/path', 'https://user:password@mundi-example.onrender.com', ''])('validates Render origins with the same production rules', (origin) => {
    expect(() => loadConfig({ NODE_ENV: 'production', RENDER: 'true', RENDER_EXTERNAL_URL: origin })).toThrow();
  });

  it.each(['https://example.com/path', 'https://example.com/', 'https://user:secret@example.com', 'https://example.com?token=secret'])('rejects non-origin values', (origin) => {
    expect(() => loadConfig({ APP_ORIGIN: origin })).toThrow();
  });

  it.each(['0', '65536', '-1', '3.5', '3000x', ''])('rejects invalid ports', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow('PORT');
  });

  it('rejects unsupported environments and nonlocal plaintext origins', () => {
    expect(() => loadConfig({ NODE_ENV: 'unexpected' })).toThrow('NODE_ENV');
    expect(() => loadConfig({ APP_ORIGIN: 'http://example.com' })).toThrow('HTTPS');
  });
});
