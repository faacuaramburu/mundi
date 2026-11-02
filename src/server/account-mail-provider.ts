import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';
import type { AccountMailDependencies } from './account-mail.js';

export function createAccountMailProvider(config: Config): AccountMailDependencies {
  if (!config.accountMail || !config.firebase) throw new Error('Account mail is disabled');
  const { resendApiKey, serviceAccount } = config.accountMail;
  const admin = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.projectId }, `mundi-mail-${randomUUID()}`);
  const auth = getAuth(admin);
  const sender = `Mundi <noreply@${new URL(config.origin).hostname}>`;
  return {
    async verifyUser(token) {
      const user = await auth.verifyIdToken(token);
      return { uid: user.uid, email: user.email ?? '', verified: user.email_verified === true };
    },
    async createLink(mode, email) {
      try {
        return await (mode === 'verifyEmail' ? auth.generateEmailVerificationLink(email) : auth.generatePasswordResetLink(email));
      } catch (cause) {
        // With enumeration protection, a nonexistent address returns HTTP 200
        // without an oobLink. Admin SDK 14 reports that successful redaction as
        // an internal assertion. Suppress only that exact upstream response.
        if (mode === 'resetPassword' && cause && typeof cause === 'object' && 'code' in cause && cause.code === 'auth/internal-error' && 'httpResponse' in cause) {
          const response = cause.httpResponse as { status?: unknown; data?: { kind?: unknown; email?: unknown; oobLink?: unknown } } | undefined;
          if (response?.status === 200 && response.data?.kind === 'identitytoolkit#GetOobConfirmationCodeResponse'
            && response.data.email === email && response.data.oobLink === undefined) return null;
        }
        throw cause;
      }
    },
    async send(message) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': message.id },
        body: JSON.stringify({ from: sender, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
        signal: AbortSignal.timeout(6000),
      });
      // Provider errors may contain addresses or links. Never log or return their body.
      if (!response.ok) { await response.body?.cancel(); throw new Error('Email delivery unavailable'); }
      const result = await response.json() as { id?: unknown };
      if (typeof result.id !== 'string') throw new Error('Email delivery unavailable');
    },
    async close() { await deleteApp(admin); },
  };
}
