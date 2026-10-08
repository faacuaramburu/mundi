import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/server/config.js';

describe('configuration', () => {
  it('defaults to local-only development', () => {
    expect(loadConfig({})).toEqual({
      environment: 'development', host: '127.0.0.1', port: 3000, origin: 'http://localhost:3000',
    });
  });

  it('requires an explicit HTTPS origin in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('APP_ORIGIN');
    expect(() => loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://localhost:3000' })).toThrow('HTTPS');
    expect(loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://example.com' }).host).toBe('0.0.0.0');
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
