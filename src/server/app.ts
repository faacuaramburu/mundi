import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';

export function createApp(config: Config, serveClient = true) {
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

  app.get('/health', {
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

  if (serveClient) {
    app.register(staticFiles, {
      root: fileURLToPath(new URL('../client/', import.meta.url)),
      dotfiles: 'deny',
      index: ['index.html'],
    });
  }

  return app;
}
