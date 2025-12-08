#!/usr/bin/env node

/**
 * Unity MCP Server
 * 
 * Main entry point for the Model Context Protocol server.
 * architecture:
 * - Dynamic module loading from ./tools directory
 * - Hot reload support
 * - Global error handling to prevent server crashes
 */

import { createMcpServer } from './utils/mcpServer.js';

// Global error handlers to ensure server stability
process.on('uncaughtException', (error) => {
  console.error('Server Uncaught Exception:', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Server Unhandled Rejection:', reason);
});

process.on('error', (error) => {
  console.error('Server Process Error:', error.message);
});

// Create and configure the MCP server
const server = createMcpServer({
  name: "unity-mcp",
  version: "2.0.0",
  modulesPath: './tools'
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  process.exit(0);
});

// Start the server
server.start();