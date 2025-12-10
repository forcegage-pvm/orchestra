/**
 * Database Client (Singleton)
 *
 * Read-only SQLite database client using better-sqlite3.
 * Provides singleton access to Orchestra database.
 */

import Database from "better-sqlite3";
import { DatabaseError } from "../utils/errors.js";
import { getOrchestraDBPath } from "../workspace/detector.js";

/**
 * Singleton database client
 * Phase 1: Read-only mode
 */
export class OrchestraDB {
  private static instance: Database.Database | null = null;
  private static workspaceRoot: string | null = null;

  private constructor() {
    // Private constructor - use getInstance()
  }

  /**
   * Get database instance (lazy initialization)
   * @param workspaceRoot Absolute path to workspace root
   * @returns Database instance
   * @throws DatabaseError if database cannot be opened
   */
  static getInstance(workspaceRoot: string): Database.Database {
    // Return existing instance if same workspace
    if (this.instance && this.workspaceRoot === workspaceRoot) {
      return this.instance;
    }

    // Close existing instance if different workspace
    if (this.instance) {
      this.close();
    }

    try {
      const dbPath = getOrchestraDBPath(workspaceRoot);

      // Open in read-only mode (Phase 1)
      this.instance = new Database(dbPath, {
        readonly: true,
        fileMustExist: true,
      });

      this.workspaceRoot = workspaceRoot;

      // Configure SQLite for optimal read performance
      this.instance.pragma("journal_mode = WAL"); // Write-Ahead Logging
      this.instance.pragma("synchronous = NORMAL");
      this.instance.pragma("cache_size = -64000"); // 64MB cache
      this.instance.pragma("temp_store = MEMORY");

      return this.instance;
    } catch (error) {
      throw new DatabaseError("Failed to open Orchestra database", {
        workspaceRoot,
        error,
      });
    }
  }

  /**
   * Close database connection
   */
  static close(): void {
    if (this.instance) {
      try {
        this.instance.close();
      } catch (error) {
        console.error("Error closing database:", error);
      } finally {
        this.instance = null;
        this.workspaceRoot = null;
      }
    }
  }

  /**
   * Check if database is open
   */
  static isOpen(): boolean {
    return this.instance !== null && this.instance.open;
  }

  /**
   * Get current workspace root
   */
  static getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }
}
