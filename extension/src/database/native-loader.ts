/**
 * Native Module Loader
 *
 * Loads native modules from the correct location within the extension bundle.
 * This is necessary because native modules (like better-sqlite3) cannot be bundled
 * by esbuild and must be loaded at runtime from dist/node_modules.
 */

import * as path from "path";

// Get the directory where the extension is running from (__dirname is dist/)
const extensionDir = __dirname;

// Path to node_modules inside dist/
const distNodeModules = path.join(extensionDir, "node_modules");

/**
 * Load better-sqlite3 from the extension's bundled node_modules
 */
export function loadBetterSqlite3(): typeof import("better-sqlite3") {
  const modulePath = path.join(distNodeModules, "better-sqlite3");
  try {
    // Use direct path require
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(modulePath);
  } catch (error) {
    // Fallback: try standard require (for development)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("better-sqlite3");
    } catch {
      throw new Error(
        `Failed to load better-sqlite3. ` +
          `Looked in: ${modulePath}. ` +
          `Original error: ${
            error instanceof Error ? error.message : String(error)
          }`
      );
    }
  }
}

/**
 * Load drizzle-orm from the extension's bundled node_modules
 */
export function loadDrizzleOrm(): typeof import("drizzle-orm/better-sqlite3") {
  const modulePath = path.join(
    distNodeModules,
    "drizzle-orm",
    "better-sqlite3"
  );
  try {
    // Use direct path require
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(modulePath);
  } catch (error) {
    // Fallback: try standard require (for development)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("drizzle-orm/better-sqlite3");
    } catch {
      throw new Error(
        `Failed to load drizzle-orm. ` +
          `Looked in: ${modulePath}. ` +
          `Original error: ${
            error instanceof Error ? error.message : String(error)
          }`
      );
    }
  }
}
