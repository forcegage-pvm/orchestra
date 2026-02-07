# Orchestra Extension Build Guide

This document describes the build process for the Orchestra VS Code extension, including native module compilation for both development and production environments.

## Architecture Overview

The extension uses two native/binary dependencies that require special handling:

1. **`better-sqlite3`** — a Node.js native addon requiring platform-specific compilation. Because VS Code runs on Electron (not Node.js), and the MCP server spawns as a separate Node.js process, we need **two different compilations**.
2. **`@vscode/ripgrep`** — ships a pre-built platform-specific ripgrep binary (not a Node.js addon). Used by the `grep_search` agent tool for fast workspace text search. No Electron rebuild needed — the binary runs as a standalone child process.

| Component | Runtime | Binary Target | Location |
|-----------|---------|---------------|----------|
| Extension | VS Code (Electron 39) | MODULE_VERSION 140 | `node_modules/better-sqlite3/` |
| MCP Server | Node.js (system) | MODULE_VERSION 136+ | `dist/mcp-server/node_modules/better-sqlite3/` |
| ripgrep | Standalone process | Platform binary | `node_modules/@vscode/ripgrep/bin/rg(.exe)` |

> **Note**: Because `@vscode/ripgrep` ships a platform-specific binary, the resulting VSIX is platform-specific. A VSIX built on Windows will only work on Windows, etc.

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

### ⚠️ CRITICAL: Electron Native Module Rebuild

**Before every VSIX build**, you MUST ensure `better-sqlite3` is compiled for VS Code's Electron version. Failure to do this causes `NODE_MODULE_VERSION` mismatch errors at runtime.

**Quick check for your VS Code version:**
```bash
code --version  # e.g., 1.108.0
```

Then find the Electron version at https://github.com/microsoft/vscode/blob/release/1.108/package.json (look for `devDependencies.electron`).

| VS Code Version | Electron Version | NODE_MODULE_VERSION |
|-----------------|------------------|---------------------|
| 1.108.x | 39.2.7 | 140 |
| 1.107.x | 39.2.3 | 140 |
| 1.95.x | 32.x | 128 |

### Full Build Process

```bash
# 1. Build root project
npm run build
npm run build:mcp-bundle

# 2. Build extension with Electron-compiled native module
cd extension
npm install

# CRITICAL: Download/rebuild better-sqlite3 for Electron
# Option A: Use prebuild-install (more reliable - downloads exact prebuilt binary)
cd node_modules/better-sqlite3
npx prebuild-install -r electron -t 39.2.7 --force
cd ../..

# Option B: Use @electron/rebuild (may use cached/wrong binary)
# npx @electron/rebuild -f -w better-sqlite3 -v 39.2.7

# Clear dist/node_modules to ensure fresh copy
Remove-Item -Recurse -Force dist/node_modules -ErrorAction SilentlyContinue  # PowerShell
# rm -rf dist/node_modules  # Unix

# Build (postbuild copies native modules to dist/)
npm run build

# 3. Package VSIX (outputs to artifacts/ folder)
npm run package
```

This produces `artifacts/orchestra-extension-X.Y.Z.vsix` containing:
- Extension code (`dist/extension.js`)
- MCP server bundle (`dist/mcp-server/index.js`)
- Electron-compiled native module (`node_modules/better-sqlite3/`)
- Node.js-compiled native module (`dist/mcp-server/node_modules/better-sqlite3/`)
- ripgrep binary (`node_modules/@vscode/ripgrep/bin/rg` or `rg.exe`)

### Verify Before Packaging

Always verify the native module version before packaging:
```powershell
# Check node_modules has Electron binary (source for extension)
Get-ChildItem node_modules\better-sqlite3\build\Release\*.node | Select Name, LastWriteTime, Length

# Check dist/node_modules has same binary (what gets packaged)
Get-ChildItem dist\node_modules\better-sqlite3\build\Release\*.node | Select Name, LastWriteTime, Length

# Both should have same timestamp and size!
```

### What Gets Packaged

The `bundledDependencies` array in `package.json` controls which `node_modules` are included in the VSIX:

```json
"bundledDependencies": [
  "@vscode/ripgrep",
  "better-sqlite3",
  "bindings",
  "file-uri-to-path"
]
```

These modules are kept external in the esbuild config (`esbuild.config.js`) so they resolve from `node_modules` at runtime rather than being inlined:

```js
external: ["vscode", "better-sqlite3", "drizzle-orm", "@vscode/ripgrep"]
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

### ripgrep Binary Not Found

```
Failed to start ripgrep: spawn .../bin/rg ENOENT
```

**Cause**: The `@vscode/ripgrep` postinstall script failed to download the binary, or `node_modules` was cleaned without reinstalling.

**Fix**:
```bash
cd extension
npm install @vscode/ripgrep
# Verify:
ls node_modules/@vscode/ripgrep/bin/
```

### MODULE_VERSION Mismatch Error

```
Error: The module was compiled against a different Node.js version
NODE_MODULE_VERSION 137. This version of Node.js requires NODE_MODULE_VERSION 140.
```

**Cause**: The native module in the VSIX was compiled for the wrong runtime. This happens when:
1. `better-sqlite3` was installed with `npm install` (compiles for Node.js, not Electron)
2. The `dist/node_modules` wasn't cleared before rebuild
3. `@electron/rebuild` used a cached wrong binary

**Fix - Complete rebuild sequence:**
```powershell
cd extension

# 1. Clear everything
Remove-Item -Recurse -Force node_modules/better-sqlite3 -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force dist/node_modules -ErrorAction SilentlyContinue

# 2. Fresh install
npm install better-sqlite3

# 3. Download Electron prebuilt (most reliable method)
cd node_modules/better-sqlite3
npx prebuild-install -r electron -t 39.2.7 --force --verbose
cd ../..

# 4. Verify the binary
Get-ChildItem node_modules\better-sqlite3\build\Release\*.node | Select Name, LastWriteTime

# 5. Rebuild extension (copies to dist/)
npm run build

# 6. Verify dist has same binary
Get-ChildItem dist\node_modules\better-sqlite3\build\Release\*.node | Select Name, LastWriteTime

# 7. Repackage
npx @vscode/vsce package --no-yarn
```

### @electron/rebuild Uses Cached Prebuilt (Not Actually Compiling)

If `@electron/rebuild` completes instantly but the `.node` file timestamp doesn't change, it's using a cached prebuilt binary instead of compiling from source.

**Symptoms**:
- `npx @electron/rebuild` says "Rebuild Complete" but the error persists
- The `.node` file has an old timestamp after rebuild
- MODULE_VERSION still mismatches

**Better alternative - use prebuild-install directly:**
```bash
cd extension/node_modules/better-sqlite3
npx prebuild-install -r electron -t 39.2.7 --force --verbose
```

This downloads the exact prebuilt binary for the specified Electron version.

**If prebuilt not available - compile from source (requires Python + C++ build tools):**
```bash
cd extension/node_modules/better-sqlite3
npm run build-release -- --target=39.2.7 --arch=x64 --dist-url=https://electronjs.org/headers
```

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

### Upgrading @vscode/ripgrep

`@vscode/ripgrep` is straightforward — no Electron rebuild required:

```bash
cd extension
npm install @vscode/ripgrep@latest
# The postinstall script downloads the correct platform binary automatically
```

Verify the binary was downloaded:
```powershell
Get-ChildItem node_modules\@vscode\ripgrep\bin\
```

### Upgrading better-sqlite3

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
