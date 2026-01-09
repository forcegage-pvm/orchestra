# Orchestra Extension Build Guide

This document describes the build process for the Orchestra VS Code extension, including native module compilation for both development and production environments.

## Architecture Overview

The extension uses `better-sqlite3`, a native Node.js module that requires platform-specific compilation. Because VS Code runs on Electron (not Node.js), and the MCP server spawns as a separate Node.js process, we need **two different compilations** of the native module:

| Component | Runtime | Binary Target | Location |
|-----------|---------|---------------|----------|
| Extension | VS Code (Electron 39) | MODULE_VERSION 140 | `node_modules/better-sqlite3/` |
| MCP Server | Node.js (system) | MODULE_VERSION 136+ | `dist/mcp-server/node_modules/better-sqlite3/` |

## Prerequisites

- **Node.js**: v20+ (v22 recommended)
- **npm**: v10+
- **Python**: 3.x (for node-gyp)
- **C++ Build Tools**: Visual Studio Build Tools on Windows, Xcode on macOS
- **VS Code**: 1.107+ (uses Electron 39.2.3)

## Development Setup

### 1. Install Dependencies

```bash
# Root project (MCP server, CLI, core)
npm install

# Extension
cd extension
npm install
```

### 2. Rebuild Native Module for Electron

The extension's `better-sqlite3` must be compiled for VS Code's Electron version:

```bash
cd extension
npx @electron/rebuild -f -w better-sqlite3 -v 39.2.3
```

> **Finding VS Code's Electron version**: Check the `devDependencies.electron` field in
> [VS Code's package.json](https://github.com/microsoft/vscode/blob/main/package.json)

### 3. Build Everything

```bash
# From root directory
npm run build              # Builds CLI and MCP server
npm run build:mcp-bundle   # Creates bundled MCP server for extension

# From extension directory
cd extension
npm run build              # Builds extension + copies MCP server with native modules
```

## Production Build (VSIX)

### Full Build Process

```bash
# 1. Build root project
npm run build
npm run build:mcp-bundle

# 2. Build extension with Electron-compiled native module
cd extension
npm install
npx @electron/rebuild -f -w better-sqlite3 -v 39.2.3
npm run build

# 3. Package VSIX
npx vsce package --no-yarn
```

This produces `orchestra-extension-X.Y.Z.vsix` containing:
- Extension code (`dist/extension.js`)
- MCP server bundle (`dist/mcp-server/index.js`)
- Electron-compiled native module (`node_modules/better-sqlite3/`)
- Node.js-compiled native module (`dist/mcp-server/node_modules/better-sqlite3/`)

### What Gets Packaged

The `.vscodeignore` controls what's included in the VSIX:

```ignore
# Excluded
node_modules/*

# Included (native modules needed at runtime)
!node_modules/better-sqlite3/**
!node_modules/bindings/**
!node_modules/file-uri-to-path/**
```

## How It Works

### Build Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ Root Project                                                     │
│                                                                  │
│  npm run build:mcp-bundle                                        │
│      ↓                                                           │
│  dist/mcp-server-bundle/index.js  (bundled, better-sqlite3 external)
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Extension                                                        │
│                                                                  │
│  npm run build (esbuild)                                         │
│      ↓                                                           │
│  dist/extension.js  (bundled, better-sqlite3 external)           │
│                                                                  │
│  postbuild: copy-mcp-server.js                                   │
│      ↓                                                           │
│  dist/mcp-server/index.js           (from root bundle)           │
│  dist/mcp-server/node_modules/      (Node.js native modules)     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Runtime Resolution

1. **Extension code** (`dist/extension.js`):
   - Runs inside VS Code's Electron process
   - `require('better-sqlite3')` → resolves to `node_modules/better-sqlite3/`
   - Uses Electron-compiled binary

2. **MCP Server** (`dist/mcp-server/index.js`):
   - Spawned as separate Node.js process via `child_process.spawn('node', [...])`
   - `require('better-sqlite3')` → resolves to `dist/mcp-server/node_modules/better-sqlite3/`
   - Uses Node.js-compiled binary

## Troubleshooting

### MODULE_VERSION Mismatch Error

```
Error: The module was compiled against a different Node.js version
Expected: 140, got: 127
```

**Cause**: Native module compiled for wrong runtime.

**Fix**: Rebuild for the correct Electron version:
```bash
cd extension
npx @electron/rebuild -f -w better-sqlite3 -v 39.2.3
```

### @electron/rebuild Uses Cached Prebuilt (Not Actually Compiling)

If `@electron/rebuild` completes instantly but the `.node` file timestamp doesn't change, it's using a cached prebuilt binary instead of compiling from source.

**Symptoms**:
- `npx @electron/rebuild` says "Rebuild Complete" but the error persists
- The `.node` file has an old timestamp after rebuild
- MODULE_VERSION still mismatches

**Fix**: Manually invoke node-gyp with Electron headers:
```bash
cd extension/node_modules/better-sqlite3
npm run build-release -- --target=39.2.3 --arch=x64 --dist-url=https://electronjs.org/headers
```

This forces a from-source compilation using the correct Electron version's Node headers.

**Verify the fix**:
```powershell
# Check the timestamp is fresh (should be today)
Get-ChildItem "node_modules\better-sqlite3\build\Release\*.node" | Select-Object Name, LastWriteTime
```

### Finding the Correct Electron Version

1. Check your VS Code version: `code --version`
2. Find the corresponding Electron version in [VS Code's package.json](https://github.com/microsoft/vscode/blob/main/package.json)
3. Look for `devDependencies.electron`

| VS Code Version | Electron Version | MODULE_VERSION |
|-----------------|------------------|----------------|
| 1.107.x | 39.2.3 | 140 |
| 1.95.x | 32.x | 128 |

### File Lock Errors (Windows)

```
Error: EPERM: operation not permitted, unlink '...\better_sqlite3.node'
```

**Cause**: File locked by VS Code, Dropbox, or antivirus.

**Fix**:
1. Close VS Code completely
2. Pause Dropbox sync on the repository folder
3. Retry the rebuild

### MCP Server Can't Find better-sqlite3

**Cause**: Node.js native module not copied to `dist/mcp-server/node_modules/`.

**Fix**: Run the postbuild script:
```bash
cd extension
node scripts/copy-mcp-server.js
```

## Version Compatibility Matrix

| better-sqlite3 | Electron Support | Notes |
|----------------|------------------|-------|
| 12.5.0+ | 39+ | Required for Electron 39's V8 API |
| 11.x | Up to 35 | `GetIsolate` API removed in newer V8 |

## Updating Dependencies

When upgrading `better-sqlite3`:

1. Update in **both** `package.json` files:
   ```bash
   # Root
   npm install better-sqlite3@latest
   
   # Extension  
   cd extension
   npm install better-sqlite3@latest
   ```

2. Rebuild both native modules:
   ```bash
   # Root (for Node.js)
   npm rebuild better-sqlite3
   
   # Extension (for Electron)
   cd extension
   npx @electron/rebuild -f -w better-sqlite3 -v 39.2.3
   ```

3. Rebuild the extension:
   ```bash
   npm run build:mcp-bundle  # from root
   cd extension && npm run build
   ```
