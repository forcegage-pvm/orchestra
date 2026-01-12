/**
 * Copy Native Modules for Extension Runtime
 *
 * This script copies better-sqlite3 and its dependencies from extension's
 * node_modules to dist/node_modules so they're included in the .vsix package
 * and available at runtime when the extension runs in VS Code.
 *
 * This is separate from the MCP server's native modules (handled by copy-mcp-server.js).
 */

const fs = require("fs");
const path = require("path");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const SOURCE_NODE_MODULES = path.join(EXTENSION_ROOT, "node_modules");
const TARGET_NODE_MODULES = path.join(EXTENSION_ROOT, "dist", "node_modules");

// Native modules and dependencies needed by the extension itself (Electron runtime)
const NATIVE_MODULES = [
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  "drizzle-orm",
];

/**
 * Remove directory with retry logic for handling file locks (Dropbox, antivirus, etc.)
 */
function removeWithRetry(targetPath, maxRetries = 5, delayMs = 500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      fs.rmSync(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      return true;
    } catch (err) {
      if (
        err.code === "EPERM" ||
        err.code === "EBUSY" ||
        err.code === "ENOTEMPTY"
      ) {
        if (attempt < maxRetries) {
          // Wait before retry
          const waitMs = delayMs * attempt;
          console.log(
            `   ⏳ File locked, retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`
          );
          const start = Date.now();
          while (Date.now() - start < waitMs) {
            // Busy wait (sync delay)
          }
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }
  return false;
}

function copyNativeModules() {
  console.log("📦 Copying native modules for extension runtime...");
  console.log(`   Source: ${SOURCE_NODE_MODULES}`);
  console.log(`   Target: ${TARGET_NODE_MODULES}`);

  // Ensure target directory exists
  fs.mkdirSync(TARGET_NODE_MODULES, { recursive: true });

  for (const moduleName of NATIVE_MODULES) {
    const sourceModule = path.join(SOURCE_NODE_MODULES, moduleName);
    const targetModule = path.join(TARGET_NODE_MODULES, moduleName);

    if (fs.existsSync(sourceModule)) {
      // Remove existing target if it exists
      if (fs.existsSync(targetModule)) {
        removeWithRetry(targetModule);
      }

      // Copy the module
      fs.cpSync(sourceModule, targetModule, { recursive: true });
      console.log(`   ✓ ${moduleName}`);
    } else {
      console.error(`   ✗ ${moduleName} not found at ${sourceModule}`);
      process.exit(1);
    }
  }

  // Verify better-sqlite3 native module exists
  const nativeModulePath = path.join(
    TARGET_NODE_MODULES,
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  );

  if (fs.existsSync(nativeModulePath)) {
    console.log("✅ Native modules copied successfully!");
    console.log(`   Native binary: ${nativeModulePath}`);
  } else {
    console.error("❌ Error: better-sqlite3 native module not found!");
    console.error("   Expected at:", nativeModulePath);
    console.error(
      "   Run 'npm install' or 'npm run rebuild' to compile native modules"
    );
    process.exit(1);
  }
}

copyNativeModules();
