import { describe, expect, it, vi } from 'vitest';
import { createAccountMailProvider } from '../src/server/account-mail-provider.js';
import type { Config } from '../src/server/config.js';

const mocks = vi.hoisted(() => ({ reset: vi.fn(), verify: vi.fn() }));
vi.mock('firebase-admin/app', () => ({ cert: vi.fn(value => value), initializeApp: vi.fn(() => ({})), deleteApp: vi.fn(async () => {}) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ generatePasswordResetLink: mocks.reset, generateEmailVerificationLink: mocks.verify }) }));
const config: Config = { environment: 'test', host: '127.0.0.1', port: 3000, origin: 'https://mundi.top',
  firebase: { projectId: 'mundi-test', authDomain: 'mundi.top', apiKey: 'public_test_api_key_1234567890', appId: '1:123:web:abc123' },
  accountMail: { resendApiKey: 're_private_test_only', serviceAccount: { projectId: 'mundi-test', clientEmail: 'mailer@mundi-test.iam.gserviceaccount.com', privateKey: 'private-test-only' } } };
const email = 'missing@example.test';
const redacted = { code: 'auth/internal-error', httpResponse: { status: 200, data: { kind: 'identitytoolkit#GetOobConfirmationCodeResponse', email } } };

describe('Firebase email link adapter', () => {
  it('recognizes the successful response Firebase returns for an unknown email with enumeration protection', async () => {
    mocks.reset.mockRejectedValueOnce(redacted);
    const provider = createAccountMailProvider(config);
    try { expect(await provider.createLink('resetPassword', email)).toBeNull(); } finally { await provider.close?.(); }
  });

  it.each([
    { ...redacted, httpResponse: { ...redacted.httpResponse, status: 500 } },
    { ...redacted, httpResponse: { ...redacted.httpResponse, data: { ...redacted.httpResponse.data, email: 'different@example.test' } } },
    { code: 'auth/internal-error' },
  ])('does not conceal network, server or unexpected responses', async cause => {
    mocks.reset.mockRejectedValueOnce(cause);
    const provider = createAccountMailProvider(config);
    try { await expect(provider.createLink('resetPassword', email)).rejects.toBe(cause); } finally { await provider.close?.(); }
  });

  it('never treats missing verification delivery as a public reset confirmation', async () => {
    mocks.verify.mockRejectedValueOnce(redacted);
    const provider = createAccountMailProvider(config);
    try { await expect(provider.createLink('verifyEmail', email)).rejects.toBe(redacted); } finally { await provider.close?.(); }
  });
});
