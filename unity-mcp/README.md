# Unity MCP Server

`unity-mcp` is the Node-side MCP server for the Unity bridge. It loads tool modules from `tools/`, exposes them through stdio, and forwards Unity requests to the Editor bridge.

## Files

```text
unity-mcp/
├── docs/
├── index.js
├── package.json
├── tools/
│   ├── unity.js
│   └── terminal.js
└── utils/
    ├── logger.js
    └── mcpServer.js
```

## Run

```bash
npm install
npm run build
npm start
```

## Tool module format

```javascript
export const myModule = {
  namespace: 'my',
  description: 'Module description',
  tools: [
    {
      name: 'tool_name',
      description: 'Tool description',
      inputSchema: { type: 'object', properties: {} },
      handler: async (args) => ({ content: [{ type: 'text', text: 'ok' }] })
    }
  ]
};
```

The runtime prefixes each tool with `<namespace>_`, so `tool_name` becomes `my_tool_name`.

## Unity tools

- `unity_health`
- `unity_list_scenes`
- `unity_find_objects`
- `unity_inspect_object`
- `unity_set_transform`
- `unity_set_light`
- `unity_set_camera`
- `unity_set_active`
- `unity_scene_hierarchy`
- `unity_scene_grep`
- `unity_scene_radius`
- `unity_execute`
- `unity_play_mode`
- `unity_screenshot`
- `unity_camera_screenshot`

## Response model

Unity responses are normalized to MCP content and may include:

- `messages`: text or image payloads.
- `data`: structured payload when Unity returns one.
- `errorCode`: structured failure category for bridge and execution errors.
- `logs`: recent Unity logs captured during the request.
- `meta`: request id, endpoint, and duration.

## Query scopes

Scene-aware tools accept `scope`:

- `active_scene`
- `all_loaded_scenes`
- `dont_destroy_on_load`
- `all_loaded_objects`

`unity_find_objects`, `unity_inspect_object`, `unity_camera_screenshot`, and the direct edit tools default to `all_loaded_objects` so runtime-only preview objects are easier to reach.

## Documentation

- `docs/overview.md`
- `docs/api.md`