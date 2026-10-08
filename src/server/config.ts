export interface Config {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  origin: string;
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

  const origin = env.APP_ORIGIN ?? (environment === 'production' ? '' : 'http://localhost:3000');
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

  return { environment: environment as Config['environment'], host, port, origin };
}
