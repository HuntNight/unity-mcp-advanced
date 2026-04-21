# Unity MCP Advanced

`unity-mcp-advanced` is a Unity Editor bridge for MCP clients such as Cursor. It exposes scene inspection, screenshots, Play Mode control, and controlled C# execution through a small Node MCP server plus a Unity Editor HTTP bridge.

## What changed in this refactor

- One MCP entrypoint at `unity-mcp/index.js`.
- One transport path from MCP to Unity.
- Unified response contract: `success`, `messages`, `data`, `logs`, `meta`.
- Explicit scene scopes for queries: `active_scene`, `all_loaded_scenes`, `dont_destroy_on_load`, `all_loaded_objects`.
- New smoke and inspection tools: `unity_health`, `unity_list_scenes`, `unity_find_objects`, `unity_inspect_object`.
- Direct edit tools for runtime workflows: `unity_set_transform`, `unity_set_light`, `unity_set_camera`, `unity_set_active`.
- `unity_camera_screenshot` can now render from an existing preview camera.
- `unity_execute` now respects `safe_mode`, reports structured error codes, and resolves more runtime assemblies before execution.

## Layout

```text
unity-mcp-advanced/
├── unity-mcp/
│   ├── docs/
│   ├── index.js
│   ├── tools/
│   │   ├── unity.js
│   │   └── terminal.js
│   ├── utils/
│   └── tools/unity-bridge/unity-extension/Editor/
└── README.md
```

## Setup

1. Install Node.js 18+.
2. Run `npm install` in `unity-mcp/`.
3. Open the Unity project and install the Unity package from `unity-mcp/tools/unity-bridge/unity-extension/package.json`.
4. Open `Window -> Unity Bridge` in Unity and start the server.
5. Point Cursor MCP config to `unity-mcp/index.js`.

Example MCP config:

```json
{
  "mcpServers": {
    "unity-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/unity-mcp/index.js"
      ]
    }
  }
}
```

## Main tools

- `unity_health`: connectivity and bridge diagnostics.
- `unity_list_scenes`: loaded scenes plus `DontDestroyOnLoad`.
- `unity_find_objects`: lookup by name, path, component, tag, instance id.
- `unity_inspect_object`: details for one object, with optional curated component values.
- `unity_set_transform`, `unity_set_light`, `unity_set_camera`, `unity_set_active`: direct scene edits without snippets.
- `unity_scene_hierarchy`: scoped hierarchy traversal.
- `unity_scene_grep`: DSL query over the same scoped source.
- `unity_scene_radius`: spatial query within the selected scope.
- `unity_execute`: compile or execute a C# snippet inside the editor.
- `unity_screenshot` and `unity_camera_screenshot`: visual verification, including existing camera capture.

## Notes

- Scene tools no longer silently search only the active scene unless `scope` is explicitly set that way.
- `DontDestroyOnLoad` objects are discoverable without using `unity_execute`.
- Errors now come back as regular diagnostic responses with structured `errorCode` values.
