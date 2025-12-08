# Unity MCP Server

The `unity-mcp` server acts as a bridge between Modern Context Protocol (MCP) clients (like Cursor) and the Unity Editor. It manages external tools and communication with the Unity instance.

## Project Structure

```
unity-mcp/
├── index.js              # Server entry point
├── tools/                # Dynamic MCP modules
│   ├── unity.js          # Unity Bridge tools
│   └── terminal.js       # System tools
└── utils/                # Shared utilities
    ├── mcpServer.js      # Dynamic module loader
    └── logger.js         # Logging system
```

## Adding New Modules

1. Create a file `tools/my-module.js`.
2. Export the module using the standard format:

```javascript
export const myTools = [
  {
    name: "tool_name", // Will be available as my_tool_name
    description: "Tool description",
    handler: async (args) => {
      return `Result: ${args.param}`;
    }
  }
];

export const myModule = {
  namespace: "my",
  description: "Module description",
  tools: myTools
};
```

3. Restart the MCP server in Cursor.

## Available Modules

### Unity Bridge (`unity.js`)
Tools for interacting with the Unity Editor. All tool names are prefixed with `unity_`.

- **unity_screenshot**: Capture Game/Scene view screenshots.
- **unity_camera_screenshot**: Capture screenshot from a custom camera position.
- **unity_scene_hierarchy**: specific hierarchy analysis (supports glob/regex filtering).
- **unity_scene_grep**: Advanced scene querying with SQL-like DSL.
- **unity_execute**: Execute arbitrary C# code.
- **unity_play_mode**: Control Play Mode.
- **unity_scene_radius**: Find objects within a radius.

### Terminal Tools (`terminal.js`)
System utilities. All tool names are prefixed with `terminal_`.

- **terminal_system_info**: System diagnostics (ports, processes).
- **terminal_check_port**: Check if a port is in use.
- **terminal_find_process**: Find running processes by name.
- **terminal_safe_curl**: Execute safe HTTP requests.
- **terminal_wait_for_user**: Request user interaction.

## Tool Decorators

The server supports a decorator system for middleware-like functionality (logging, performance metrics, etc.) applied at the tool, module, or system level.

## Error Handling

Tools should throw standard JavaScript errors. The server automatically catches them and formats them into user-friendly error messages that do not crash the server.

```javascript
throw new Error("Operation failed");
```

## DSL Specification (scene_grep)

The `unity_scene_grep` tool uses a custom DSL for querying the scene.

- **WHERE Clause**: Logic expressions (`and`, `or`, `not`), comparisons (`==`, `!=`, `>`, etc.), and string functions (`contains`, `startswith`, `matches`).
- **SELECT Clause**: List of fields to retrieve (e.g., `["GameObject.name", "Transform.position"]`).
- **Path**: Hierarchy path filtering (supports Glob and Regex).