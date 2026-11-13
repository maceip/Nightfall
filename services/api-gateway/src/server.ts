import { createApiServer } from './index.js';

const port = Number(process.env.PORT) || 4000;
const server = createApiServer();

server.listen(port, '0.0.0.0', () => {
  console.log(`[Nightfall API Gateway] Listening on http://localhost:${port}`);
});

const shutdown = async () => {
  await server.closeGracefully();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
