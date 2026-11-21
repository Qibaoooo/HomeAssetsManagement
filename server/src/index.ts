import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, photosDir } from './config.js';
import { itemRoutes } from './routes/items.js';
import { syncRoutes } from './routes/sync.js';
import { startScheduler } from './sync.js';

const app = Fastify({ logger: { level: 'info' } });

await app.register(fastifyMultipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

// Item photos (resized webp) from the data directory.
await app.register(fastifyStatic, {
  root: photosDir,
  prefix: '/photos/',
  decorateReply: false,
  maxAge: '7d',
  immutable: false,
});

await app.register(itemRoutes);
await app.register(syncRoutes);

// Built client, if present, with SPA fallback for client-side routes.
// Files are looked up per request (wildcard route), so a new `vite build` is served without a restart.
const hasClient = fs.existsSync(path.join(config.clientDist, 'index.html'));
if (hasClient) {
  await app.register(fastifyStatic, { root: config.clientDist, prefix: '/', decorateReply: true, cacheControl: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/photos/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found' });
  });
}

startScheduler();

await app.listen({ host: config.host, port: config.port });

const lanAddrs = Object.values(os.networkInterfaces())
  .flat()
  .filter((n): n is os.NetworkInterfaceInfo => !!n && n.family === 'IPv4' && !n.internal)
  .map((n) => `http://${n.address}:${config.port}`);
app.log.info(`client ${hasClient ? 'served from client/dist' : 'NOT built; run "npm run build" or use the Vite dev server'}`);
app.log.info(`reachable on LAN at: ${lanAddrs.join(', ') || '(no LAN address found)'}`);
