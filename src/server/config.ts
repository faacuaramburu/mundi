import type { FirebaseWebConfig } from '../shared/account.js';
import { createPrivateKey } from 'node:crypto';

export interface AccountMailConfig {
  resendApiKey: string;
  serviceAccount: { projectId: string; clientEmail: string; privateKey: string };
}

export interface Config {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  origin: string;
  firebase?: FirebaseWebConfig;
  accountMail?: AccountMailConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const environment = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(environment)) {
    throw new Error('Invalid NODE_ENV');
  }

  const portText = env.PORT ?? '3000';
  if (!/^\d{1,5}$/.test(portText)) throw new Error('Invalid PORT');
  const port = Number(portText);
  if (port < 1 || port > 65535) throw new Error('Invalid PORT');

  const renderOrigin = environment === 'production' && env.RENDER === 'true' ? env.RENDER_EXTERNAL_URL : undefined;
  const origin = env.APP_ORIGIN ?? renderOrigin ?? (environment === 'production' ? '' : environment === 'development' ? 'http://127.0.0.1:5173' : 'http://localhost:3000');
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('Invalid APP_ORIGIN');
  }
  if (url.origin !== origin || url.username || url.password) {
    throw new Error('APP_ORIGIN must be an exact origin');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(environment !== 'production' && local && url.protocol === 'http:')) {
    throw new Error('APP_ORIGIN must use HTTPS outside local development');
  }

  const host = env.HOST ?? (environment === 'production' ? '0.0.0.0' : '127.0.0.1');
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host)) throw new Error('Invalid HOST');

  let firebase: FirebaseWebConfig | undefined;
  if (env.FIREBASE_WEB_CONFIG) {
    try {
      const value = JSON.parse(env.FIREBASE_WEB_CONFIG) as Partial<FirebaseWebConfig>;
      if (typeof value.projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value.projectId)
        || (value.authDomain !== `${value.projectId}.firebaseapp.com` && !(url.protocol === 'https:' && value.authDomain === url.hostname))
        || typeof value.apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(value.apiKey)
        || typeof value.appId !== 'string' || !/^1:\d+:web:[a-f0-9]+$/.test(value.appId)) throw new Error();
      firebase = { apiKey: value.apiKey, authDomain: value.authDomain, projectId: value.projectId, appId: value.appId };
    } catch { throw new Error('Invalid FIREBASE_WEB_CONFIG'); }
  }
  let accountMail: AccountMailConfig | undefined;
  if (env.RESEND_API_KEY || env.FIREBASE_MAIL_SERVICE_ACCOUNT) {
    try {
      if (!firebase || !env.RESEND_API_KEY || !/^re_[A-Za-z0-9_-]{15,200}$/.test(env.RESEND_API_KEY)) throw new Error();
      const value = JSON.parse(env.FIREBASE_MAIL_SERVICE_ACCOUNT ?? '') as Record<string, unknown>;
      if (value.project_id !== firebase.projectId || typeof value.client_email !== 'string'
        || !value.client_email.endsWith(`@${firebase.projectId}.iam.gserviceaccount.com`)
        || typeof value.private_key !== 'string') throw new Error();
      const key = createPrivateKey(value.private_key);
      if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
      accountMail = { resendApiKey: env.RESEND_API_KEY, serviceAccount: { projectId: firebase.projectId, clientEmail: value.client_email, privateKey: value.private_key } };
    } catch { throw new Error('Invalid account email configuration'); }
  }
  return { environment: environment as Config['environment'], host, port, origin, ...(firebase ? { firebase } : {}), ...(accountMail ? { accountMail } : {}) };
}
