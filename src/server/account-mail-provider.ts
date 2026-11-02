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
      return mode === 'verifyEmail' ? auth.generateEmailVerificationLink(email) : auth.generatePasswordResetLink(email);
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
