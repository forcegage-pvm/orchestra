# Orchestra VS Code Extension

> **Status**: Phase 1 - Foundation Scaffold

Visual task orchestration extension for Orchestra AI agent workflows.

## Features (Phase 1)

- **Sprint Explorer**: TreeView navigation of sprint → phase → task hierarchy
- **Dashboard**: Real-time sprint overview with task status and timeline
- **Database Reactivity**: UI updates within 500ms of database changes
- **MCP Integration**: Auto-starts orchestrator and implementor MCP servers
- **Status Bar**: Current task indicator with quick dashboard access

## Requirements

- VS Code 1.95.0 or higher
- Node.js 20.x or higher
- Orchestra workspace (`.orchestra/` folder with `orchestra.db`)

## Installation

### From Source

```bash
cd extension
npm install
npm run build
```

If you are packaging/deploying the extension (VSIX) or troubleshooting native module issues, follow the authoritative guide: [build.md](build.md).

### Development

```bash
npm run watch  # Watch mode for development
```

Press F5 in VS Code to launch Extension Development Host.

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `orchestra.autoStartMCP` | boolean | `true` | Auto-start MCP servers on activation |
| `orchestra.updateInterval` | number | `500` | Database update debounce (ms) |
| `orchestra.logLevel` | string | `"info"` | Log level (debug/info/warn/error) |

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `Orchestra: Open Dashboard` | - | Open main dashboard panel |
| `Orchestra: Refresh Status` | - | Manually refresh all views |
| `Orchestra: Open Task Detail` | - | Open detailed task view |

## Project Structure

```
extension/
├── src/
│   ├── extension.ts              # Entry point
│   ├── workspace/
│   │   └── detector.ts           # .orchestra/ detection
│   ├── database/
│   │   ├── client.ts             # SQLite client (singleton)
│   │   └── watcher.ts            # DB file watcher
│   ├── views/
│   │   ├── treeview/             # Sprint Explorer
│   │   ├── dashboard/            # Dashboard webview
│   │   └── statusbar/            # Status bar item
│   ├── mcp/
│   │   └── ServerManager.ts      # MCP server lifecycle
│   └── utils/
│       ├── logger.ts             # Structured logging
│       └── errors.ts             # Error classes
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript config
└── esbuild.config.js             # Build configuration
```

## Development

### Building

```bash
npm run build       # Production build
npm run watch       # Development watch mode
npm run typecheck   # Type checking only
```

### Testing

```bash
npm test            # Run tests
npm run test:watch  # Watch mode
```

### Debugging

1. Open extension folder in VS Code
2. Press F5 to launch Extension Development Host
3. View logs in Output → Orchestra

## Architecture

### Database Reactivity

```
orchestra.db changes → FileSystemWatcher → DatabaseWatcher
                                          ↓ (debounced 500ms)
                                    onDidChange event
                                          ↓
                          ┌───────────────┼───────────────┐
                          ↓               ↓               ↓
                    TreeProvider    DashboardPanel   StatusBar
                          ↓               ↓               ↓
                    UI updates      Webview update   Status update
```

### MCP Server Lifecycle

```
Extension activates → MCPServerManager.startServer('orchestrator')
                   → MCPServerManager.startServer('implementor')
                        ↓
                   Spawn node process with --role flag
                        ↓
                   Monitor stdout/stderr → Logger
                        ↓
                   Handle crashes → Auto-restart (max 3)
                        ↓
Extension deactivates → Stop all servers
```

## License

MIT

## Author

forcegage
