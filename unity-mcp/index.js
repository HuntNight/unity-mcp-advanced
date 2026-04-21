import { createMcpServer } from './utils/mcpServer.js';

process.on('uncaughtException', (error) => {
  console.error(error?.stack || error?.message || error);
});

process.on('unhandledRejection', (reason) => {
  console.error(reason);
});

const server = createMcpServer({
  name: 'unity-mcp',
  version: '3.0.0',
  modulesPath: './tools'
});

process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

await server.start();