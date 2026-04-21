# Unity MCP Overview

`unity-mcp` is a small MCP server that talks to a Unity Editor HTTP bridge.

## Active layout

```text
unity-mcp/
├── docs/
├── index.js
├── package.json
├── tools/
│   ├── terminal.js
│   ├── unity.js
│   └── unity-bridge/
│       └── unity-extension/
└── utils/
    ├── logger.js
    ├── mcpServer.js
    ├── processHelpers.js
    └── workspaceUtils.js
```

## Main tools

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
- `unity_screenshot`
- `unity_camera_screenshot`
- `unity_play_mode`

## Scene scopes

Scene tools support:

- `active_scene`
- `all_loaded_scenes`
- `dont_destroy_on_load`
- `all_loaded_objects`

## Response model

Unity bridge responses are normalized to:

- `success`
- `error`
- `errorCode`
- `data`
- `logs`
- `meta`
- `messages`
