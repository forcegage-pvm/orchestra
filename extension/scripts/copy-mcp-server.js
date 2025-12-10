/**
 * Copy MCP Server to Extension Bundle
 *
 * This script copies the built MCP server from the root project's dist/mcp-server/
 * directory into the extension's dist/mcp-server/ directory, enabling the extension
 * to bundle and spawn the MCP server without requiring separate installation.
 */

const fs = require("fs");
const path = require("path");

// Paths relative to extension directory
const SOURCE_DIR = path.resolve(__dirname, "../../dist/mcp-server");
const TARGET_DIR = path.resolve(__dirname, "../dist/mcp-server");

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
}

copyMcpServer();
