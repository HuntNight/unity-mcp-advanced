/**
 * Unity Bridge MCP Module - Transparent Bridge
 * 
 * Simplified architecture:
 * • Unity returns a ready-to-use array of messages
 * • JS simply forwards data without processing
 * • Maximum transparency
 */

import axios from 'axios';

const UNITY_BASE_URL = 'http://localhost:7777';

/**
 * Конвертер Unity messages в MCP формат
 */
function convertToMCPResponse(unityResponse) {
  const normalize = (resp) => {
    let data = resp;
    // Если пришла строка — пробуем распарсить JSON
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { /* ignore */ }
    }
    // Если верхний уровень — массив сообщений
    if (Array.isArray(data)) {
      return { messages: data };
    }
    // Если messages — строка с JSON
    if (data && typeof data.messages === 'string') {
      try {
        const parsed = JSON.parse(data.messages);
        if (Array.isArray(parsed)) data.messages = parsed;
      } catch { /* ignore */ }
    }
    // Если messages — объект-словарь, превращаем в массив
    if (data && data.messages && !Array.isArray(data.messages) && typeof data.messages === 'object') {
      data.messages = Object.values(data.messages);
    }
    return data;
  };

  const unityData = normalize(unityResponse);

  // Новая Unity архитектура возвращает { messages: [...] }
  if (unityData && Array.isArray(unityData.messages)) {
    const content = [];
    for (const msg of unityData.messages) {
      if (msg && msg.type === 'text') {
        content.push({ type: 'text', text: String(msg.content ?? '') });
      } else if (msg && msg.type === 'image') {
        if (msg.text) {
          content.push({ type: 'text', text: String(msg.text) });
        }
        content.push({ type: 'image', data: String(msg.content ?? ''), mimeType: 'image/png' });
      }
    }
    if (content.length > 0) return { content };
  }

  // Fallback для старого формата Unity API
  return convertLegacyResponse(unityData ?? unityResponse);
}

/**
 * Fallback для старого формата Unity (временно)
 */
function convertLegacyResponse(unityData) {
  const content = [];

  // Основное сообщение
  if (unityData && unityData.message) {
    content.push({ type: 'text', text: String(unityData.message) });
  }

  // Данные результата
  if (unityData && unityData.data && unityData.data !== unityData.message) {
    content.push({ type: 'text', text: typeof unityData.data === 'string' ? unityData.data : JSON.stringify(unityData.data) });
  }

  // Изображение для скриншотов
  if (unityData && unityData.image) {
    content.push({ type: 'text', text: 'Unity Screenshot' });
    content.push({ type: 'image', data: String(unityData.image), mimeType: 'image/png' });
  }

  // Ошибки Unity
  if (unityData && unityData.errors && unityData.errors.length > 0) {
    const errorText = unityData.errors.map(err => {
      if (typeof err === 'object') {
        const level = err.Level || err.level || 'Info';
        const message = err.Message || err.message || 'Unknown error';
        return `${level}: ${message}`;
      }
      return err?.toString?.() ?? String(err);
    }).join('\n');
    content.push({ type: 'text', text: `Unity Logs:\n${errorText}` });
  }

  // Если нет контента — показываем сырой ответ, чтобы не терять данные
  if (content.length === 0) {
    try {
      content.push({ type: 'text', text: `Raw Unity response: ${JSON.stringify(unityData)}` });
    } catch {
      content.push({ type: 'text', text: `Raw Unity response (non-serializable)` });
    }
  }

  return { content };
}

/**
 * Универсальный обработчик Unity запросов
 */
async function handleUnityRequest(endpoint, data = {}, timeout = 10000) {
  try {
    // 🚀 Убеждаемся что данные корректно сериализуются в UTF-8
    const jsonData = JSON.stringify(data);

    const response = await axios.post(`${UNITY_BASE_URL}${endpoint}`, jsonData, {
      timeout,
      responseType: 'json',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json; charset=utf-8'
      }
    });

    return convertToMCPResponse(response.data);
  } catch (error) {
    const errorContent = [{
      type: 'text',
      text: `Unity Connection Error: ${error.message}\n\nПроверьте:\n• Unity запущен\n• Unity Bridge Window открыт\n• HTTP сервер работает на порту 7777`
    }];

    // Добавляем детали ошибки если есть
    if (error.response?.data) {
      try {
        const unityError = convertToMCPResponse(error.response.data);
        errorContent.push(...unityError.content);
      } catch {
        errorContent.push({
          type: 'text',
          text: `Unity Error Details: ${JSON.stringify(error.response.data)}`
        });
      }
    }

    return { content: errorContent };
  }
}

