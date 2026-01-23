/**
 * Database connection management
 *
 * Provides singleton database connection using Drizzle ORM + better-sqlite3.
 *
 * CRITICAL: Database path is resolved in this order:
 * 1. Explicit dbPath parameter
 * 2. ORCHESTRA_WORKSPACE environment variable
 * 3. --workspace CLI argument
 * 4. Current working directory (fallback)
 *
 * This ensures each workspace has isolated data.
 */

import Database from "better-sqlite3";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema.js";

/**
 * Database connection singleton
 */
let dbInstance: BetterSQLite3Database<typeof schema> | null = null;
let sqliteInstance: Database.Database | null = null;
let resolvedDbPath: string | null = null;

/**
 * Resolve the workspace root directory
 *
 * Priority:
 * 1. ORCHESTRA_WORKSPACE environment variable
 * 2. --workspace CLI argument
 * 3. Current working directory
 */
export function resolveWorkspacePath(): string {
  // Check environment variable first (most reliable for MCP)
  if (process.env.ORCHESTRA_WORKSPACE) {
    return process.env.ORCHESTRA_WORKSPACE;
  }

  // Check CLI arguments for --workspace
  const args = process.argv;
  const workspaceArgIndex = args.findIndex(
    (arg) => arg === "--workspace" || arg === "-w"
  );
  if (workspaceArgIndex !== -1) {
    const workspaceArg = args[workspaceArgIndex + 1];
    if (workspaceArg) {
      return workspaceArg;
    }
  }

  // Fallback to current working directory
  return process.cwd();
}

/**
 * Get the resolved database path
 */
export function getDbPath(): string | null {
  return resolvedDbPath;
}

/**
 * Get raw SQLite instance (for advanced operations like pragma)
 *
 * @returns Raw better-sqlite3 Database instance or null if not initialized
 */
export function getRawDb(): Database.Database | null {
  return sqliteInstance;
}

/**
 * Get or create database connection
 *
 * @param dbPath - Path to SQLite database file (default: .orchestra/orchestra.db in workspace)
 * @returns Drizzle database instance
 */
export function getDb(dbPath?: string): BetterSQLite3Database<typeof schema> {
  if (dbInstance) {
    return dbInstance;
  }

  // Resolve workspace and database path
  const workspacePath = resolveWorkspacePath();
  const finalPath =
    dbPath || path.join(workspacePath, ".orchestra", "orchestra.db");

  // Store resolved path for debugging
  resolvedDbPath = finalPath;

  // Ensure directory exists
  const dbDir = path.dirname(finalPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create SQLite connection
  sqliteInstance = new Database(finalPath);

  // Enable foreign keys (critical for referential integrity)
  sqliteInstance.pragma("foreign_keys = ON");

  // Create Drizzle instance
  dbInstance = drizzle(sqliteInstance, { schema });

  return dbInstance;
}

/**
 * Close database connection
 *
 * Should be called on process exit for clean shutdown.
 */
export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

/**
 * Reset database connection (for testing)
 *
 * Forces new connection on next getDb() call.
 */
export function resetDb(): void {
  closeDb();
}
