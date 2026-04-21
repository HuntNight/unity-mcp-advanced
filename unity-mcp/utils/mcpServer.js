import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logError, logInfo } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveModuleExport(moduleName, moduleExports) {
  if (moduleExports.default?.tools) {
    return moduleExports.default;
  }

  if (moduleExports[`${moduleName}Module`]?.tools) {
    return moduleExports[`${moduleName}Module`];
  }

  for (const value of Object.values(moduleExports)) {
    if (value?.tools) {
      return value;
    }
  }

  return null;
}

function normalizeToolEntries(moduleData) {
  if (Array.isArray(moduleData.tools)) {
    return moduleData.tools.map((tool) => [tool.name, tool]);
  }

  return Object.entries(moduleData.tools ?? {});
}

function normalizeToolResult(result) {
  if (result == null) {
    return { content: [{ type: 'text', text: '' }] };
  }

  if (typeof result === 'string') {
    return { content: [{ type: 'text', text: result }] };
  }

  if (Array.isArray(result)) {
    return { content: result };
  }

  if (Array.isArray(result.content)) {
    return {
      content: result.content,
      ...(result.isError ? { isError: true } : {})
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
  };
}

function normalizeToolError(error) {
  return {
    content: [
      {
        type: 'text',
        text: error?.message || String(error)
      }
    ],
    isError: true
  };
}

export function createMcpServer({ name, version, modulesPath = '../tools' }) {
  const server = new Server({ name, version }, { capabilities: { tools: {} } });
  const toolsDir = path.resolve(__dirname, '..', modulesPath);
  const loadedModules = new Map();
  const loadedTools = new Map();

  async function loadModulesFromDirectory() {
    const entries = fs
      .readdirSync(toolsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    loadedModules.clear();
    loadedTools.clear();

    for (const filename of entries) {
      const filePath = path.join(toolsDir, filename);
      const moduleName = path.basename(filename, '.js');
      const moduleUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
      const moduleExports = await import(moduleUrl);
      const moduleData = resolveModuleExport(moduleName, moduleExports);

      if (!moduleData?.tools) {
        continue;
      }

      const namespace = moduleData.namespace || moduleData.name || moduleName;
      const registeredTools = [];

      for (const [toolName, toolConfig] of normalizeToolEntries(moduleData)) {
        if (!toolName || typeof toolConfig?.handler !== 'function') {
          continue;
        }

        const fullName = `${namespace}_${toolName}`;
        loadedTools.set(fullName, {
          name: fullName,
          description: toolConfig.description || '',
          inputSchema: toolConfig.inputSchema || { type: 'object', properties: {} },
          handler: toolConfig.handler
        });
        registeredTools.push(fullName);
      }

      loadedModules.set(namespace, {
        namespace,
        description: moduleData.description || '',
        tools: registeredTools
      });
    }

    logInfo(`Loaded ${loadedTools.size} tools from ${loadedModules.size} modules`);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Array.from(loadedTools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args = {} } = request.params;
    const tool = loadedTools.get(toolName);

    if (!tool) {
      return normalizeToolError(new Error(`Tool not found: ${toolName}`));
    }

    try {
      const result = await tool.handler(args);
      return normalizeToolResult(result);
    } catch (error) {
      logError(`Tool "${toolName}" failed: ${error?.stack || error?.message || error}`);
      return normalizeToolError(error);
    }
  });

  return {
    get loadedModules() {
      return loadedModules;
    },
    get allTools() {
      return loadedTools;
    },
    async start() {
      await loadModulesFromDirectory();
      const transport = new StdioServerTransport();
      await server.connect(transport);
    }
  };
}