import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/server/config.js';
import { generateKeyPairSync } from 'node:crypto';
import { createApp } from '../src/server/app.js';

describe('configuration', () => {
  it('keeps private mail credentials on the server and rejects incomplete or mismatched credentials', async () => {
    const firebase = { apiKey: 'public_test_api_key_1234567890', authDomain: 'mundi.top', projectId: 'mundi-test', appId: '1:123456:web:abc123' };
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    const account = { project_id: firebase.projectId, client_email: 'mailer@mundi-test.iam.gserviceaccount.com', private_key: privateKey };
    const env = { APP_ORIGIN: 'https://mundi.top', FIREBASE_WEB_CONFIG: JSON.stringify(firebase), RESEND_API_KEY: 're_private_test_key_1234567890', FIREBASE_MAIL_SERVICE_ACCOUNT: JSON.stringify(account) };
    expect(() => loadConfig({ ...env, FIREBASE_MAIL_SERVICE_ACCOUNT: '' })).toThrow('account email');
    expect(() => loadConfig({ ...env, RESEND_API_KEY: '' })).toThrow('account email');
    expect(() => loadConfig({ ...env, FIREBASE_MAIL_SERVICE_ACCOUNT: JSON.stringify({ ...account, project_id: 'wrong-project' }) })).toThrow('account email');
    const app = createApp(loadConfig(env), false);
    try {
      const response = await app.inject({ method: 'GET', url: '/api/account/config' });
      expect(response.json()).toEqual({ enabled: true, firebase, customEmail: true });
      expect(response.body).not.toContain('private');
      expect(response.body).not.toContain('resend');
      expect(response.body).not.toContain('gserviceaccount');
    } finally { await app.close(); }
  });
  it('accepts only the public Firebase web fields and the matching auth domain', () => {
    const firebase = { apiKey: 'public_test_api_key_1234567890', authDomain: 'mundi-test.firebaseapp.com', projectId: 'mundi-test', appId: '1:123456:web:abc123' };
    expect(loadConfig({ FIREBASE_WEB_CONFIG: JSON.stringify({ ...firebase, privateKey: 'must-not-leak' }) }).firebase).toEqual(firebase);
    expect(() => loadConfig({ FIREBASE_WEB_CONFIG: JSON.stringify({ ...firebase, authDomain: 'attacker.example' }) })).toThrow('FIREBASE_WEB_CONFIG');
    expect(() => loadConfig({ FIREBASE_WEB_CONFIG: '{invalid' })).toThrow('FIREBASE_WEB_CONFIG');
    expect(loadConfig({ APP_ORIGIN: 'https://mundi.top', FIREBASE_WEB_CONFIG: JSON.stringify({ ...firebase, authDomain: 'mundi.top' }) }).firebase?.authDomain).toBe('mundi.top');
    expect(() => loadConfig({ APP_ORIGIN: 'https://mundi.top', FIREBASE_WEB_CONFIG: JSON.stringify({ ...firebase, authDomain: 'mundi.top.attacker.example' }) })).toThrow('FIREBASE_WEB_CONFIG');
  });
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
