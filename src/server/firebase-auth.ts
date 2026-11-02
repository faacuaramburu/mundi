import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { Config } from './config.js';

// Only Firebase's reserved sign-in helper resources are proxied. The upstream
// always comes from the validated project ID, never from a request parameter.
const resources = new Set(['handler', 'handler.js', 'iframe', 'iframe.js', 'experiments.js', 'links', 'links.js']);
export async function registerFirebaseAuth(app: FastifyInstance, config: Config, fetcher: typeof fetch = fetch): Promise<void> {
  if (!config.firebase) return;
  const upstream = `https://${config.firebase.projectId}.firebaseapp.com`;
  app.register(async scope => {
    scope.get('/__/auth/action', async (request, reply) => {
      const query = request.url.indexOf('?');
      reply.header('Cache-Control', 'no-store'); reply.header('X-Robots-Tag', 'noindex, nofollow');
      return reply.redirect(`/cuenta/accion.html${query < 0 ? '' : request.url.slice(query)}`, 302);
    });
    // The helper checks the same public web configuration used by the game.
    // This project does not deploy Firebase Hosting's generated init.json.
    scope.get('/__/firebase/init.json', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      reply.header('X-Robots-Tag', 'noindex, nofollow');
      return config.firebase;
    });
    scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    scope.route({
      method: ['GET', 'HEAD', 'POST'], url: '/__/auth/:resource', bodyLimit: 16384,
      handler: async (request, reply) => {
        const resource = (request.params as { resource: string }).resource;
        if (!resources.has(resource) || (request.method === 'POST' && resource !== 'handler')) return reply.code(404).send({ error: 'NOT_FOUND' });
        const queryStart = request.url.indexOf('?');
        const query = queryStart < 0 ? '' : request.url.slice(queryStart);
        const target = `${upstream}/__/auth/${resource}${query}`;
        try {
          const response = await fetcher(target, {
            method: request.method, redirect: 'manual', signal: AbortSignal.timeout(8000),
            ...(request.method === 'POST' ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: (request.body as Buffer).toString('utf8') } : {}),
          });
          const nonce = randomBytes(18).toString('base64');
          reply.code(response.status).type(response.headers.get('content-type') ?? 'application/octet-stream');
          reply.header('X-Robots-Tag', 'noindex, nofollow');
          reply.header('X-Frame-Options', 'SAMEORIGIN');
          // The popup navigates from this helper to Google and back. Giving the
          // helper its own opener isolation severs the SDK's window reference;
          // sign-in succeeds via storage but the blank popup stays for 15s.
          // The main game retains same-origin-allow-popups and its strict CSP.
          reply.header('Cross-Origin-Opener-Policy', 'unsafe-none');
          // The helper iframe must run within Mundi. These permissions apply only
          // to the reserved helpers; the game keeps its stricter policy.
          reply.header('Content-Security-Policy', [
            "default-src 'none'", `script-src 'self' 'nonce-${nonce}' https://apis.google.com https://www.gstatic.com`,
            "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https://www.gstatic.com",
            "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
            "frame-src 'self' https://accounts.google.com", "frame-ancestors 'self'", "form-action 'self' https://accounts.google.com",
            "base-uri 'none'", "object-src 'none'",
          ].join('; '));
          const location = response.headers.get('location');
          if (location) reply.header('Location', location.startsWith(`${upstream}/__/auth/`) ? location.slice(upstream.length) : location);
          if (request.method === 'HEAD') return reply.send();
          if (response.headers.get('content-type')?.startsWith('text/html')) {
            return reply.send((await response.text()).replaceAll('nonce="firebase-auth-helper"', `nonce="${nonce}"`));
          }
          return reply.send(Buffer.from(await response.arrayBuffer()));
        } catch { return reply.code(502).send({ error: 'AUTH_UNAVAILABLE' }); }
      },
    });
  });
}
