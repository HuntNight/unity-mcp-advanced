# Unity MCP Integration

**Integration of AI assistants with Unity3D via Model Context Protocol (MCP).**

[![Unity](https://img.shields.io/badge/Unity-2022.3+-black.svg?logo=unity)](https://unity.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg?logo=node.js)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-2.0-blue.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Allows AI assistants (like Claude, Cursor AI) to directly interact with the Unity Editor: execute code, analyze the scene, and manage the project.

## Key Features

### Unity Integration
- **Code Execution**: Run C# code in the Editor context (`unity_execute`).
- **Scene Analysis**: Inspect object hierarchy and components (`unity_scene_hierarchy`).
- **Visual Feedback**: Capture screenshots of Game and Scene views (`unity_screenshot`).
- **Scene Querying**: Advanced object search using SQL-like DSL (`unity_scene_grep`).

### System Tools
- **Diagnostics**: Monitor ports and system processes (`terminal_system_info`).
- **Process Management**: Search for running processes (`terminal_find_process`).
- **Network**: Check port availability (`terminal_check_port`).

## Installation

### Prerequisites
- **Unity 2022.3+**
- **Node.js 18+**
- **macOS** (primary support) or **Windows** (experimental)

### 1. Setup MCP Server

1. Clone the repository:
   ```bash
   git clone git@github.com:HuntNight/unity-mcp-advanced.git
   cd unity-mcp
   ```

2. Install dependencies:
   ```bash
   cd unity-mcp
   npm install
   ```

### 2. Configure Cursor

Create or update `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "unity-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/your/project/unity-mcp/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```
**Note:** Replace `/absolute/path/to/your/project/` with the actual path.

### 3. Install Unity Extension

1. Open your Unity project.
2. Go to **Window** → **Package Manager**.
3. Click **+** → **Install package from disk...**.
4. Select `package.json` in `unity-mcp/tools/unity-bridge/unity-extension`.

### 4. Start Unity Bridge

1. In Unity Editor, open **Window** → **Unity Bridge**.
2. Click **Start Server**.
3. Ensure the server is running on port **7777**.

## Usage Examples

### Executing C# Code
```javascript
// Create a cube
unity_execute({
  code: `
    var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
    cube.name = "AI_Generated_Cube";
    cube.transform.position = new Vector3(0, 1, 0);
    return "Cube created successfully";
  `
})
```

### Analyzing the Scene
```javascript
// Find all objects with name starting with "Player"
unity_scene_hierarchy({
  name_glob: "Player*"
})
```

### System Diagnostics
```javascript
// Check system status
terminal_system_info()
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Unity Bridge not responding | Restart Unity Bridge Window (Stop/Start) |
| MCP Server not loading | Check path in `.cursor/mcp.json` |
| Compilation Errors | Use full namespaces (e.g., `UnityEngine.Object`) |
| Port 7777 busy | Check running processes using `terminal_check_port(7777)` |

## Architecture

- **MCP Server (Node.js)**: Handles requests from the AI assistant.
- **Unity Extension (C#)**: Runs inside Unity, executes commands, and returns results via HTTP (port 7777).

## License

MIT License. See [LICENSE](LICENSE) for details.