// Unity инструменты
const unityTools = [
  {
    name: "screenshot",
    description: 'Captures a high-resolution screenshot from the Unity Editor\'s Game View or Scene View. The image is returned as base64 encoded data. This tool is useful for verifying visual changes, UI layouts, or rendering artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        width: {
          type: 'number',
          minimum: 256,
          maximum: 4096,
          description: 'The width of the screenshot in pixels. Range: 256-4096.'
        },
        height: {
          type: 'number',
          minimum: 256,
          maximum: 4096,
          description: 'The height of the screenshot in pixels. Range: 256-4096.'
        },
        view_type: {
          type: 'string',
          enum: ['game', 'scene'],
          default: 'game',
          description: 'Specifies the source view for the screenshot: \'game\' for the Game View (default) or \'scene\' for the Scene View.'
        },
      },
    },
    required: [],
    handler: async (params) => {
      const requestBody = {};
      if (typeof params?.width === 'number') requestBody.width = params.width;
      if (typeof params?.height === 'number') requestBody.height = params.height;
      if (typeof params?.view_type === 'string') requestBody.view_type = params.view_type;
      return await handleUnityRequest('/api/screenshot', requestBody);
    }
  },

  {
    name: "camera_screenshot",
    description: 'Renders a screenshot from a specific virtual camera position in the scene, defined by world coordinates and a target focus point. Allows for validating scene composition from exact angles without moving the main scene camera.',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'The world space coordinates [x, y, z] of the camera.'
        },
        target: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'The world space coordinates [x, y, z] the camera should face.'
        },
        width: {
          type: 'number',
          default: 1920,
          minimum: 256,
          maximum: 4096,
          description: 'The pixel width of the generated screenshot.'
        },
        height: {
          type: 'number',
          default: 1080,
          minimum: 256,
          maximum: 4096,
          description: 'The pixel height of the generated screenshot.'
        },
        fov: {
          type: 'number',
          default: 60,
          minimum: 10,
          maximum: 179,
          description: 'The field of view in degrees.'
        },
      },
    },
    required: ['position', 'target'],
    handler: async (params) => {
      const requestBody = {
        position: params.position,
        target: params.target,
        fov: params.fov || 60,
        width: params.width || 1920,
        height: params.height || 1080
      };

      return await handleUnityRequest('/api/camera_screenshot', requestBody, 20000);
    }
  },

  {
    name: "scene_hierarchy",
    description: 'Retrieves the hierarchy of GameObjects in the active Unity scene. Supports filtering by name (Exact, Glob, Regex), tag, and hierarchy depth. Returns a structured list of objects including names, InstanceIDs, and attached components. Useful for mapping the scene structure or locating specific objects.',
    inputSchema: {
      type: 'object',
      properties: {
        name_glob: { type: 'string', description: 'Filter objects by name using glob patterns (e.g., \'Player*\').' },
        name_regex: { type: 'string', description: 'Filter objects by name using C# regular expressions.' },
        tag_glob: { type: 'string', description: 'Filter objects by tag using glob patterns.' },
        path: { type: 'string', description: 'Limits the search to a specific subtree path (e.g., \'World/Level1\').' },
        max_results: {
          type: 'number',
          default: 0,
          description: 'Maximum number of results to return (0 for unlimited).'
        },
        max_depth: {
          type: 'number',
          default: -1,
          description: 'Maximum traversal depth in the hierarchy (-1 for unlimited).'
        },
        allow_large_response: {
          type: 'boolean',
          default: false,
          description: 'If true, bypasses the standard response size limit (use with caution needed for large hierarchies).'
        },
        summary: {
          type: 'boolean',
          default: false,
          description: 'If true, returns only statistical data (count of scanned/matched objects) without the full object list.'
        }
      },
    },
    required: [],
    handler: async (params) => {
      const requestBody = {
        name_glob: params.name_glob,
        name_regex: params.name_regex,
        tag_glob: params.tag_glob,
        path: params.path,
        max_results: typeof params.max_results === 'number' ? params.max_results : undefined,
        max_depth: typeof params.max_depth === 'number' ? params.max_depth : undefined,
        allow_large_response: !!params.allow_large_response,
        summary: !!params.summary
      };

      return await handleUnityRequest('/api/scene_hierarchy', requestBody, 15000);
    }
  },

  {
    name: "execute",
    description: 'Executes arbitrary C# code within the running Unity Editor environment. Supports local functions, LINQ, and Unity API calls. This tool allows for dynamic scripting, object manipulation, and state verification. Note: Code is wrapped in a method body; class/struct definitions are not supported directly.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The C# code snippet to execute.'
        },
        safe_mode: {
          type: 'boolean',
          default: true,
          description: 'Enables basic static analysis to prevent obviously destructive operations (default: true).'
        },
        validate_only: {
          type: 'boolean',
          default: false,
          description: 'If true, compiles the code to check for syntax errors without executing it.'
        },
        allow_large_response: {
          type: 'boolean',
          default: false,
          description: 'If true, allows the return of large string payloads exceeding standard limits.'
        },
      },
    },
    required: ['code'],
    handler: async (params) => {
      const requestBody = {
        code: params.code,
        safe_mode: params.safe_mode !== false,
        validate_only: !!params.validate_only,
        allow_large_response: !!params.allow_large_response
      };

      return await handleUnityRequest('/api/execute', requestBody, 30000);
    }
  },

  {
    name: "scene_grep",
    description: 'Performs advanced querying of the Unity scene using a SQL-like DSL. Supports filtering objects (WHERE clause) based on properties, components, names, and tags, and selecting specific data fields (SELECT clause). Ideal for complex scene introspection and validation.',
    inputSchema: {
      type: 'object',
      properties: {
        name_glob: { type: 'string', description: 'Filter by object name using glob patterns.' },
        name_regex: { type: 'string', description: 'Filter by object name using regular expressions.' },
        tag_glob: { type: 'string', description: 'Filter by object tag.' },
        where: { type: 'string', description: 'The filtering condition using DSL (e.g., \'active == true and Light.intensity > 0\'). Supports comparison operators, logical operators, and property access.' },
        select: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of fields or properties to retrieve for matching objects (e.g., [\'GameObject.name\', \'Transform.position\']).'
        },
        max_results: { type: 'number', default: 100, description: 'Limit the number of returned matches.' },
        path: { type: 'string', description: 'Restrict search to a specific hierarchy path.' },
        max_depth: { type: 'number', default: -1, description: 'Maximum depth for recursive search.' },
        allow_large_response: {
          type: 'boolean',
          default: false,
          description: 'Permit large response payloads.'
        }
      },
    },
    required: [],
    handler: async (params) => {
      const requestBody = {
        name_glob: params.name_glob,
        name_regex: params.name_regex,
        tag_glob: params.tag_glob,
        where: typeof params.where === 'string' ? params.where : undefined,
        select: Array.isArray(params.select) ? params.select : undefined,
        max_results: typeof params.max_results === 'number' ? params.max_results : 100,
        allow_large_response: !!params.allow_large_response,
        path: params.path,
        max_depth: typeof params.max_depth === 'number' ? params.max_depth : undefined
      };
      return await handleUnityRequest('/api/scene_grep', requestBody, 20000);
    }
  },

  {
    name: "play_mode",
    description: 'Controls the Play Mode state of the Unity Editor. Can be used to start or stop the game simulation programmatically.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Set to true to enter Play Mode, or false to exit Play Mode.'
        }
      },
    },
    required: ['enabled'],
    handler: async (params) => {
      return await handleUnityRequest('/api/play_mode', { enabled: params.enabled });
    }
  },

  {
    name: "scene_radius",
    description: 'Performs a spatial search to find all Colliders within a specified spherical radius from a center point. Returns a list of objects physically present in that volume.',
    inputSchema: {
      type: 'object',
      properties: {
        center: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'The center point [x, y, z] of the search sphere.'
        },
        radius: {
          type: 'number',
          description: 'The radius of the search sphere.'
        }
      },
    },
    required: ['center', 'radius'],
    handler: async (params) => {
      return await handleUnityRequest('/api/scene_radius', {
        center_position: params.center,
        radius: params.radius
      });
    }
  }
];

export const unityModule = {
  name: 'unity',
  description: 'Unity Bridge: specific AI ↔ Unity3D interface. Execute C# code, capture screenshots, and analyze scene structure.',
  tools: unityTools,

  decorators: {
    disableSystemInfo: true,
    disableDebugLogs: true
  }
}; 