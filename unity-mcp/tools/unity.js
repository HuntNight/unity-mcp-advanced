import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SCREENSHOT_PATH = path.join(ROOT_DIR, 'unity-mcp-screenshot.png');
const DEFAULT_PORT = Number(process.env.UNITY_MCP_PORT || 7777);
const DEFAULT_BASE_URL = process.env.UNITY_MCP_BASE_URL || `http://localhost:${DEFAULT_PORT}`;
const DEFAULT_SCOPE = 'active_scene';
const RUNTIME_FRIENDLY_SCOPE = 'all_loaded_objects';
const SCENE_SCOPE_SCHEMA = {
  type: 'string',
  enum: ['active_scene', 'all_loaded_scenes', 'dont_destroy_on_load', 'all_loaded_objects'],
  default: DEFAULT_SCOPE,
  description: 'Search scope for scene tools.'
};

function stringifyValue(value) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeUnityPayload(payload) {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return { success: true, messages: [{ type: 'text', content: payload }] };
    }
  }

  if (Array.isArray(payload)) {
    return { success: true, messages: payload };
  }

  return payload || {};
}

function normalizeUnityMessages(payload) {
  const normalized = normalizeUnityPayload(payload);
  const content = [];
  const messages = Array.isArray(normalized.messages) ? normalized.messages : [];

  for (const message of messages) {
    if (!message || !message.type) {
      continue;
    }

    if (message.type === 'image') {
      if (message.text) {
        content.push({ type: 'text', text: String(message.text) });
      }

      content.push({
        type: 'image',
        data: String(message.content ?? ''),
        mimeType: message.mimeType || 'image/png'
      });
      continue;
    }

    content.push({
      type: 'text',
      text: String(message.content ?? '')
    });
  }

  if (content.length === 0) {
    if (normalized.data != null) {
      content.push({ type: 'text', text: stringifyValue(normalized.data) });
    } else if (normalized.error) {
      content.push({ type: 'text', text: String(normalized.error) });
    } else {
      content.push({ type: 'text', text: stringifyValue(normalized) });
    }
  }

  if (normalized.errorCode) {
    content.push({ type: 'text', text: `errorCode: ${normalized.errorCode}` });
  }

  if (Array.isArray(normalized.logs) && normalized.logs.length > 0) {
    content.push({ type: 'text', text: `Unity logs:\n${normalized.logs.join('\n')}` });
  }

  if (normalized.meta?.requestId || normalized.meta?.durationMs != null) {
    const metaParts = [];
    if (normalized.meta.requestId) {
      metaParts.push(`requestId=${normalized.meta.requestId}`);
    }
    if (normalized.meta.durationMs != null) {
      metaParts.push(`durationMs=${normalized.meta.durationMs}`);
    }
    if (metaParts.length > 0) {
      content.push({ type: 'text', text: `meta: ${metaParts.join(', ')}` });
    }
  }

  return {
    content,
    isError: normalized.success === false
  };
}

function getBaseUrlCandidates() {
  const candidates = [DEFAULT_BASE_URL];

  try {
    const parsed = new URL(DEFAULT_BASE_URL);
    const alternateHost = parsed.hostname === 'localhost'
      ? '127.0.0.1'
      : parsed.hostname === '127.0.0.1'
        ? 'localhost'
        : null;

    if (alternateHost) {
      const alternate = new URL(DEFAULT_BASE_URL);
      alternate.hostname = alternateHost;
      candidates.push(alternate.toString().replace(/\/$/, ''));
    }
  } catch {
  }

  return [...new Set(candidates)];
}

