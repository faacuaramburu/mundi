import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registerAccountMail } from '../src/server/account-mail.js';
import type { AccountMailDependencies } from '../src/server/account-mail.js';
import type { Config } from '../src/server/config.js';

const firebase = { projectId: 'mundi-test', authDomain: 'mundi.top', apiKey: 'public_test_api_key_1234567890', appId: '1:123:web:abc123' };
const config: Config = { environment: 'test', host: '127.0.0.1', port: 3000, origin: 'https://mundi.top', firebase,
  accountMail: { resendApiKey: 're_private_test_only', serviceAccount: { projectId: firebase.projectId, clientEmail: 'mailer@mundi-test.iam.gserviceaccount.com', privateKey: 'private-test-only' } } };
const code = 'valid_test_action_code_1234567890';
const token = 'valid_test_firebase_token_1234567890';
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function setup() {
  const app = Fastify({ bodyLimit: 2048, ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  apps.push(app);
  let now = Date.UTC(2026, 10, 2);
  const verifyUser = vi.fn(async () => ({ uid: 'owner', email: 'owner@example.com', verified: false }));
  const createLink = vi.fn<AccountMailDependencies['createLink']>(async (mode, email) => { void email; return `https://mundi-test.web.app/__/auth/action?mode=${mode}&oobCode=${code}&apiKey=ignored&continueUrl=https://evil.example`; });
  const send = vi.fn(async (message: Parameters<AccountMailDependencies['send']>[0]) => { void message; });
  const close = vi.fn(async () => {});
  await registerAccountMail(app, config, { verifyUser, createLink, send, close, now: () => now });
  const request = (payload: Record<string, unknown> = { mode: 'resetPassword', email: 'player@example.com', language: 'es' }, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/api/account/email', headers: { origin: config.origin, ...headers }, payload });
  return { app, request, verifyUser, createLink, send, close, advance: (ms: number) => { now += ms; } };
}

describe('account email delivery', () => {
  it('delivers a Spanish password email with only a trusted Mundi action URL and never returns the code', async () => {
    const { request, send, createLink } = await setup();
    const response = await request();
    expect(response.json()).toEqual({ ok: true });
    expect(createLink).toHaveBeenCalledWith('resetPassword', 'player@example.com');
    const email = send.mock.calls[0]![0];
    expect(email.subject).toBe('Cambiá tu contraseña de Mundi');
    const link = new URL(email.text.split('\n').find(line => line.startsWith('https://'))!);
    expect(link.origin).toBe('https://mundi.top');
    expect(link.pathname).toBe('/cuenta/accion.html');
    expect([...link.searchParams.keys()].sort()).toEqual(['apiKey', 'lang', 'mode', 'oobCode']);
    expect(link.searchParams.get('oobCode')).toBe(code);
    expect(link.searchParams.get('apiKey')).toBe(firebase.apiKey);
    expect(email.html).not.toContain('web.app');
    expect(email.html).not.toContain('evil.example');
    expect(response.body).not.toContain(code);
  });

  it('requires a verified Firebase token for verification and takes the recipient from that token', async () => {
    const { request, send, verifyUser } = await setup();
    const payload = { mode: 'verifyEmail', email: 'attacker@example.com', language: 'en' };
    expect((await request(payload)).statusCode).toBe(401);
    verifyUser.mockRejectedValueOnce(new Error('private auth details'));
    expect((await request(payload, { authorization: `Bearer ${token}` })).statusCode).toBe(401);
    expect(send).not.toHaveBeenCalled();
    expect((await request(payload, { authorization: `Bearer ${token}` })).json()).toEqual({ ok: true });
    expect(verifyUser).toHaveBeenLastCalledWith(token);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: 'owner@example.com', subject: 'Verify your email in Mundi' });
    expect(send.mock.calls[0]![0].text).toContain('lang=en');
  });

  it('uses the authenticated address for signed-in password requests too', async () => {
    const { request, createLink } = await setup();
    expect((await request(undefined, { authorization: `Bearer ${token}` })).statusCode).toBe(200);
    expect(createLink).toHaveBeenCalledWith('resetPassword', 'owner@example.com');
  });

  it('does not reveal whether a public reset address has an account', async () => {
    const { request, createLink, send } = await setup();
    createLink.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    expect((await request()).json()).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
    expect((await request({ mode: 'resetPassword', email: 'other@example.com', language: 'es' })).json()).toEqual({ ok: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it('preserves privacy for a redacted successful upstream response without claiming authenticated delivery', async () => {
    const { request, createLink, send, advance } = await setup();
    createLink.mockResolvedValueOnce(null);
    expect((await request()).json()).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
    advance(61000); createLink.mockResolvedValueOnce(null);
    expect((await request(undefined, { authorization: `Bearer ${token}` })).statusCode).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects cross-site calls and unexpected fields before generating any link', async () => {
    const { request, createLink } = await setup();
    expect((await request(undefined, { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await request({ mode: 'resetPassword', email: 'player@example.com', language: 'es', continueUrl: 'https://evil.example' })).statusCode).toBe(400);
    expect((await request({ mode: 'resetPassword', email: 'bad\r\nmail@example.com', language: 'es' })).statusCode).toBe(400);
    expect((await request({ mode: 'recoverEmail', email: 'player@example.com', language: 'es' })).statusCode).toBe(400);
    expect(createLink).not.toHaveBeenCalled();
  });

  it.each([
    `https://evil.example/__/auth/action?mode=resetPassword&oobCode=${code}`,
    `https://mundi-test.web.app/__/auth/action?mode=verifyEmail&oobCode=${code}`,
    'https://mundi-test.web.app/__/auth/action?mode=resetPassword&oobCode=short',
  ])('rejects malformed or untrusted generated links', async generated => {
    const { request, createLink, send } = await setup();
    createLink.mockResolvedValueOnce(generated);
    expect((await request()).statusCode).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it('reports delivery failures without exposing provider details or claiming success', async () => {
    const { request, send } = await setup();
    send.mockRejectedValueOnce(new Error('private key and email action code'));
    const response = await request();
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'EMAIL_UNAVAILABLE' });
  });

  it('limits repeated delivery and releases recipient capacity after an hour', async () => {
    const { request, send, advance } = await setup();
    expect((await request()).statusCode).toBe(200);
    expect((await request()).statusCode).toBe(429);
    for (let i = 0; i < 2; i++) { advance(61000); expect((await request()).statusCode).toBe(200); }
    advance(61000);
    expect((await request()).statusCode).toBe(429);
    advance(3600000);
    expect((await request()).statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('bounds the total daily email volume and resets capacity the next day', async () => {
    const { request, advance } = await setup();
    for (let i = 0; i < 90; i++) {
      expect((await request({ mode: 'resetPassword', email: `player${i}@example.com`, language: 'en' })).statusCode).toBe(200);
      advance(61000);
    }
    expect((await request()).statusCode).toBe(429);
    advance(24 * 3600000);
    expect((await request()).statusCode).toBe(200);
  });

  it('does not register delivery without the complete server configuration', async () => {
    const app = Fastify(); apps.push(app);
    await registerAccountMail(app, { environment: 'test', host: '127.0.0.1', port: 3000, origin: config.origin, firebase });
    expect((await app.inject({ method: 'POST', url: '/api/account/email', payload: {} })).statusCode).toBe(404);
  });
});
