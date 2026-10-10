import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import websocket from '@fastify/websocket';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import { registerMultiplayer } from './multiplayer.js';
import type { Rooms } from './rooms.js';

export function createApp(config: Config, serveClient = true, rooms?: Rooms) {
  const production = config.environment === 'production';
  const app = Fastify({
    logger: false,
    trustProxy: false,
    bodyLimit: 2048,
    requestTimeout: 10000,
    connectionTimeout: 10000,
    keepAliveTimeout: 5000,
    ajv: {
      customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false },
    },
  });

  app.server.maxConnections = 512;
  app.register(websocket, { options: { maxPayload: 1024, perMessageDeflate: false } });
  app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'", config.origin.replace(/^http/, 'ws')],
        fontSrc: ["'self'"],
        baseUri: ["'none'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
        ...(production ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    hsts: production ? { maxAge: 31536000, includeSubDomains: false } : false,
    referrerPolicy: { policy: 'no-referrer' },
    xFrameOptions: { action: 'deny' },
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((error, _request, reply) => {
    const errorStatus = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const statusCode = typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500
      ? errorStatus : 500;
    reply.code(statusCode).send({ error: statusCode === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST' });
  });
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.register(async (scope) => {
    scope.addHook('onRequest', async (request, reply) => {
      if (!request.headers.upgrade) return;
      if (request.headers.origin !== config.origin) {
        await reply.code(403).send({ error: 'FORBIDDEN' });
      } else if (!/^\/api\/rooms\/[A-Za-z0-9_-]{24}\/socket$/.test(request.url)) {
        await reply.code(404).send({ error: 'NOT_FOUND' });
      }
    });
    scope.get('/health', {
      schema: {
        querystring: { type: 'object', properties: {}, additionalProperties: false },
        response: {
          200: {
            type: 'object',
            properties: { status: { type: 'string', const: 'ok' } },
            required: ['status'],
            additionalProperties: false,
          },
        },
      },
    }, async () => ({ status: 'ok' }));

    scope.register(async (roomScope) => { await registerMultiplayer(roomScope, config, rooms); });

    if (serveClient) {
      scope.register(staticFiles, {
        root: fileURLToPath(new URL('../client/', import.meta.url)),
        dotfiles: 'deny',
        index: ['index.html'],
      });
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!production || request.headers.upgrade || !['GET', 'HEAD'].includes(request.method)) return;
    if (request.url.split('?')[0] === '/health' || request.url.startsWith('/api/')) return;
    const hostname = request.hostname.toLowerCase();
    if (hostname.endsWith('.onrender.com') && hostname !== new URL(config.origin).hostname) {
      await reply.redirect(`${config.origin}${request.url}`, 308);
    }
  });

  return app;
}
