/**
 * Database connection management
 *
 * Provides singleton database connection using Drizzle ORM + better-sqlite3.
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

/**
 * Get or create database connection
 *
 * @param dbPath - Path to SQLite database file (default: .orchestra/db/orchestra.db)
 * @returns Drizzle database instance
 */
export function getDb(dbPath?: string): BetterSQLite3Database<typeof schema> {
  if (dbInstance) {
    return dbInstance;
  }

  // Default database path: .orchestra/db/orchestra.db
  const finalPath =
    dbPath || path.join(process.cwd(), ".orchestra", "db", "orchestra.db");

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
