import type { FirebaseWebConfig } from '../shared/account.js';

export interface Config {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  origin: string;
  firebase?: FirebaseWebConfig;
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
        || value.authDomain !== `${value.projectId}.firebaseapp.com`
        || typeof value.apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(value.apiKey)
        || typeof value.appId !== 'string' || !/^1:\d+:web:[a-f0-9]+$/.test(value.appId)) throw new Error();
      firebase = { apiKey: value.apiKey, authDomain: value.authDomain, projectId: value.projectId, appId: value.appId };
    } catch { throw new Error('Invalid FIREBASE_WEB_CONFIG'); }
  }
  return { environment: environment as Config['environment'], host, port, origin, ...(firebase ? { firebase } : {}) };
}

