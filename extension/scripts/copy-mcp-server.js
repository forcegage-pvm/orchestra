/**
 * Copy MCP Server to Extension Bundle
 *
 * This script copies the bundled MCP server from the root project's
 * dist/mcp-server-bundle/ directory into the extension's dist/mcp-server/
 * directory, enabling the extension to bundle and spawn the MCP server
 * without requiring separate installation.
 *
 * It also copies the Node.js-compiled better-sqlite3 from root node_modules
 * (NOT the extension's Electron-compiled version).
 */

const fs = require("fs");
const path = require("path");

// Paths relative to extension directory
const SOURCE_DIR = path.resolve(__dirname, "../../dist/mcp-server-bundle");
const TARGET_DIR = path.resolve(__dirname, "../dist/mcp-server");
const ROOT_NODE_MODULES = path.resolve(__dirname, "../../node_modules");

// Native modules that need to be copied for MCP server (Node.js runtime)
const NATIVE_MODULES = [
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  "node-addon-api",
];

function copyMcpServer() {
  console.log("📦 Copying MCP server to extension bundle...");
  console.log(`   Source: ${SOURCE_DIR}`);
  console.log(`   Target: ${TARGET_DIR}`);

  // Check if source directory exists
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error("❌ Error: MCP server not found at", SOURCE_DIR);
    console.error("   Run 'npm run build' in the root project first.");
    process.exit(1);
  }

  // Ensure target directory exists (create parent if needed)
  const targetParent = path.dirname(TARGET_DIR);
  if (!fs.existsSync(targetParent)) {
    fs.mkdirSync(targetParent, { recursive: true });
  }

  // Remove existing target directory if it exists
  if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  }

  // Copy the entire directory recursively
  fs.cpSync(SOURCE_DIR, TARGET_DIR, { recursive: true });

  // Verify the copy succeeded
  const indexPath = path.join(TARGET_DIR, "index.js");
  if (!fs.existsSync(indexPath)) {
    console.error("❌ Error: Copy failed - index.js not found at", indexPath);
    process.exit(1);
  }

  console.log("✅ MCP server copied successfully!");

  // Copy native modules for MCP server (Node.js runtime, not Electron)
  console.log("📦 Copying native modules for MCP server...");
  const targetNodeModules = path.join(TARGET_DIR, "node_modules");
  fs.mkdirSync(targetNodeModules, { recursive: true });

  for (const moduleName of NATIVE_MODULES) {
    const sourceModule = path.join(ROOT_NODE_MODULES, moduleName);
    const targetModule = path.join(targetNodeModules, moduleName);

    if (fs.existsSync(sourceModule)) {
      fs.cpSync(sourceModule, targetModule, { recursive: true });
      console.log(`   ✓ ${moduleName}`);
    } else {
      console.log(`   ⚠ ${moduleName} not found (may be optional)`);
    }
  }

  // Verify better-sqlite3 native module exists
  const nativeModulePath = path.join(
    targetNodeModules,
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  );
  if (fs.existsSync(nativeModulePath)) {
    console.log("✅ Native modules copied successfully!");
  } else {
    console.error("❌ Error: better-sqlite3 native module not found!");
    console.error("   Expected at:", nativeModulePath);
    process.exit(1);
  }
}

copyMcpServer();
