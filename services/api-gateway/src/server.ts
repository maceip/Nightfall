import os from 'node:os';
import path from 'node:path';
import { NightfallOrchestrator } from '@nightfall/closed-loop-orchestrator';
import { createApiServer } from './index.js';

const port = Number(process.env.PORT) || 4000;
const defaultSqlitePath =
  process.env.NIGHTFALL_SQLITE_PATH ??
  path.join(os.homedir(), '.local', 'share', 'nightfall', 'nightfall.sqlite');

const orchestrator = new NightfallOrchestrator({
  sqlitePath: defaultSqlitePath,
  workspaceReposRoot:
    process.env.NIGHTFALL_WORKSPACE_REPOS_ROOT ??
    path.join(os.homedir(), '.local', 'share', 'nightfall', 'repos'),
  stagingTargetUrl: process.env.NIGHTFALL_STAGING_TARGET_URL || undefined,
});

await orchestrator.ensureBootstrapped();
const server = createApiServer(orchestrator);

server.listen(port, '0.0.0.0', () => {
  const toolchain = orchestrator.sandboxRuntime.getToolchainStatus();
  console.log(
    `[Nightfall API Gateway] Listening on http://localhost:${port} (SQLite: ${defaultSqlitePath}, LiteBox: ${toolchain.available ? 'ready' : 'unavailable'})`,
  );
});

const shutdown = async () => {
  await server.closeGracefully();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