async function callUnity(endpoint, body = {}, { timeout = 10000, method = 'POST' } = {}) {
  const baseUrls = getBaseUrlCandidates();
  let lastError = null;

  for (const baseUrl of baseUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json'
        },
        body: method === 'GET' ? undefined : JSON.stringify(body),
        signal: controller.signal
      });

      const text = await response.text();
      let payload = {};

      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { success: response.ok, messages: [{ type: 'text', content: text }] };
      }

      const normalized = normalizeUnityMessages(payload);
      if (!response.ok && !normalized.isError) {
        normalized.isError = true;
      }
      return normalized;
    } catch (error) {
      lastError = `${error.message}\nBase URL: ${baseUrl}`;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Unity connection failed: ${lastError ?? 'unknown error'}`
      }
    ]
  };
}

async function saveScreenshotIfPresent(response) {
  const image = response?.content?.find((item) => item?.type === 'image' && typeof item.data === 'string');
  if (!image) {
    return response;
  }

  try {
    await fs.rm(SCREENSHOT_PATH, { force: true });
    await fs.writeFile(SCREENSHOT_PATH, Buffer.from(image.data, 'base64'));
    response.content.unshift({ type: 'text', text: `Saved screenshot: ${SCREENSHOT_PATH}` });
  } catch (error) {
    response.content.unshift({ type: 'text', text: `Failed to save screenshot: ${error.message}` });
  }

  return response;
}

function withScope(params = {}, fallbackScope = DEFAULT_SCOPE) {
  return {
    scope: typeof params.scope === 'string' ? params.scope : fallbackScope
  };
}

const unityTools = [
  {
    name: 'health',
    description: 'Checks whether the Unity Bridge server is reachable and returns bridge diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => callUnity('/api/health', {}, { timeout: 5000 })
  },
  {
    name: 'screenshot',
    description: 'Captures a screenshot from the Unity Game View or Scene View.',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', minimum: 256, maximum: 4096, description: 'Screenshot width in pixels.' },
        height: { type: 'number', minimum: 256, maximum: 4096, description: 'Screenshot height in pixels.' },
        view_type: { type: 'string', enum: ['game', 'scene'], default: 'game', description: 'Source view.' }
      }
    },
    handler: async (params) => saveScreenshotIfPresent(await callUnity('/api/screenshot', {
      width: params.width,
      height: params.height,
      view_type: params.view_type
    }, { timeout: 20000 }))
  },
  {
    name: 'camera_screenshot',
    description: 'Renders a screenshot from an existing Unity camera or from a temporary virtual camera.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name: { type: 'string', description: 'Exact object name when capturing from an existing camera.' },
        path: { type: 'string', description: 'Exact object path when capturing from an existing camera.' },
        instance_id: { type: 'number', description: 'Unity instance id when capturing from an existing camera.' },
        position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Camera world position.' },
        target: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Camera target world position.' },
        width: { type: 'number', default: 1920, minimum: 256, maximum: 4096, description: 'Screenshot width in pixels.' },
        height: { type: 'number', default: 1080, minimum: 256, maximum: 4096, description: 'Screenshot height in pixels.' },
        fov: { type: 'number', default: 60, minimum: 10, maximum: 179, description: 'Camera field of view for virtual camera capture.' },
        include_inactive: { type: 'boolean', default: true, description: 'Include inactive objects when resolving an existing camera.' }
      }
    },
    handler: async (params) => saveScreenshotIfPresent(await callUnity('/api/camera_screenshot', {
      ...withScope(params, RUNTIME_FRIENDLY_SCOPE),
      name: params.name,
      path: params.path,
      instance_id: params.instance_id,
      position: params.position,
      target: params.target,
      width: params.width,
      height: params.height,
      fov: params.fov,
      include_inactive: params.include_inactive
    }, { timeout: 20000 }))
  },
  {
    name: 'list_scenes',
    description: 'Lists all loaded Unity scenes, including DontDestroyOnLoad when present.',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => callUnity('/api/list_scenes')
  },
  {
    name: 'find_objects',
    description: 'Finds scene objects across the selected scope by name, tag, path, component, or instance id.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name_glob: { type: 'string', description: 'Glob filter for object names.' },
        name_regex: { type: 'string', description: 'Regex filter for object names.' },
        tag_glob: { type: 'string', description: 'Glob filter for tags.' },
        path: { type: 'string', description: 'Path filter for hierarchy traversal.' },
        component: { type: 'string', description: 'Matches objects that contain a component name.' },
        instance_id: { type: 'number', description: 'Exact Unity instance id.' },
        max_results: { type: 'number', default: 100, description: 'Maximum number of results.' },
        include_inactive: { type: 'boolean', default: true, description: 'Include inactive objects.' }
      }
    },
    handler: async (params) => callUnity('/api/find_objects', {
      ...withScope(params, RUNTIME_FRIENDLY_SCOPE),
      name_glob: params.name_glob,
      name_regex: params.name_regex,
      tag_glob: params.tag_glob,
      path: params.path,
      component: params.component,
      instance_id: params.instance_id,
      max_results: params.max_results,
      include_inactive: params.include_inactive
    })
  },
  {
    name: 'inspect_object',
    description: 'Returns detailed information about a single Unity object by name, path, or instance id.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name: { type: 'string', description: 'Exact object name.' },
        path: { type: 'string', description: 'Exact object path.' },
        instance_id: { type: 'number', description: 'Unity instance id.' },
        include_children: { type: 'boolean', default: true, description: 'Include child objects in the response.' },
        include_component_values: { type: 'boolean', default: false, description: 'Include curated component values for common component types.' }
      }
    },
    handler: async (params) => callUnity('/api/inspect_object', {
      ...withScope(params, RUNTIME_FRIENDLY_SCOPE),
      name: params.name,
      path: params.path,
      instance_id: params.instance_id,
      include_children: params.include_children,
      include_component_values: params.include_component_values
    })
  },
  {
    name: 'set_transform',
    description: 'Updates Transform values on a Unity object without using dynamic C# execution.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name: { type: 'string', description: 'Exact object name.' },
        path: { type: 'string', description: 'Exact object path.' },
        instance_id: { type: 'number', description: 'Unity instance id.' },
        position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'World position.' },
        local_position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Local position.' },
        rotation: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'World Euler rotation.' },
        local_rotation: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Local Euler rotation.' },
        local_scale: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Local scale.' },
        include_inactive: { type: 'boolean', default: true, description: 'Include inactive objects when resolving the target.' }
      }
    },
    handler: async (params) => callUnity('/api/set_transform', {
      ...withScope(params, RUNTIME_FRIENDLY_SCOPE),
      name: params.name,
      path: params.path,
      instance_id: params.instance_id,
      position: params.position,
      local_position: params.local_position,
      rotation: params.rotation,
      local_rotation: params.local_rotation,
      local_scale: params.local_scale,
      include_inactive: params.include_inactive
    })
  },
  {
    name: 'set_light',
    description: 'Updates Light component values on a Unity object without using dynamic C# execution.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name: { type: 'string', description: 'Exact object name.' },
        path: { type: 'string', description: 'Exact object path.' },
        instance_id: { type: 'number', description: 'Unity instance id.' },
        intensity: { type: 'number', description: 'Light intensity.' },
        range: { type: 'number', description: 'Light range.' },
        spot_angle: { type: 'number', description: 'Spot angle in degrees.' },
        shadow_strength: { type: 'number', description: 'Shadow strength.' },
        color: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 4, description: 'RGBA color in 0..1 range.' },
        light_type: { type: 'string', description: 'Light type enum value.' },
        shadows: { type: 'string', description: 'Light shadows enum value.' },
        enabled: { type: 'boolean', description: 'Enable or disable the Light component.' },
        include_inactive: { type: 'boolean', default: true, description: 'Include inactive objects when resolving the target.' }
      }
    },
    handler: async (params) => callUnity('/api/set_light', {
      ...withScope(params, RUNTIME_FRIENDLY_SCOPE),
      name: params.name,
      path: params.path,
      instance_id: params.instance_id,
      intensity: params.intensity,
      range: params.range,
      spot_angle: params.spot_angle,
      shadow_strength: params.shadow_strength,
      color: params.color,
      light_type: params.light_type,
      shadows: params.shadows,
      enabled: params.enabled,
      include_inactive: params.include_inactive
    })
  },
  {
    name: 'set_camera',
    description: 'Updates Camera component values on a Unity object without using dynamic C# execution.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name: { type: 'string', description: 'Exact object name.' },
        path: { type: 'string', description: 'Exact object path.' },
        instance_id: { type: 'number', description: 'Unity instance id.' },
        field_of_view: { type: 'number', description: 'Camera field of view.' },
        near_clip_plane: { type: 'number', description: 'Camera near clip plane.' },
        far_clip_plane: { type: 'number', description: 'Camera far clip plane.' },
        orthographic: { type: 'boolean', description: 'Use orthographic projection.' },
        orthographic_size: { type: 'number', description: 'Orthographic size.' },
        enabled: { type: 'boolean', description: 'Enable or disable the Camera component.' },
        clear_flags: { type: 'string', description: 'Camera clear flags enum value.' },
        background_color: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 4, description: 'RGBA background color in 0..1 range.' },
        include_inactive: { type: 'boolean', default: true, description: 'Include inactive objects when resolving the target.' }
      }
    },
    handler: async (params) => callUnity('/api/set_camera', {
      ...withScope(params, RUNTIME_FRIENDLY_SCOPE),
      name: params.name,
      path: params.path,
      instance_id: params.instance_id,
      field_of_view: params.field_of_view,
      near_clip_plane: params.near_clip_plane,
      far_clip_plane: params.far_clip_plane,
      orthographic: params.orthographic,
      orthographic_size: params.orthographic_size,
      enabled: params.enabled,
      clear_flags: params.clear_flags,
      background_color: params.background_color,
      include_inactive: params.include_inactive
    })
  },
  {
    name: 'set_active',
    description: 'Sets the active state of a Unity object without using dynamic C# execution.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name: { type: 'string', description: 'Exact object name.' },
        path: { type: 'string', description: 'Exact object path.' },
        instance_id: { type: 'number', description: 'Unity instance id.' },
        active: { type: 'boolean', description: 'Target activeSelf state.' }
      },
      required: ['active']
    },
    handler: async (params) => callUnity('/api/set_active', {
      ...withScope(params, RUNTIME_FRIENDLY_SCOPE),
      name: params.name,
      path: params.path,
      instance_id: params.instance_id,
      active: params.active
    })
  },
  {
    name: 'scene_hierarchy',
    description: 'Lists objects from the selected Unity scope with hierarchy filtering and summary mode.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name_glob: { type: 'string', description: 'Glob filter for object names.' },
        name_regex: { type: 'string', description: 'Regex filter for object names.' },
        tag_glob: { type: 'string', description: 'Glob filter for tags.' },
        path: { type: 'string', description: 'Hierarchy path filter.' },
        max_results: { type: 'number', default: 0, description: 'Maximum number of returned rows. 0 means unlimited.' },
        max_depth: { type: 'number', default: -1, description: 'Maximum traversal depth. -1 means unlimited.' },
        allow_large_response: { type: 'boolean', default: false, description: 'Allow larger payloads from Unity.' },
        summary: { type: 'boolean', default: false, description: 'Return only scan statistics.' },
        include_inactive: { type: 'boolean', default: true, description: 'Include inactive objects.' }
      }
    },
    handler: async (params) => callUnity('/api/scene_hierarchy', {
      ...withScope(params),
      name_glob: params.name_glob,
      name_regex: params.name_regex,
      tag_glob: params.tag_glob,
      path: params.path,
      max_results: params.max_results,
      max_depth: params.max_depth,
      allow_large_response: params.allow_large_response,
      summary: params.summary,
      include_inactive: params.include_inactive
    }, { timeout: 20000 })
  },
  {
    name: 'scene_grep',
    description: 'Queries Unity objects with a DSL-based filter and explicit search scope.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        name_glob: { type: 'string', description: 'Glob filter for object names.' },
        name_regex: { type: 'string', description: 'Regex filter for object names.' },
        tag_glob: { type: 'string', description: 'Glob filter for tags.' },
        where: { type: 'string', description: 'DSL filter expression.' },
        select: { type: 'array', items: { type: 'string' }, description: 'Fields to select.' },
        max_results: { type: 'number', default: 100, description: 'Maximum number of rows.' },
        path: { type: 'string', description: 'Hierarchy path filter.' },
        max_depth: { type: 'number', default: -1, description: 'Maximum traversal depth.' },
        allow_large_response: { type: 'boolean', default: false, description: 'Allow larger payloads from Unity.' },
        include_inactive: { type: 'boolean', default: true, description: 'Include inactive objects.' }
      }
    },
    handler: async (params) => callUnity('/api/scene_grep', {
      ...withScope(params),
      name_glob: params.name_glob,
      name_regex: params.name_regex,
      tag_glob: params.tag_glob,
      where: params.where,
      select: params.select,
      max_results: params.max_results,
      path: params.path,
      max_depth: params.max_depth,
      allow_large_response: params.allow_large_response,
      include_inactive: params.include_inactive
    }, { timeout: 20000 })
  },
  {
    name: 'scene_radius',
    description: 'Finds objects within a radius inside the selected Unity search scope.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: SCENE_SCOPE_SCHEMA,
        center: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Center position.' },
        center_object: { type: 'string', description: 'Object name to use as the center.' },
        radius: { type: 'number', description: 'Search radius.' },
        max_results: { type: 'number', default: 100, description: 'Maximum number of rows.' },
        include_inactive: { type: 'boolean', default: false, description: 'Include inactive objects.' },
        name_glob: { type: 'string', description: 'Glob filter for object names.' },
        name_regex: { type: 'string', description: 'Regex filter for object names.' },
        tag_glob: { type: 'string', description: 'Glob filter for tags.' }
      },
      required: ['radius']
    },
    handler: async (params) => callUnity('/api/scene_radius', {
      ...withScope(params),
      center_position: params.center,
      center_object: params.center_object,
      radius: params.radius,
      max_results: params.max_results,
      include_inactive: params.include_inactive,
      name_glob: params.name_glob,
      name_regex: params.name_regex,
      tag_glob: params.tag_glob
    })
  },
  {
    name: 'execute',
    description: 'Compiles and optionally executes C# code inside the Unity Editor with explicit validation settings.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'C# method body to compile and run.' },
        safe_mode: { type: 'boolean', default: true, description: 'Reject unsafe APIs before compilation.' },
        validate_only: { type: 'boolean', default: false, description: 'Only compile and validate the snippet.' },
        allow_large_response: { type: 'boolean', default: false, description: 'Allow larger payloads from Unity.' }
      },
      required: ['code']
    },
    handler: async (params) => callUnity('/api/execute', {
      code: params.code,
      safe_mode: params.safe_mode !== false,
      validate_only: !!params.validate_only,
      allow_large_response: !!params.allow_large_response
    }, { timeout: 45000 })
  },
  {
    name: 'play_mode',
    description: 'Enters or exits Unity Play Mode.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'True to enter Play Mode, false to exit it.' }
      },
      required: ['enabled']
    },
    handler: async (params) => callUnity('/api/play_mode', { enabled: params.enabled }, { timeout: 10000 })
  }
];

export const unityModule = {
  namespace: 'unity',
  description: 'Unity Bridge tools for screenshots, scene inspection, object lookup, and code execution.',
  tools: unityTools
};