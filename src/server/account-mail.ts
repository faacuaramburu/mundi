import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';

type MailMode = 'verifyEmail' | 'resetPassword';
export interface AccountMailDependencies {
  verifyUser(token: string): Promise<{ uid: string; email: string; verified: boolean }>;
  createLink(mode: MailMode, email: string): Promise<string>;
  send(message: { id: string; to: string; subject: string; html: string; text: string }): Promise<void>;
  close?(): Promise<void>;
  now?(): number;
}

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function actionUrl(generated: string, mode: MailMode, config: Config, language: 'es' | 'en'): string {
  const source = new URL(generated);
  const code = source.searchParams.get('oobCode');
  if (!config.firebase || source.protocol !== 'https:' || ![`${config.firebase.projectId}.firebaseapp.com`, `${config.firebase.projectId}.web.app`, new URL(config.origin).hostname].includes(source.hostname)
    || source.searchParams.get('mode') !== mode || !code || !/^[A-Za-z0-9_-]{20,2048}$/.test(code)) throw new Error('Invalid action link');
  const target = new URL('/cuenta/accion.html', config.origin);
  target.search = new URLSearchParams({ mode, oobCode: code, apiKey: config.firebase.apiKey, lang: language }).toString();
  return target.href;
}

function message(mode: MailMode, language: 'es' | 'en', link: string) {
  const spanish = language === 'es';
  const subject = mode === 'verifyEmail'
    ? spanish ? 'Verificá tu correo en Mundi' : 'Verify your email in Mundi'
    : spanish ? 'Creá o cambiá tu contraseña de Mundi' : 'Create or change your Mundi password';
  const instruction = mode === 'verifyEmail'
    ? spanish ? 'Confirmá tu dirección de correo para tu cuenta de Mundi.' : 'Confirm your email address for your Mundi account.'
    : spanish ? 'Usá este enlace para crear o cambiar tu contraseña.' : 'Use this link to create or change your password.';
  const action = mode === 'verifyEmail' ? spanish ? 'Verificar correo' : 'Verify email' : spanish ? 'Cambiar contraseña' : 'Change password';
  const footer = spanish ? 'Si no pediste este correo, podés ignorarlo.' : 'If you did not request this email, you can ignore it.';
  const escaped = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return {
    subject,
    text: `Mundi\n\n${instruction}\n\n${link}\n\n${footer}`,
    html: `<!doctype html><html lang="${language}"><body style="margin:0;background:#f4f5f1;color:#20272a;font-family:Arial,sans-serif"><main style="max-width:480px;margin:32px auto;padding:32px"><p style="font-size:28px;font-weight:700;margin:0 0 32px">Mundi</p><h1 style="font-size:24px;line-height:1.3">${subject}</h1><p style="line-height:1.7">${instruction}</p><p style="margin:32px 0"><a href="${escaped}" style="display:inline-block;padding:14px 20px;background:#214e42;color:#fff;border-radius:6px;text-decoration:none;font-weight:700">${action}</a></p><p style="font-size:14px;line-height:1.6;color:#566360">${footer}</p><p style="font-size:12px;line-height:1.6;word-break:break-all"><a href="${escaped}" style="color:#214e42">${escaped}</a></p></main></body></html>`,
  };
}

export async function registerAccountMail(app: FastifyInstance, config: Config, dependencies?: AccountMailDependencies): Promise<void> {
  if (!config.accountMail || !config.firebase) return;
  const provider = dependencies ?? (await import('./account-mail-provider.js')).createAccountMailProvider(config);
  if (provider.close) app.addHook('onClose', async () => { await provider.close?.(); });
  const recipients = new Map<string, { count: number; start: number; last: number }>();
  let dailyStart = 0; let dailyCount = 0; let minuteStart = 0; let minuteCount = 0; let active = 0;

  app.post<{ Body: { mode: MailMode; email?: string; language: 'es' | 'en' } }>('/api/account/email', {
    schema: {
      querystring: { type: 'object', properties: {}, additionalProperties: false },
      body: {
        type: 'object', additionalProperties: false, required: ['mode', 'language'],
        properties: { mode: { enum: ['verifyEmail', 'resetPassword'] }, email: { type: 'string', minLength: 3, maxLength: 254 }, language: { enum: ['es', 'en'] } },
      },
    },
  }, async (request, reply) => {
    if (request.headers.origin !== config.origin) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { mode, language } = request.body;
    let address = request.body.email?.trim() ?? '';
    const bearer = request.headers.authorization;
    let authenticated = false;
    if (mode === 'verifyEmail' || bearer) {
      if (!bearer || !/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(bearer)) return reply.code(401).send({ error: 'UNAUTHORIZED' });
      try {
        const user = await provider.verifyUser(bearer.slice(7));
        // The authenticated recipient always comes from the signed Firebase token.
        address = user.email; authenticated = true;
        if (mode === 'verifyEmail' && user.verified) return { ok: true };
      } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    }
    if (!emailPattern.test(address) || address.length > 254) return reply.code(400).send({ error: 'INVALID_EMAIL' });
    const now = provider.now?.() ?? Date.now();
    if (now - dailyStart >= day) { dailyStart = now; dailyCount = 0; }
    if (now - minuteStart >= 60000) { minuteStart = now; minuteCount = 0; }
    if (dailyCount >= 90 || minuteCount >= 10 || active >= 4) return reply.header('Retry-After', '60').code(429).send({ error: 'TOO_MANY_REQUESTS' });
    for (const [key, value] of recipients) if (now - value.start >= hour) recipients.delete(key);
    const key = createHash('sha256').update(address.toLowerCase()).digest('hex');
    const recent = recipients.get(key);
    if (recent && (recent.count >= 3 || now - recent.last < 60000)) return reply.header('Retry-After', '60').code(429).send({ error: 'TOO_MANY_REQUESTS' });
    // The global cap bounds this map too. Do not trust forwarded IP headers from clients.
    recipients.set(key, { count: (recent?.count ?? 0) + 1, start: recent?.start ?? now, last: now });
    dailyCount++; minuteCount++; active++;
    try {
      let generated: string;
      try { generated = await provider.createLink(mode, address); }
      catch (cause) {
        if (!authenticated && mode === 'resetPassword' && cause && typeof cause === 'object' && 'code' in cause && cause.code === 'auth/user-not-found') return { ok: true };
        throw cause;
      }
      const link = actionUrl(generated, mode, config, language);
      await provider.send({ id: randomUUID(), to: address, ...message(mode, language, link) });
      return { ok: true };
    } catch { return reply.code(503).send({ error: 'EMAIL_UNAVAILABLE' }); }
    finally { active--; }
  });
}
