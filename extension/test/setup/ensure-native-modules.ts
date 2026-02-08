/**
 * Vitest Global Setup: Ensure Native Modules
 *
 * Runs ONCE before any test file. Checks if `better-sqlite3` native module
 * is compiled for the current Node.js version. If not (e.g., after an
 * Electron rebuild for VSIX packaging), automatically runs `npm rebuild`
 * to restore compatibility.
 *
 * This eliminates the recurring NODE_MODULE_VERSION mismatch issue where
 * tests skip/fail because better-sqlite3 was compiled for Electron's
 * Node version (via @electron/rebuild) rather than the system Node.js.
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(__dirname, "../..");

function isBetterSqlite3Compatible(): boolean {
  try {
    // Clear any cached version of the module
    const modulePath = require.resolve("better-sqlite3", {
      paths: [extensionDir],
    });

    // Delete from require cache to force fresh load
    delete require.cache[modulePath];

    // Try loading and using the module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require(modulePath);
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function setup(): Promise<void> {
  if (isBetterSqlite3Compatible()) {
    return;
  }

  console.log(
    "\n⚡ better-sqlite3 native module incompatible with current Node.js — rebuilding...\n",
  );

  try {
    execSync("npm rebuild better-sqlite3", {
      cwd: extensionDir,
      stdio: "pipe",
      timeout: 30_000,
    });

    // Verify the rebuild worked
    if (!isBetterSqlite3Compatible()) {
      throw new Error(
        "better-sqlite3 still incompatible after rebuild. " +
          "Try: cd extension && npm rebuild better-sqlite3",
      );
    }

    console.log("✅ better-sqlite3 rebuilt successfully for Node.js\n");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Failed to rebuild better-sqlite3: ${msg}\n`);
    console.error(
      "   Manual fix: cd extension && npm rebuild better-sqlite3\n",
    );
    // Don't throw — let the per-file probe checks handle graceful skipping
  }
}
